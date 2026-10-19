/**
 * Competition mode: an invite-only, 4-round event, each round in a different format.
 *
 * The lobby overlay handles creating a competition, joining with an invite
 * code or link, the round list (rules, locked/unlocked, resume), and the
 * leaderboard. In a round, the normal game runs with three hooks:
 *   - competitionAfterShot(): ends a Skills hole after the tee shot
 *   - competitionHoleDone(): replaces the normal end-of-hole scorecard
 *   - competitionQuit(): returns to the lobby, keeping saved progress
 *
 * URLs: ?c=<code> opens a competition; adding &admin=<code> unlocks admin tools.
 */
import { $, params, store } from "./config.js";
import { HOLES, HOLE, PAR, TEE, holeIndex } from "./course.js";
import { cupPos } from "./props.js";
import { ball, curLie } from "./player.js";
import { introFly, startHole } from "./game.js";
import { setDiff, toast } from "./ui.js";
import { audioInit } from "./audio.js";
import { game } from "./state.js";
import * as LB from "./leaderboard.js";

const DIFF_NAMES = { easy: "Easy", medium: "Medium", pro: "Pro" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const baseUrl = () => location.origin + location.pathname;

// What this device knows about a competition: {pid, token, name} and admin code.
const meKey = (id) => "cgComp_" + id;
const getMe = (id) => JSON.parse(store[meKey(id)] || "null");
const getAdmin = (id) => store["cgAdmin_" + id] || null;

let view = null; // { id, comp, me, admin, doc, standings, tab }
game.comp = null; // active competition round, or null in normal play
game.skillResult = null; // Skills round: result of the current challenge

// ---------- overlay helpers ----------
function show(html) {
  $("compBox").innerHTML = html;
  $("compO").style.display = "flex";
  $("start").style.display = "none";
  $("hud").style.display = "none";
  $("ctl").style.display = "none";
}
function hide() {
  $("compO").style.display = "none";
}
function busy(msg = "Loading…") {
  show(`<h2>🏆 Competition</h2><div class="sm" style="margin:18px">${msg}</div>`);
}
function fail(e, back) {
  show(
    `<h2>🏆 Competition</h2><div class="cerr">${esc(e.message || e)}</div><button class="big" id="cBack">Back</button>`,
  );
  $("cBack").onclick = back || openHome;
}
function closeToMenu() {
  hide();
  history.replaceState(null, "", baseUrl() + (params.has("debug") ? "?debug=1" : ""));
  $("start").style.display = "flex";
}

// ---------- home: create or join ----------
export function openHome() {
  const last = store.cgLastComp;
  show(`<h2>🏆 Competition</h2>
  ${last ? `<div class="csec"><button class="big" id="jLast">Open my last competition</button></div>` : ""}
  <div class="csec"><b>Join with an invite code</b>
    <input id="jCode" placeholder="invite code" autocomplete="off" maxlength="12">
    <button class="big" id="jGo">Open</button></div>
  <div class="csec"><b>Create a competition</b>
    <input id="nName" placeholder="Competition name" maxlength="60">
    <div class="grp" id="nDiff">${Object.entries(DIFF_NAMES)
      .map(([k, n]) => `<button data-v="${k}" class="${k == "medium" ? "on" : ""}">${n}</button>`)
      .join("")}</div>
    <div class="sm">Everyone plays on this difficulty. 4 rounds: ${LB.FORMATS.map((f) => f.name).join(" · ")}</div>
    <button class="big" id="nGo">Create</button></div>
  <button id="cClose">Close</button>`);
  let diff = "medium";
  document.querySelectorAll("#nDiff button").forEach(
    (b) =>
      (b.onclick = () => {
        diff = b.dataset.v;
        document.querySelectorAll("#nDiff button").forEach((x) => x.classList.toggle("on", x == b));
      }),
  );
  if ($("jLast")) $("jLast").onclick = () => openCompetition(last);
  $("jGo").onclick = () => {
    const code = $("jCode").value.trim().toLowerCase();
    if (code) openCompetition(code);
  };
  $("nGo").onclick = async () => {
    const name = $("nName").value.trim();
    if (!name) return toast("Give it a name", 1200);
    busy("Creating…");
    try {
      const { id, adminCode } = await LB.createCompetition(name, diff);
      store["cgAdmin_" + id] = adminCode;
      openCompetition(id, { justCreated: adminCode });
    } catch (e) {
      fail(e);
    }
  };
  $("cClose").onclick = closeToMenu;
}

// ---------- competition lobby ----------
export async function openCompetition(id, opts = {}) {
  busy();
  try {
    const comp = await LB.loadCompetition(id);
    if (!comp) throw new Error("No competition with that code");
    const urlAdmin = params.get("admin");
    if (urlAdmin && (await LB.isAdmin(id, comp, urlAdmin))) store["cgAdmin_" + id] = urlAdmin;
    const admin = (await LB.isAdmin(id, comp, getAdmin(id))) ? getAdmin(id) : null;
    let me = getMe(id);
    if (me && !comp.players.some((p) => p.pid == me.pid)) me = null; // removed by admin
    const doc = me ? await LB.loadPlayer(id, me.pid) : null;
    const standings = await LB.loadStandings(id, comp);
    store.cgLastComp = id;
    view = { id, comp, me, admin, doc, standings, tab: view?.id == id ? view.tab : "overall", ...opts };
    history.replaceState(null, "", baseUrl() + "?c=" + id + (params.has("debug") ? "&debug=1" : ""));
    renderLobby();
  } catch (e) {
    fail(e);
  }
}

function renderLobby() {
  const { id, comp, me, admin, doc, standings } = view;
  const invite = baseUrl() + "?c=" + id;
  let h = `<h2>🏆 ${esc(comp.name)}</h2><div class="sm">Coplicks Front 9 · ${DIFF_NAMES[comp.diff]} · ${comp.players.length} player${comp.players.length == 1 ? "" : "s"}</div>`;
  if (view.justCreated)
    h += `<div class="csec ok"><b>Competition created!</b><div class="sm">Keep the admin link private. It lets you manage players on any device:</div>
      <div class="mono">${esc(invite + "&admin=" + view.justCreated)}</div></div>`;
  h += `<div class="csec"><b>Invite</b> <span class="sm">code <span class="mono">${id}</span></span>
    <div class="mono">${esc(invite)}</div><button id="cCopy">Copy invite link</button>${navigator.share ? ' <button id="cShare">Share…</button>' : ""}</div>`;
  if (!me)
    h += `<div class="csec"><b>Join this competition</b><input id="pName" placeholder="Your player name" maxlength="20"><button class="big" id="pJoin">Join</button></div>`;
  else h += roundsHTML(doc);
  h += boardHTML(standings);
  if (admin) h += adminHTML(standings);
  h += `<div><button id="cRefresh">⟳ Refresh</button> <button id="cOther">Other / new comp</button> <button id="cClose">Main menu</button></div>`;
  show(h);
  $("cCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      toast("Invite link copied", 1200);
    } catch {
      prompt("Copy this invite link", invite);
    }
  };
  if ($("cShare"))
    $("cShare").onclick = () =>
      navigator.share({ title: comp.name, text: "Join my Coplicks golf comp", url: invite });
  if ($("pJoin"))
    $("pJoin").onclick = async () => {
      const name = $("pName").value;
      busy("Joining…");
      try {
        const m = await LB.joinCompetition(id, name);
        store[meKey(id)] = JSON.stringify(m);
        openCompetition(id);
      } catch (e) {
        fail(e, () => openCompetition(id));
      }
    };
  document.querySelectorAll("[data-round]").forEach((b) => (b.onclick = () => showRules(+b.dataset.round)));
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        view.tab = b.dataset.tab;
        renderLobby();
      }),
  );
  document.querySelectorAll("[data-kick]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Remove " + b.dataset.name + " and their scores?")) return;
        busy("Removing…");
        await LB.removePlayer(id, b.dataset.kick);
        openCompetition(id);
      }),
  );
  $("cRefresh").onclick = () => openCompetition(id);
  $("cOther").onclick = openHome;
  $("cClose").onclick = closeToMenu;
}

