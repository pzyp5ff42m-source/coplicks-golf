/**
 * Loading a hole (pin, flag, markers, grid, flyover) and running score totals.
 */
import COURSE from "./data/course.json";
import { $ } from "./config.js";
import { HOLE, HOLES, LAYERS, TEE, groundY, hdir, setHoleVars } from "./course.js";
import { offsetPoly, polyDist } from "./geometry.js";
import { stripeDir } from "./materials.js";
import { cupM, cupPos, drawFlag, flag, pole, ring, teeMarkers, tperp } from "./props.js";
import { buildGrid } from "./preview.js";
import { buildFly } from "./camera.js";
import { game } from "./state.js";

// ---------- hole loading ----------
export function loadHole(i) {
  setHoleVars(i);
  game.greenPoly = LAYERS.green[HOLE.green];
  game.collarPoly = offsetPoly(game.greenPoly, 1.5);
  const gc = [
    game.greenPoly.reduce((s, p) => s + p[0], 0) / game.greenPoly.length,
    game.greenPoly.reduce((s, p) => s + p[1], 0) / game.greenPoly.length,
  ];
  const pp = [-hdir.y, hdir.x],
    off = [
      [1.5, 1],
      [1, -1.2],
      [0.5, 1],
    ][i % 3];
  let cx = gc[0] + hdir.x * off[0] + pp[0] * off[1],
    cz = gc[1] + hdir.y * off[0] + pp[1] * off[1];
  if (i == 0) {
    cx = COURSE.course[0].green[0] + 3;
    cz = COURSE.course[0].green[1] - 2;
  }
  if (polyDist(cx, cz, game.greenPoly) > -2.5) {
    cx = gc[0];
    cz = gc[1];
  }
  cupPos.set(cx, groundY(cx, cz) + 0.3, cz);
  cupM.position.copy(cupPos).y += 0.01;
  ring.position.copy(cupM.position);
  pole.position.set(cupPos.x, cupPos.y + 1.2, cupPos.z);
  flag.position.set(cupPos.x, cupPos.y + 2.12, cupPos.z);
  drawFlag(HOLE.n);
  tperp.set(-hdir.y, hdir.x);
  teeMarkers.forEach((m) => {
    const mx = TEE.x + tperp.x * m.s * 2.4 + hdir.x * 1.5,
      mz = TEE.y + tperp.y * m.s * 2.4 + hdir.y * 1.5;
    m.position.set(mx, groundY(mx, mz) + 0.55, mz);
  });
  stripeDir.value.set(hdir.x, hdir.y);
  buildGrid();
  buildFly();
  $("hNum").textContent = HOLE.n;
  $("hPar").textContent = "Par " + HOLE.par + " · " + HOLE.m + " m";
  $("hYd").textContent = Math.round(HOLE.m * 1.0936) + " yd";
  $("hTot").textContent = totStr();
  $("flyT").textContent = "Hole " + HOLE.n + " · Par " + HOLE.par + " · " + HOLE.m + " m";
  const dz = HOLE.greenZ - HOLE.teeZ;
  $("flyS").textContent =
    (Math.abs(dz) < 1
      ? "Plays flat"
      : dz < 0
        ? "Plays " + (-dz).toFixed(1) + " m downhill"
        : "Plays " + dz.toFixed(1) + " m uphill") + " · Coplicks · Tallebudgera";
}
game.scores = [];
game.holeStats = [];
export function totStr() {
  const n = game.scores.filter((v) => v != null).length;
  if (!n) return "E";
  let s = 0,
    p = 0;
  game.scores.forEach((v, i) => {
    if (v != null) {
      s += v;
      p += HOLES[i].par;
    }
  });
  const d = s - p;
  return (d == 0 ? "E" : d > 0 ? "+" + d : "" + d) + " thru " + n;
}
