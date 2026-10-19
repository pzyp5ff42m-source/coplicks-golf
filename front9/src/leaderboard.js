/**
 * Competition storage and standings.
 *
 * Backend: textdb.dev, a free key/value text store. Writes need no account
 * and it allows cross-origin requests. Every document is plain JSON under a
 * hard-to-guess key:
 *   cgf9-<compId>          competition: name, difficulty, adminHash, players[]
 *   cgf9-<compId>-<pid>    one player: tokenHash and per-round progress
 * Each player writes only their own document, so two players can't overwrite
 * each other. The competition document is only rewritten when someone joins,
 * and that write is checked afterwards and retried if it lost a race.
 *
 * Standings are recalculated in the browser from the raw hole scores, and
 * implausible entries are left out (see checkRound).
 */
import { HOLES } from "./course.js";

const API = "https://textdb.dev/api/data/";
const PREFIX = "cgf9-";

// ---------- formats ----------
export const FORMATS = [
  {
    key: "stroke",
    name: "Stroke Play",
    holes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    rules: [
      "Every shot counts over all 9 holes.",
      "Lowest total wins.",
      "Each hole is capped at par + 6 (the game picks the ball up).",
    ],
  },
  {
    key: "stableford",
    name: "Stableford",
    holes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    rules: [
      "Points per hole: 2 for a net par, +1 for each stroke better, 1 for a net bogey, 0 for worse.",
      "Your handicap comes from your Round 1 score: ¾ × (R1 − 34), from 0 to 18.",
      "Handicap strokes go on the hardest holes first (stroke index).",
      "Most points wins.",
    ],
  },
  {
    key: "match",
    name: "Match Play vs Par",
    holes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    rules: [
      "Each hole is a match against par: birdie or better wins it, par halves it, bogey or worse loses it.",
      "Your result is holes won minus holes lost (e.g. 2 UP).",
      "Most holes up wins. Ties are split by fewest strokes.",
    ],
  },
  {
    key: "skills",
    name: "Skills Challenge",
    holes: [2, 3, 6],
    rules: [
      "Three shots, one attempt each.",
      "Closest to the Pin on the par-3 3rd and 7th: your tee shot's distance to the hole. Water or a penalty = 99 m.",
      "Longest Drive on the 4th: tee-shot distance, but only if the ball finishes on the fairway.",
      "Combined CTP distance and Longest Drive are ranked separately. Your round points are the average of the two.",
    ],
  },
];

/** Hole difficulty order (stroke index) used for handicap strokes: 1 = hardest. */
export const STROKE_INDEX = [2, 4, 9, 1, 5, 7, 8, 6, 3];
/** Points for 1st, 2nd, ... in each round (ties share the better place). */
const PLACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// ---------- ids & hashing ----------
const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";
export function randomId(n) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return [...a].map((v) => ALPHA[v % ALPHA.length]).join("");
}
export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- low-level storage ----------
async function getDoc(key) {
  const r = await fetch(API + PREFIX + key + "?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("Leaderboard server error " + r.status);
  const t = await r.text();
  if (!t.trim()) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
async function putDoc(key, doc) {
  const r = await fetch(API + PREFIX + key, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(doc),
  });
  if (!r.ok) throw new Error("Could not save (" + r.status + ")");
}
/** Blank a document (textdb has no delete; an empty value reads back as missing). */
async function clearDoc(key) {
  await fetch(API + PREFIX + key, { method: "POST", headers: { "content-type": "text/plain" }, body: "" });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- competitions ----------
export async function createCompetition(name, diffKey) {
  const id = randomId(10),
    adminCode = randomId(12);
  const comp = {
    v: 1,
    name: name.slice(0, 60),
    diff: diffKey,
    created: Date.now(),
    formats: FORMATS.map((f) => f.key),
    adminHash: await sha256(id + ":" + adminCode),
    players: [],
  };
  await putDoc(id, comp);
  return { id, adminCode, comp };
}
export const loadCompetition = (id) => getDoc(id);
export async function isAdmin(id, comp, code) {
  return !!code && (await sha256(id + ":" + code)) == comp.adminHash;
}

/** Join (or rejoin) a competition. Returns {pid, token} to keep on this device. */
export async function joinCompetition(id, name) {
  name = name.trim().slice(0, 20);
  if (!name) throw new Error("Enter a player name");
  const pid = randomId(8),
    token = randomId(16);
  for (let attempt = 0; attempt < 6; attempt++) {
    const comp = await getDoc(id);
    if (!comp) throw new Error("Competition not found");
    if (comp.players.some((p) => p.name.toLowerCase() == name.toLowerCase() && p.pid != pid))
      throw new Error("That name is taken in this competition");
    if (!comp.players.some((p) => p.pid == pid)) comp.players.push({ pid, name, joined: Date.now() });
    await putDoc(id, comp);
    await sleep(500 + Math.random() * 700);
    const check = await getDoc(id);
    if (check && check.players.some((p) => p.pid == pid)) {
      await putDoc(id + "-" + pid, { pid, name, tokenHash: await sha256(token), rounds: {} });
      return { pid, token, name };
    }
  }
  throw new Error("Busy – please try joining again");
}

export async function removePlayer(id, pid) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const comp = await getDoc(id);
    comp.players = comp.players.filter((p) => p.pid != pid);
    await putDoc(id, comp);
    await sleep(500);
    const check = await getDoc(id);
    if (!check.players.some((p) => p.pid == pid)) break;
  }
  await clearDoc(id + "-" + pid);
}

