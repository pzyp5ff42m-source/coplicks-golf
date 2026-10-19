/**
 * Course data: LiDAR elevation sampling, smoothed course outlines, the
 * current hole's geometry and the sculpted bunkers.
 */
import * as THREE from "three";
import COURSE from "./data/course.json";
import DEM from "./data/elevation.json";
import { smoothLine, smoothOutline, pointInPoly, polyDist, segDist } from "./geometry.js";

// ---------- terrain ----------
export const ELEV_EXAG = 2.5,
  DEM_NX = DEM.nx,
  DEM_NY = DEM.ny,
  demHeights = new Float32Array(DEM.h);
for (let j = 0; j < DEM_NY; j++)
  for (let i = 0; i < DEM_NX; i++) {
    const e = Math.min(i, j, DEM_NX - 1 - i, DEM_NY - 1 - j) * DEM.sp;
    const f = Math.max(0, Math.min(1, (e - 10) / 90));
    demHeights[j * DEM_NX + i] *= f * f * (3 - 2 * f);
  }
// Gentle low-pass filter (two passes of a 5-tap binomial kernel, ~2 m sigma)
// so the 2 m LiDAR grid does not show stair-steps once heights are exaggerated.
{
  const K = [1, 4, 6, 4, 1].map((k) => k / 16);
  const tmp = new Float32Array(demHeights.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < DEM_NY; j++)
      for (let i = 0; i < DEM_NX; i++) {
        let s = 0;
        for (let k = -2; k <= 2; k++)
          s += K[k + 2] * demHeights[j * DEM_NX + Math.min(DEM_NX - 1, Math.max(0, i + k))];
        tmp[j * DEM_NX + i] = s;
      }
    for (let j = 0; j < DEM_NY; j++)
      for (let i = 0; i < DEM_NX; i++) {
        let s = 0;
        for (let k = -2; k <= 2; k++)
          s += K[k + 2] * tmp[Math.min(DEM_NY - 1, Math.max(0, j + k)) * DEM_NX + i];
        demHeights[j * DEM_NX + i] = s;
      }
  }
}
export function demHeight(x, z) {
  let u = (x - DEM.x0) / DEM.sp,
    v = (z - DEM.y0) / DEM.sp;
  u = Math.max(0, Math.min(DEM_NX - 1.001, u));
  v = Math.max(0, Math.min(DEM_NY - 1.001, v));
  const i = u | 0,
    j = v | 0,
    fu = u - i,
    fv = v - j;
  const a = demHeights[j * DEM_NX + i],
    b = demHeights[j * DEM_NX + i + 1],
    c = demHeights[(j + 1) * DEM_NX + i],
    d = demHeights[(j + 1) * DEM_NX + i + 1];
  return ELEV_EXAG * ((a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv);
}
export const LAYERS = COURSE.layers;

// Smooth every course outline in place (array identity is kept, so hole data
// that points at a polygon still works). Bunkers are small, so they get a
// finer simplify tolerance to keep their shape.
for (const kind of ["fairway", "green", "tee", "bunker", "water"]) {
  for (const P of LAYERS[kind] || []) {
    const s = smoothOutline(P, { simplifyTol: kind == "bunker" || kind == "tee" ? 0.15 : 0.35 });
    P.splice(0, P.length, ...s);
  }
}
COURSE.lines.road = (COURSE.lines.road || []).map((P) => smoothLine(P, 2));
export const HOLES = COURSE.front9;
export let holeIndex = 0,
  holePath,
  TEE = new THREE.Vector2(),
  GREEN = new THREE.Vector2(),
  holeMid = new THREE.Vector2(),
  hdir = new THREE.Vector2(),
  hang = 0,
  PAR = 4,
  HOLE;
export function setHoleVars(i) {
  holeIndex = i;
  HOLE = HOLES[i];
  holePath = HOLE.pts;
  TEE.set(...holePath[0]);
  GREEN.set(...holePath[holePath.length - 1]);
  holeMid.set((TEE.x + GREEN.x) / 2, (TEE.y + GREEN.y) / 2);
  hdir.copy(GREEN).sub(TEE).normalize();
  hang = Math.atan2(hdir.y, hdir.x);
  PAR = HOLE.par;
}
setHoleVars(0);
/** Rough centre of the front 9, used to place scenery. */
export const COURSE_CENTRE = new THREE.Vector2(-95, 100);
/** True if (x,z) is within R metres of any front-9 hole's centre line. */
export const nearAnyHole = (x, z, R) =>
  HOLES.some((h) => {
    for (let k = 0; k < h.pts.length - 1; k++) if (segDist(x, z, h.pts[k], h.pts[k + 1]) < R) return true;
    return false;
  });
export const near = (P, R) => P.some((p) => nearAnyHole(p[0], p[1], Math.min(R, 160)));
// hole-1 fairway (the one containing the dogleg point)
const FW =
  (LAYERS.fairway || []).find((P) => pointInPoly(holePath[1][0], holePath[1][1], P)) || LAYERS.fairway[7];
const hcurve = new THREE.CatmullRomCurve3(
  holePath.map((p) => new THREE.Vector3(p[0], 0, p[1])),
  false,
  "centripetal",
);
// ---------- bunkers: real greenside + added fairway bunker ----------
export const bunkers = [];
(LAYERS.bunker || []).filter((P) => near(P, 60)).forEach((P) => bunkers.push({ P, real: true }));
{
  const q = hcurve.getPointAt(0.66),
    q2 = hcurve.getPointAt(0.67);
  const dx = q2.x - q.x,
    dz = q2.z - q.z,
    l = Math.hypot(dx, dz);
  const ax = dx / l,
    az = dz / l,
    px = az,
    pz = -ax;
  let k = 0;
  while (k < 60 && pointInPoly(q.x + px * k, q.z + pz * k, FW)) k += 1;
  const cx = q.x + px * (k - 6.5),
    cz = q.z + pz * (k - 6.5);
  const P = [];
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const rx = 8.5 * (1 + 0.12 * Math.cos(2 * t)),
      rz = 4.3 * (1 - 0.25 * Math.sin(t) * Math.cos(t)) * (1 + 0.18 * Math.cos(t));
    P.push([
      cx + ax * Math.cos(t) * rx + px * Math.sin(t) * rz,
      cz + az * Math.cos(t) * rx + pz * Math.sin(t) * rz,
    ]);
  }
  bunkers.push({ P, real: false });
  LAYERS.bunker = [...(LAYERS.bunker || []), P];
}
bunkers.forEach((b) => {
  const P = b.P;
  b.c = [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
  const xs = P.map((p) => p[0]),
    zs = P.map((p) => p[1]);
  b.bb = [Math.min(...xs) - 2.2, Math.max(...xs) + 2.2, Math.min(...zs) - 2.2, Math.max(...zs) + 2.2];
  const ng = COURSE.greens.reduce((a, g) =>
    Math.hypot(g[0] - b.c[0], g[1] - b.c[1]) < Math.hypot(a[0] - b.c[0], a[1] - b.c[1]) ? g : a,
  );
  const fx = ng[0] - b.c[0],
    fz = ng[1] - b.c[1],
    fl = Math.hypot(fx, fz) || 1;
  b.f = [fx / fl, fz / fl];
  if (!b.real) b.f = [hdir.x, hdir.y];
  b.depth = b.real ? 1.0 : 0.85;
  b.lip = b.real ? 0.55 : 0.5;
});
export function bunkerShape(x, z) {
  for (const b of bunkers) {
    if (x < b.bb[0] || x > b.bb[1] || z < b.bb[2] || z > b.bb[3]) continue;
    const d = polyDist(x, z, b.P);
    if (d > 2) continue;
    const vx = x - b.c[0],
      vz = z - b.c[1],
      vl = Math.hypot(vx, vz) || 1;
    const f = 0.5 + (0.5 * (vx * b.f[0] + vz * b.f[1])) / vl;
    if (d < 0) {
      const t = Math.min(1, -d / 2.4);
      return -b.depth * (0.7 + 0.6 * f) * t * t * (3 - 2 * t);
    }
    const t = d / 2;
    return b.lip * (0.35 + 0.95 * f) * Math.sin(Math.PI * Math.min(1, t)) * (1 - t * 0.3);
  }
  return 0;
}
export const groundY = (x, z) => demHeight(x, z) + bunkerShape(x, z);
export const playHeight = (x, z) => demHeight(x, z) / ELEV_EXAG + bunkerShape(x, z);