function roundsHTML(doc) {
  return (
    `<div class="csec"><b>Your rounds</b> <span class="sm">· playing as ${esc(view.me.name)}</span><div class="rounds">` +
    LB.FORMATS.map((f, i) => {
      const r = doc?.rounds?.[i];
      const open = LB.roundUnlocked(doc, i);
      const sum = LB.roundSummary(i, doc);
      const state = r?.submitted
        ? `✔ ${sum ? esc(sum.label) : "submitted"}`
        : r
          ? `▶ resume (${r.res.filter((v) => v != null).length}/${f.holes.length})`
          : open
            ? "▶ play"
            : "🔒 locked";
      return `<button class="rnd ${r?.submitted ? "done" : open ? "open" : "lock"}" data-round="${i}"><small>Round ${i + 1}</small><b>${f.name}</b><span>${state}</span></button>`;
    }).join("") +
    `</div></div>`
  );
}

function boardHTML(st) {
  const tabs = ["overall", "0", "1", "2", "3"];
  let h = `<div class="csec"><b>Leaderboard</b><div class="grp tabs">${tabs
    .map(
      (t) =>
        `<button data-tab="${t}" class="${view.tab == t ? "on" : ""}">${t == "overall" ? "Overall" : "R" + (+t + 1)}</button>`,
    )
    .join("")}</div>`;
  if (view.tab == "overall") {
    h += `<table class="lb"><tr><th>#</th><th>Player</th>${LB.FORMATS.map((_, i) => `<th>R${i + 1}</th>`).join("")}<th>Pts</th></tr>`;
    h += st.overall
      .map(
        (o) =>
          `<tr class="${o.pid == view.me?.pid ? "me" : ""}"><td>${o.thru ? o.place : "–"}</td><td>${esc(o.name)}</td>${o.per.map((p) => `<td>${p ?? "·"}</td>`).join("")}<td><b>${o.total}</b></td></tr>`,
      )
      .join("");
    h += `</table><div class="sm">Place points each round: 25-18-15-12-10-8-6-4-2-1</div>`;
  } else {
    const rd = st.rounds[+view.tab];
    h += `<div class="sm">${rd.format.name}</div><table class="lb"><tr><th>#</th><th>Player</th><th>Result</th><th>Pts</th></tr>`;
    h += rd.rows
      .map(
        (r) =>
          `<tr class="${r.pid == view.me?.pid ? "me" : ""}"><td>${r.place}</td><td>${esc(r.name)}</td><td>${esc(r.label)}</td><td>${r.points}</td></tr>`,
      )
      .join("");
    if (!rd.rows.length) h += `<tr><td colspan="4" class="sm">No finished rounds yet</td></tr>`;
    h += `</table>`;
    if (rd.flagged.length)
      h += `<div class="sm">⚠ Not counted: ${rd.flagged.map((f) => esc(f.name) + " (" + f.why + ")").join(", ")}</div>`;
  }
  return h + `</div>`;
}