/** Delete a whole competition and all its player documents. */
export async function deleteCompetition(id) {
  const comp = await getDoc(id);
  for (const p of comp?.players || []) await clearDoc(id + "-" + p.pid);
  await clearDoc(id);
}

// ---------- player progress ----------
export const loadPlayer = (id, pid) => getDoc(id + "-" + pid);

/**
 * Record one hole result for a round. Results can't be changed once written
 * (one submission per hole and per round). Returns the updated player doc.
 */
export async function saveHole(id, me, roundIdx, holePos, value) {
  const doc = await getDoc(id + "-" + me.pid);
  if (!doc || doc.tokenHash != (await sha256(me.token))) throw new Error("Not your player record");
  const r = (doc.rounds[roundIdx] ??= { started: Date.now(), res: [], t: [] });
  if (r.submitted) throw new Error("Round already submitted");
  if (r.res[holePos] != null) return doc;
  r.res[holePos] = value;
  r.t[holePos] = Date.now();
  if (r.res.filter((v) => v != null).length == FORMATS[roundIdx].holes.length) r.submitted = Date.now();
  await putDoc(id + "-" + me.pid, doc);
  return doc;
}
export async function markStarted(id, me, roundIdx) {
  const doc = await getDoc(id + "-" + me.pid);
  if (!doc || doc.tokenHash != (await sha256(me.token))) throw new Error("Not your player record");
  if (!doc.rounds[roundIdx]) {
    doc.rounds[roundIdx] = { started: Date.now(), res: [], t: [] };
    await putDoc(id + "-" + me.pid, doc);
  }
  return doc;
}
/** Round r is open once every earlier round is submitted. */
export function roundUnlocked(doc, r) {
  for (let i = 0; i < r; i++) if (!doc?.rounds?.[i]?.submitted) return false;
  return true;
}

// ---------- scoring ----------
const PAR = HOLES.map((h) => h.par);
export function handicapFrom(r1Total) {
  return r1Total == null ? 0 : Math.max(0, Math.min(18, Math.round(0.75 * (r1Total - 34))));
}
function shotsReceived(hcp, holeIdx) {
  const si = STROKE_INDEX[holeIdx];
  return Math.floor(hcp / 9) + (si <= hcp % 9 ? 1 : 0);
}
export const stablefordPoints = (strokes, holeIdx, hcp) =>
  Math.max(0, 2 + PAR[holeIdx] + shotsReceived(hcp, holeIdx) - strokes);
export const matchResult = (strokes, holeIdx) =>
  strokes < PAR[holeIdx] ? 1 : strokes == PAR[holeIdx] ? 0 : -1;
export const matchLabel = (n) => (n == 0 ? "AS" : n > 0 ? n + " UP" : -n + " DN");

