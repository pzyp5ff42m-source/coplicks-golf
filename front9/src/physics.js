/**
 * Ball flight and roll physics, clubs, lies, wind and tree collisions.
 */
import * as THREE from "three";
import COURSE from "./data/course.json";
import { LAYERS, groundY, playHeight } from "./course.js";
import { offsetPoly, pointInPoly, segDist } from "./geometry.js";
import { tkey, treeGrid } from "./vegetation.js";
import { cupPos } from "./props.js";
import { game } from "./state.js";

// ================= GAME =================
export const GRAVITY = 9.8,
  BALL_R = 0.2,
  WIND_K = 0.07;
export const CLUBS = [
  { n: "Driver", d: 230, a: 11, land: 0.24, spin: 0 },
  { n: "3 Wood", d: 210, a: 13, land: 0.22, spin: 0 },
  { n: "5 Iron", d: 180, a: 17, land: 0.17, spin: 0.1 },
  { n: "7 Iron", d: 155, a: 21, land: 0.12, spin: 0.35 },
  { n: "9 Iron", d: 130, a: 27, land: 0.08, spin: 0.7 },
  { n: "PW", d: 110, a: 32, land: 0.05, spin: 1 },
  { n: "SW", d: 85, a: 40, land: 0.02, spin: 1.35 },
  { n: "Putter", d: 25, a: 0, land: 1, spin: 0 },
];
export const ROLL_FRICTION = {
  green: 0.068,
  fringe: 0.12,
  fairway: 0.2,
  tee: 0.2,
  rough: 0.5,
  bunker: 2.6,
  water: 0.3,
};
const LIE_LIFT = { green: 0.3, fringe: 0.26, fairway: 0.2, tee: 0.4, rough: 0.06, bunker: 0.3, water: 0 };
game.collarPoly = offsetPoly(game.greenPoly, 1.5);
export function lie(x, z) {
  if (pointInPoly(x, z, game.greenPoly)) return "green";
  for (const P of LAYERS.bunker) if (pointInPoly(x, z, P)) return "bunker";
  for (const P of LAYERS.green || []) if (pointInPoly(x, z, P)) return "green";
  if (pointInPoly(x, z, game.collarPoly)) return "fringe";
  for (const P of LAYERS.water || []) if (pointInPoly(x, z, P)) return "water";
  for (const P of COURSE.lines.river || [])
    for (let i = 0; i < P.length - 1; i++) if (segDist(x, z, P[i], P[i + 1]) < 8) return "water";
  for (const P of LAYERS.tee || []) if (pointInPoly(x, z, P)) return "tee";
  for (const P of LAYERS.fairway) if (pointInPoly(x, z, P)) return "fairway";
  return "rough";
}
export const LIEN = {
  green: "Green",
  fringe: "Fringe",
  fairway: "Fairway",
  tee: "Tee",
  rough: "Rough",
  bunker: "Bunker",
  water: "Water",
};
export function gradP(x, z) {
  const e = 0.5;
  return [
    (playHeight(x + e, z) - playHeight(x - e, z)) / (2 * e),
    (playHeight(x, z + e) - playHeight(x, z - e)) / (2 * e),
  ];
}
export const UP = new THREE.Vector3(0, 1, 0);
function normalAt(x, z) {
  const [gx, gz] = gradP(x, z);
  return new THREE.Vector3(-gx * 1.4, 1, -gz * 1.4).normalize();
}
export function surfY(x, z, l) {
  return groundY(x, z) + LIE_LIFT[l] + BALL_R;
}
// wind
export let wind = { dir: 0, spd: 0 };
export function newWind() {
  const [a, b] = game.diff.wind;
  wind = { dir: Math.random() * Math.PI * 2, spd: a + Math.random() * (b - a) };
}
game.time = 0;
export function windNow() {
  const gst = 1 + game.diff.gust * Math.sin(game.time * 0.7) * Math.sin(game.time * 1.31 + 1);
  const s = wind.spd * gst;
  return { x: Math.cos(wind.dir) * s, z: Math.sin(wind.dir) * s, s };
}
// tree collision
function treeHit(b) {
  const L2 = [];
  for (let a = -1; a <= 1; a++)
    for (let c = -1; c <= 1; c++) {
      const l = treeGrid.get(((b.p.x / 20) | 0) + a + "," + (((b.p.z / 20) | 0) + c));
      if (l) L2.push(...l);
    }
  for (const t of L2) {
    const d = Math.hypot(b.p.x - t.x, b.p.z - t.z);
    if (d > t.r) continue;
    const base = groundY(t.x, t.z);
    if (b.p.y < base + t.h * 0.45 || b.p.y > base + t.h * 1.02) continue;
    if (b.treeT > 0) continue;
    b.v.multiplyScalar(0.12);
    b.v.x += (Math.random() - 0.5) * 2;
    b.v.z += (Math.random() - 0.5) * 2;
    b.treeT = 0.5;
    b.ev.push("tree");
    return;
  }
}
// ball state & physics
export function mkBall(p, v, club, o = {}) {
  return {
    p: p.clone(),
    v: v.clone(),
    phase: club.n == "Putter" ? "roll" : "air",
    club,
    bounces: 0,
    curve: o.curve || 0,
    flat: !!o.flat,
    still: 0,
    t: 0,
    ev: [],
    treeT: 0,
    backspin: o.backspin || 0,
    lieMul: o.lieMul || 1,
    done: false,
    res: null,
  };
}
export function step(b, dt) {
  b.t += dt;
  b.treeT -= dt;
  const l = b.flat ? "fairway" : lie(b.p.x, b.p.z);
  if (b.phase == "air") {
    b.v.y -= GRAVITY * dt;
    if (!b.flat) {
      const w = windNow();
      const hf = Math.min(1, Math.max(0.3, (b.p.y - groundY(b.p.x, b.p.z)) / 15));
      b.v.x += w.x * WIND_K * hf * dt;
      b.v.z += w.z * WIND_K * hf * dt;
    }
    if (b.curve) {
      const h = Math.hypot(b.v.x, b.v.z) || 1,
        dx = b.v.x / h,
        dz = b.v.z / h;
      b.v.x += -dz * b.curve * dt;
      b.v.z += dx * b.curve * dt;
    }
    b.p.addScaledVector(b.v, dt);
    if (!b.flat) treeHit(b);
    const ll = b.flat ? "fairway" : lie(b.p.x, b.p.z);
    const sy = b.flat ? BALL_R : surfY(b.p.x, b.p.z, ll);
    if (b.p.y <= sy && b.v.y < 0) {
      b.p.y = sy;
      impact(b, ll);
    }
    return;
  }
  // roll
  const mu = (l == "rough" ? game.diff.roughMu : ROLL_FRICTION[l]) || 0.3;
  let ax = 0,
    az = 0;
  if (!b.flat) {
    const [gx, gz] = gradP(b.p.x, b.p.z);
    ax = -GRAVITY * gx * 0.9;
    az = -GRAVITY * gz * 0.9;
  }
  b.v.x += ax * dt;
  b.v.z += az * dt;
  b.v.y = 0;
  const sp = Math.hypot(b.v.x, b.v.z),
    dec = mu * GRAVITY * dt;
  if (sp <= dec) {
    b.v.x = b.v.z = 0;
    if (Math.hypot(ax, az) < mu * GRAVITY * 1.1) b.still += dt;
  } else {
    b.v.x -= (b.v.x / sp) * dec;
    b.v.z -= (b.v.z / sp) * dec;
    b.still = 0;
  }
  b.p.x += b.v.x * dt;
  b.p.z += b.v.z * dt;
  const nl = b.flat ? "fairway" : lie(b.p.x, b.p.z);
  b.p.y = b.flat ? BALL_R : surfY(b.p.x, b.p.z, nl);
  if (!b.flat) {
    const dc = Math.hypot(b.p.x - cupPos.x, b.p.z - cupPos.z);
    if (dc < 0.12) {
      if (sp < 1.65) {
        b.done = true;
        b.res = "holed";
        return;
      }
      b.v.multiplyScalar(0.55);
      const a = (Math.random() - 0.5) * 1.2,
        c = Math.cos(a),
        s = Math.sin(a),
        vx = b.v.x;
      b.v.x = vx * c - b.v.z * s;
      b.v.z = vx * s + b.v.z * c;
    } else if (dc < 0.35 && sp < 1.2) {
      b.v.x += (cupPos.x - b.p.x) * dt * 5;
      b.v.z += (cupPos.z - b.p.z) * dt * 5;
    }
    if (nl == "water") {
      b.done = true;
      b.res = "water";
      return;
    }
  }
  if (b.still > 0.2 || b.t > 35) {
    b.done = true;
    b.res = "stop";
  }
}
function impact(b, l) {
  if (l == "water") {
    b.done = true;
    b.res = "water";
    return;
  }
  if (l == "bunker") {
    b.v.set(0, 0, 0);
    b.phase = "roll";
    b.ev.push("sand");
    return;
  }
  const n = b.flat ? UP : normalAt(b.p.x, b.p.z);
  const vn = b.v.dot(n);
  const vt = b.v.clone().addScaledVector(n, -vn);
  const first = b.bounces == 0;
  let f = first
    ? Math.min(0.9, b.club.land * b.lieMul) * (l == "rough" ? 0.45 : l == "green" ? 0.85 : 1)
    : l == "rough"
      ? 0.4
      : 0.7;
  vt.multiplyScalar(f);
  if (first && b.club.spin >= 0.7 && b.backspin > 0 && (l == "green" || l == "fairway" || l == "fringe")) {
    const h = vt.length() || 1;
    const back = b.club.spin * b.backspin * (l == "green" ? 1.6 : 0.6);
    vt.multiplyScalar(-back / h);
  }
  const e = l == "green" ? 0.16 : l == "rough" ? 0.1 : 0.26;
  b.v.copy(vt).addScaledVector(n, -vn * e);
  b.bounces++;
  b.ev.push(first ? "land" : "bounce");
  if (-vn * e < 1.3) {
    b.phase = "roll";
    b.v.addScaledVector(n, -b.v.dot(n));
  }
}
// calibrate club launch speeds on flat ground so full shot total ≈ listed distance
for (const c of CLUBS) {
  if (c.n == "Putter") continue;
  let lo = 10,
    hi = 120;
  for (let it = 0; it < 22; it++) {
    const v = (lo + hi) / 2,
      th = (c.a * Math.PI) / 180;
    const b = mkBall(
      new THREE.Vector3(0, BALL_R, 0),
      new THREE.Vector3(v * Math.cos(th), v * Math.sin(th), 0),
      c,
      { flat: true, backspin: 1 },
    );
    let n = 0;
    while (!b.done && n++ < 20000) step(b, 1 / 120);
    if (b.p.x > c.d) hi = v;
    else lo = v;
  }
  c.v = (lo + hi) / 2;
}