function adminHTML(st) {
  return (
    `<div class="csec"><b>Admin</b><div class="sm">Admin link (keep private):</div><div class="mono">${esc(baseUrl() + "?c=" + view.id + "&admin=" + view.admin)}</div>` +
    st.players
      .map(
        (p) =>
          `<div class="arow">${esc(p.name)} <button data-kick="${p.pid}" data-name="${esc(p.name)}">Remove</button></div>`,
      )
      .join("") +
    `</div>`
  );
}

// ---------- rules & round start ----------
function showRules(ri) {
  const f = LB.FORMATS[ri];
  const doc = view.doc;
  if (!LB.roundUnlocked(doc, ri)) return toast("Finish Round " + ri + " first 🔒", 1500);
  if (doc?.rounds?.[ri]?.submitted) return toast("Already submitted ✔", 1200);
  let extra = "";
  if (f.key == "stableford")
    extra = `<div class="sm">Your handicap: <b>${LB.handicapFrom(LB.roundSummary(0, doc)?.strokes)}</b></div>`;
  const holes = f.holes.map((i) => HOLES[i].n).join(", ");
  show(`<h2>Round ${ri + 1} · ${f.name}</h2><div class="sm">Holes ${holes} · ${DIFF_NAMES[view.comp.diff]} difficulty</div>
    <ul class="rules">${f.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${extra}
    <div class="sm">One go only: every hole is saved as soon as you finish it, and you can stop and resume between holes.</div>
    <button class="big" id="rGo">Tee off ⛳</button><div><button id="rBack">Back</button></div>`);
  $("rBack").onclick = renderLobby;
  $("rGo").onclick = () => startRound(ri);
}