/** Plausibility check of a submitted round. Returns null if OK, else a reason. */
export function checkRound(roundIdx, r) {
  const f = FORMATS[roundIdx];
  if (!r?.submitted || r.res.length != f.holes.length) return "incomplete";
  const t = [r.started, ...r.t];
  for (let i = 1; i < t.length; i++) if (!(t[i] - t[i - 1] >= 4000)) return "too fast";
  for (let i = 0; i < f.holes.length; i++) {
    const v = r.res[i],
      h = f.holes[i];
    if (f.key == "skills") {
      if (typeof v != "number" || v < 0 || v > (h == 3 ? 330 : 99)) return "bad value";
    } else if (!Number.isInteger(v) || v < 1 || v > PAR[h] + 6) return "bad score";
  }
  return null;
}

/** Summary numbers for one player's round (or null if not playable/valid). */
export function roundSummary(roundIdx, doc) {
  const r = doc?.rounds?.[roundIdx];
  if (!r || checkRound(roundIdx, r)) return null;
  const f = FORMATS[roundIdx];
  const strokes = r.res.reduce((a, b) => a + b, 0);
  if (f.key == "stroke")
    return { strokes, sort: strokes, label: strokes + " (" + fmtPar(strokes - 34) + ")" };
  if (f.key == "stableford") {
    const hcp = handicapFrom(roundSummary(0, doc)?.strokes);
    const pts = r.res.reduce((a, s, i) => a + stablefordPoints(s, i, hcp), 0);
    return { strokes, pts, hcp, sort: -pts, label: pts + " pts (hcp " + hcp + ")" };
  }
  if (f.key == "match") {
    const up = r.res.reduce((a, s, i) => a + matchResult(s, i), 0);
    return { strokes, up, sort: -up + strokes / 1000, label: matchLabel(up) + " · " + strokes };
  }
  const ctp = +(r.res[0] + r.res[2]).toFixed(1),
    drive = r.res[1];
  return {
    ctp,
    drive,
    label: `CTP ${ctp} m · LD ${drive ? Math.round(drive) + " m" : "—"}`,
  };
}
const fmtPar = (d) => (d == 0 ? "E" : d > 0 ? "+" + d : "" + d);

/** Rank rows by key (ascending); ties share the better place. Adds .place. */
function rank(rows, key) {
  rows.sort((a, b) => a[key] - b[key]);
  rows.forEach((r, i) => (r.place = i > 0 && rows[i - 1][key] == r[key] ? rows[i - 1].place : i + 1));
  return rows;
}
const pointsFor = (place) => PLACE_POINTS[place - 1] || 0;

/** Load every player and build per-round and overall standings. */
export async function loadStandings(id, comp) {
  const docs = await Promise.all(comp.players.map((p) => loadPlayer(id, p.pid).catch(() => null)));
  const players = comp.players.map((p, i) => ({ ...p, doc: docs[i] }));
  const rounds = FORMATS.map((f, ri) => {
    const rows = [],
      flagged = [];
    for (const p of players) {
      const r = p.doc?.rounds?.[ri];
      if (!r?.submitted) continue;
      const why = checkRound(ri, r);
      if (why) {
        flagged.push({ name: p.name, why });
        continue;
      }
      rows.push({ pid: p.pid, name: p.name, ...roundSummary(ri, p.doc) });
    }
    if (f.key == "skills") {
      rank(rows, "ctp").forEach((r) => (r.ctpPts = pointsFor(r.place)));
      rows.forEach((r) => (r.negDrive = -r.drive));
      rank(rows, "negDrive").forEach((r) => (r.ldPts = pointsFor(r.place)));
      rows.forEach((r) => (r.points = (r.ctpPts + r.ldPts) / 2));
      rows.forEach((r) => (r.negPts = -r.points));
      rank(rows, "negPts");
    } else rank(rows, "sort").forEach((r) => (r.points = pointsFor(r.place)));
    return { format: f, rows, flagged };
  });
  const overall = players.map((p) => {
    const per = rounds.map((rd) => rd.rows.find((r) => r.pid == p.pid)?.points ?? null);
    const thru = per.filter((v) => v != null).length;
    const strokesNow = p.doc?.rounds ? Object.keys(p.doc.rounds).length : 0;
    return {
      pid: p.pid,
      name: p.name,
      per,
      thru,
      total: per.reduce((a, b) => a + (b || 0), 0),
      started: strokesNow,
    };
  });
  overall.forEach((o) => (o.neg = -o.total));
  rank(overall, "neg");
  return { players, rounds, overall };
}
