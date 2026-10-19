/**
 * Shot flow: shooting, ball updates, hole-out, replays and starting holes/rounds.
 */
import * as THREE from "three";
import { $ } from "./config.js";
import { PAR, TEE, groundY, hdir } from "./course.js";
import { cupPos } from "./props.js";
import { SFX } from "./audio.js";
import { mkBall, newWind, step, surfY } from "./physics.js";
import {
  aimAtPin,
  autoClub,
  ball,
  club,
  compensate,
  curLie,
  lastSafe,
  launchVel,
  shapeCurve,
} from "./player.js";
import { gridGrp, prevL, ringM, setLine, tracer, updPreview } from "./preview.js";
import { aimCamTarget, camLook, camPos, tl, tp } from "./camera.js";
import { loadHole } from "./holes.js";
import { hud, toast, uiMode } from "./ui.js";
import { showCard } from "./scorecard.js";
import { setPreviewPower } from "./swing.js";
import { competitionAfterShot } from "./competition.js";
import { game } from "./state.js";

// ---------- shot flow ----------
let pending = null;
const later = (s, fn) => {
  pending = { t: game.time + s, fn };
};
game.toastT = undefined;
export function shoot(power, accErr = 0) {
  if (game.state != "aim") return;
  const c = club(),
    l = curLie();
  game.strokes++;
  lastSafe.copy(ball);
  if (c.n == "Putter" && (l == "green" || l == "fringe")) game.stats.putts++;
  const pw = Math.min(1.08, Math.max(0.02, power));
  let curve = shapeCurve(c),
    dirE = 0;
  if (c.n == "Putter") {
    dirE = accErr * 0.06;
  } else {
    curve += accErr * game.diff.curveK;
    dirE = accErr * 0.12;
    if (power > 1.0) curve += (Math.random() - 0.5) * game.diff.curveK * 0.3;
  }
  const a = game.aim + compensate(c, pw, l, shapeCurve(c)) + dirE;
  const v = launchVel(c, pw, a, l);
  game.cur = mkBall(ball, v, c, {
    curve,
    backspin: pw,
    lieMul: l == "bunker" ? 0.4 : l == "rough" ? 1.6 : 1,
  });
  game.shotRec = [ball.clone()];
  game.cur.recT = 0;
  game.landCam = null;
  if (game.cur.phase == "air") {
    const b = mkBall(ball, v, c, { curve });
    let n = 0;
    while (b.phase == "air" && !b.done && n++ < 6000) step(b, 1 / 60);
    const carry = Math.hypot(b.p.x - ball.x, b.p.z - ball.z);
    if (carry > 60) {
      const dx = (b.p.x - ball.x) / carry,
        dz = (b.p.z - ball.z) / carry;
      const nearG = Math.hypot(b.p.x - cupPos.x, b.p.z - cupPos.z) < 35;
      const lp = nearG
        ? new THREE.Vector3(cupPos.x + dx * 16 - dz * 5, 0, cupPos.z + dz * 16 + dx * 5)
        : new THREE.Vector3(b.p.x + dx * 28 + -dz * 9, 0, b.p.z + dz * 28 + dx * 9);
      lp.y = groundY(lp.x, lp.z) + (nearG ? 3.5 : 6);
      game.cur.landAt = b.t * 0.6;
      game.cur.landPos = lp;
    }
  }
  game.state = "fly";
  game.camMode = "chase";
  gridGrp.visible = false;
  prevL.visible = ringM.visible = false;
  tracer.visible = false;
  SFX.hit(pw, c.n == "Putter");
  game.meterS = "idle";
  hud();
  $("replayB").disabled = true;
}
export function update(dt) {
  game.time += dt;
  if (pending && game.time >= pending.t) {
    const f = pending.fn;
    pending = null;
    f();
  }
  if (game.state == "fly" && game.cur) {
    const n = 4;
    for (let i = 0; i < n && !game.cur.done; i++) {
      step(game.cur, dt / n);
      game.cur.recT += dt / n;
      if (game.cur.recT >= 1 / 30) {
        game.cur.recT = 0;
        game.shotRec.push(game.cur.p.clone());
      }
    }
    while (game.cur.ev.length) {
      const e = game.cur.ev.shift();
      if (e == "land") {
        SFX.land(game.cur.club.n != "Driver");
      } else if (e == "bounce") SFX.land(true);
      else if (e == "sand") {
        SFX.sand();
      } else if (e == "tree") {
        SFX.tree();
        toast("Timber! 🌳", 1000);
      }
    }
    ball.copy(game.cur.p);
    if (game.cur.landPos && game.cur.t > game.cur.landAt && game.camMode == "chase") {
      game.landCam = game.cur.landPos;
      game.camMode = "land";
      game.camCut = true;
    }
    if (game.cur.phase == "air" || game.cur.t < 0.2) {
      setLine(tracer, game.shotRec.concat([ball.clone()]));
    }
    if (game.cur.done) {
      game.shotRec.push(ball.clone());
      game.lastRec = { pts: game.shotRec.slice(), club: game.cur.club.n };
      const res = game.cur.res;
      game.cur = null;
      game.state = "wait";
      if (res == "holed") holeOut();
      else if (res == "water") {
        game.strokes++;
        SFX.splash();
        toast("Splash! 💦<br><small>+1 penalty stroke · drop</small>");
        later(1.6, () => {
          ball.copy(lastSafe);
          settle();
        });
      } else {
        const l = curLie();
        if (l == "bunker") toast("In the bunker 🏖️");
        else if (l == "green" && game.strokes <= PAR - 2) toast("On in regulation 👍", 1200);
        later(1.0, settle);
      }
    }
  }
  if (game.state == "replay") updReplay(dt);
}
export function settle() {
  if (competitionAfterShot()) return;
  if (game.strokes >= PAR + 6) {
    game.state = "done";
    toast("Picked up 🫳<br><small>max " + (PAR + 6) + " on this hole</small>", 2000);
    setTimeout(showCard, 2100);
    return;
  }
  game.state = "aim";
  const l = curLie();
  ball.y = surfY(ball.x, ball.z, l);
  if (game.strokes == 1 && game.stats.fir === null) game.stats.fir = l == "fairway";
  if (l == "green" && game.strokes <= PAR - 2) game.stats.gir = true;
  aimAtPin();
  autoClub();
  game.camMode = "aim";
  gridGrp.visible = l == "green" || l == "fringe";
  tracer.visible = false;
  $("replayB").disabled = !game.lastRec;
  setPreviewPower();
  updPreview();
  hud();
  uiMode();
}
function holeOut() {
  game.state = "done";
  ball.copy(cupPos).y -= 0.15;
  SFX.cup();
  const d = game.strokes - PAR;
  const nm =
    game.strokes == 1
      ? "HOLE IN ONE! 🎉"
      : {
          "-3": "Albatross! 🦤",
          "-2": "Eagle! 🦅",
          "-1": "Birdie! 🐦",
          0: "Par ✔",
          1: "Bogey",
          2: "Double bogey",
          3: "Triple bogey",
        }[d] || "+" + d;
  if (d < 0) setTimeout(() => SFX.clap(d <= -2 ? 2 : 1), 400);
  else if (d == 0) setTimeout(() => SFX.clap(0.4), 400);
  toast(nm, 2200);
  setTimeout(showCard, 2300);
}
// replay
let rp = null;
export function startReplay(after) {
  if (!game.lastRec || game.lastRec.pts.length < 2) return;
  const P = game.lastRec.pts;
  const a = P[0],
    e = P[P.length - 1];
  const len = Math.max(4, a.distanceTo(e));
  const dx = (e.x - a.x) / len,
    dz = (e.z - a.z) / len;
  const mid = a.clone().lerp(e, 0.5);
  const side = Math.max(game.lastRec.club == "Putter" ? 4 : 18, len * 0.5);
  tp.set(mid.x - dz * side, 0, mid.z + dx * side);
  tp.y = groundY(tp.x, tp.z) + (game.lastRec.club == "Putter" ? 2 : 6 + len * 0.08);
  camPos.copy(tp);
  rp = { i: 0, t: 0, save: ball.clone(), prevState: game.state, after };
  game.state = "replay";
  game.camMode = "replay";
  $("rpTag").style.display = "block";
  tracer.visible = true;
  prevL.visible = ringM.visible = false;
  gridGrp.visible = false;
}
function updReplay(dt) {
  rp.t += dt;
  const i = Math.min(game.lastRec.pts.length - 1, Math.floor(rp.t * 30));
  ball.copy(game.lastRec.pts[i]);
  setLine(tracer, game.lastRec.pts.slice(0, i + 1).concat([ball.clone()]));
  if (i >= game.lastRec.pts.length - 1 && rp.t > game.lastRec.pts.length / 30 + 1) {
    ball.copy(rp.save);
    const st = rp.prevState,
      af = rp.after;
    rp = null;
    $("rpTag").style.display = "none";
    if (st == "done") {
      game.state = "done";
      game.camMode = "aim";
      af && af();
    } else settle();
  }
}
export function startHole(i) {
  loadHole(i);
  game.strokes = 0;
  game.stats = { putts: 0, fir: null, gir: false };
  game.lastRec = null;
  newWind();
  ball.set(TEE.x + hdir.x, 0, TEE.y + hdir.y);
  game.shape = 0;
  settle();
  aimCamTarget();
  camPos.copy(tp);
  camLook.copy(tl);
  tracer.visible = false;
}
export function newRound() {
  game.scores = [];
  game.holeStats = [];
  startHole(0);
}
export function introFly() {
  game.state = "intro";
  game.camMode = "fly";
  game.flyT = 0;
  $("hud").style.display = "none";
  $("ctl").style.display = "none";
  $("flyO").style.display = "flex";
  prevL.visible = ringM.visible = false;
  gridGrp.visible = false;
}