async function startRound(ri) {
  busy("Starting round…");
  try {
    view.doc = await LB.markStarted(view.id, view.me, ri);
  } catch (e) {
    return fail(e, () => openCompetition(view.id));
  }
  const f = LB.FORMATS[ri];
  const r = view.doc.rounds[ri];
  const pos = r.res.findIndex((v) => v == null);
  game.comp = { ri, format: f, pos: pos < 0 ? r.res.length : pos, res: r.res.slice() };
  setDiff(view.comp.diff);
  game.scores = [];
  game.holeStats = [];
  // carry finished stroke-play holes so the HUD's running total is right
  f.holes.forEach((h, i) => {
    if (f.key != "skills" && r.res[i] != null) game.scores[h] = r.res[i];
  });
  hide();
  audioInit();
  playPos();
}

function playPos() {
  const c = game.comp;
  startHole(c.format.holes[c.pos]);
  c.teePos = ball.clone();
  game.skillResult = null;
  introFly();
  if (c.format.key == "skills")
    setTimeout(
      () =>
        toast(
          HOLE.par == 3
            ? "Closest to the Pin 🎯<br><small>one tee shot</small>"
            : "Longest Drive 💥<br><small>finish on the fairway</small>",
          2200,
        ),
      300,
    );
}

// ---------- in-round hooks ----------
/** Called before the normal post-shot settle. Returns true if it took over. */
export function competitionAfterShot() {
  const c = game.comp;
  if (!c || c.format.key != "skills" || game.strokes < 1) return false;
  if (HOLE.par == 3)
    game.skillResult =
      game.strokes > 1 ? 99 : +Math.min(99, Math.hypot(ball.x - cupPos.x, ball.z - cupPos.z)).toFixed(1);
  else
    game.skillResult =
      game.strokes > 1 || curLie() != "fairway"
        ? 0
        : +Math.hypot(ball.x - c.teePos.x, ball.z - c.teePos.z).toFixed(1);
  game.state = "done";
  toast(
    HOLE.par == 3
      ? game.skillResult >= 99
        ? "Penalty – 99 m"
        : game.skillResult + " m from the pin"
      : game.skillResult
        ? "Drive: " + Math.round(game.skillResult) + " m 💥"
        : "Missed the fairway – no distance",
    1800,
  );
  setTimeout(competitionHoleDone, 1900);
  return true;
}

/** Called instead of the normal scorecard when a hole ends in a competition round. */
export async function competitionHoleDone() {
  const c = game.comp;
  const f = c.format;
  let value = game.strokes;
  if (f.key == "skills") value = game.skillResult ?? 0; // holed tee shot on a par 3 = 0 m
  if (f.key != "skills") game.scores[holeIndex] = game.strokes;
  c.res[c.pos] = value;
  $("card").innerHTML = `<h2>Saving…</h2>`;
  $("cardO").style.display = "flex";
  let saved = false;
  for (let tries = 0; tries < 3 && !saved; tries++) {
    try {
      view.doc = await LB.saveHole(view.id, view.me, c.ri, c.pos, value);
      saved = true;
    } catch (e) {
      if (/submitted|Not your/.test(e.message)) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const last = c.pos >= f.holes.length - 1;
  $("card").innerHTML =
    `<h2>${resultTitle(f, value)}</h2><div class="sm">Round ${c.ri + 1} · ${f.name} · ${view.comp.name}</div>
    ${roundCardHTML(c)}${saved ? "" : '<div class="cerr">Could not save to the leaderboard. Check your connection; this hole will be retried.</div>'}
    <div>${last ? '<button class="big" id="cnFin">See leaderboard 🏆</button>' : '<button class="big" id="cnNext">Next ➜</button>'}</div>
    <div><button id="cnQuit">Save &amp; exit</button></div>`;
  if (!saved) c.res[c.pos] = null;
  const next = () => {
    $("cardO").style.display = "none";
    $("card").innerHTML = "";
    if (saved) c.pos++;
    playPos();
  };
  if ($("cnNext")) $("cnNext").onclick = next;
  if ($("cnFin"))
    $("cnFin").onclick = () => {
      $("cardO").style.display = "none";
      $("card").innerHTML = "";
      if (!saved) return playPos();
      game.comp = null;
      openCompetition(view.id);
    };
  $("cnQuit").onclick = () => {
    $("cardO").style.display = "none";
    $("card").innerHTML = "";
    competitionQuit();
  };
}

function resultTitle(f, v) {
  if (f.key == "skills")
    return HOLE.par == 3 ? (v >= 99 ? "Penalty" : v + " m") : v ? Math.round(v) + " m drive" : "No distance";
  const d = v - PAR;
  return "Hole " + HOLE.n + " · " + (d == 0 ? "Par" : d > 0 ? "+" + d : d);
}

function roundCardHTML(c) {
  const f = c.format;
  if (f.key == "skills")
    return `<table class="lb"><tr><th>Challenge</th><th>Result</th></tr>${f.holes
      .map(
        (h, i) =>
          `<tr><td>${HOLES[h].par == 3 ? "CTP · hole " + HOLES[h].n : "Long drive · hole " + HOLES[h].n}</td><td>${c.res[i] == null ? "" : HOLES[h].par == 3 ? c.res[i] + " m" : c.res[i] ? Math.round(c.res[i]) + " m" : "—"}</td></tr>`,
      )
      .join("")}</table>`;
  const hcp = LB.handicapFrom(LB.roundSummary(0, view.doc)?.strokes);
  const line = (lab, fn) =>
    `<tr><td>${lab}</td>${f.holes.map((h, i) => `<td>${c.res[i] == null ? "" : fn(c.res[i], h)}</td>`).join("")}</tr>`;
  let rows = line("Score", (v) => v);
  let foot = "";
  const done = c.res.filter((v) => v != null);
  if (f.key == "stroke") foot = "Total " + done.reduce((a, b) => a + b, 0);
  if (f.key == "stableford") {
    rows += line("Pts", (v, h) => LB.stablefordPoints(v, h, hcp));
    foot =
      "Points " +
      c.res.reduce((a, v, i) => a + (v == null ? 0 : LB.stablefordPoints(v, i, hcp)), 0) +
      " · hcp " +
      hcp;
  }
  if (f.key == "match") {
    let run = 0;
    rows += line("Match", (v, h) => LB.matchLabel((run += LB.matchResult(v, h))));
    foot = "Match vs par: " + LB.matchLabel(run);
  }
  return `<div class="sct"><table><tr><th>Hole</th>${f.holes.map((h) => `<th>${HOLES[h].n}</th>`).join("")}</tr>
    <tr><td>Par</td>${f.holes.map((h) => `<td>${HOLES[h].par}</td>`).join("")}</tr>${rows}</table></div><div class="sm" style="font-size:15px">${foot}</div>`;
}

/** Leave a round mid-way (progress is already saved hole by hole). */
export function competitionQuit() {
  const id = view.id;
  game.comp = null;
  game.state = "start";
  game.camMode = "orbit";
  $("hud").style.display = "none";
  $("ctl").style.display = "none";
  $("flyO").style.display = "none";
  openCompetition(id);
}

// ---------- entry ----------
$("compB").onclick = openHome;
export function competitionOnLoad() {
  const id = params.get("c");
  if (id) openCompetition(id);
}
export const _test = { getView: () => view };
