/**
 * 2D polygon helpers (point-in-polygon, distances, offsetting, resampling,
 * triangulation) plus outline smoothing for the OSM course shapes.
 */
import * as THREE from "three";

export function pointInPoly(x, z, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i],
      b = P[j];
    if (a[1] > z != b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
export function segDist(x, z, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  let k = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1);
  k = Math.max(0, Math.min(1, k));
  return Math.hypot(a[0] + k * dx - x, a[1] + k * dz - z);
}
export function polyDist(x, z, P) {
  let d = 1e9;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) d = Math.min(d, segDist(x, z, P[j], P[i]));
  return pointInPoly(x, z, P) ? -d : d;
}
export function resample(P, st, closed) {
  const o = [];
  const Q2 = closed ? [...P, P[0]] : P;
  for (let i = 0; i < Q2.length - 1; i++) {
    const a = Q2[i],
      b = Q2[i + 1],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / st));
    for (let k = 0; k < n; k++) o.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (!closed) o.push(Q2[Q2.length - 1]);
  return o;
}
function area(P) {
  let a = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1];
  return a / 2;
}
export function offsetPoly(P, d) {
  P = resample(P, 2, true);
  const s = area(P) > 0 ? 1 : -1,
    n = P.length,
    o = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n],
      b = P[i],
      c = P[(i + 1) % n];
    const e1 = [b[0] - a[0], b[1] - a[1]],
      e2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...e1) || 1,
      l2 = Math.hypot(...e2) || 1;
    let nx = e1[1] / l1 + e2[1] / l2,
      nz = -(e1[0] / l1 + e2[0] / l2);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    o.push([b[0] - s * nx * d, b[1] - s * nz * d]);
  }
  return o;
}
// ---------- meshes ----------
export function subdiv(g, maxE) {
  g = g.index ? g.toNonIndexed() : g;
  let P = Array.from(g.attributes.position.array);
  for (let it = 0; it < 24; it++) {
    let ch = false;
    const NP = [];
    for (let t = 0; t < P.length / 9; t++) {
      const v = [0, 1, 2].map((k) => [P[t * 9 + k * 3], P[t * 9 + k * 3 + 1], P[t * 9 + k * 3 + 2]]);
      const Ls = [0, 1, 2].map((k) => {
        const a = v[k],
          b = v[(k + 1) % 3];
        return Math.hypot(a[0] - b[0], a[1] - b[1]);
      });
      const k = Ls.indexOf(Math.max(...Ls));
      if (Ls[k] <= maxE) {
        NP.push(...v.flat());
        continue;
      }
      ch = true;
      const a = k,
        b = (k + 1) % 3,
        c = (k + 2) % 3;
      const m = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, 0];
      NP.push(...v[a], ...m, ...v[c], ...m, ...v[b], ...v[c]);
    }
    P = NP;
    if (!ch) break;
  }
  const G = new THREE.BufferGeometry();
  G.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  return G;
}
export function shp(P) {
  const s = new THREE.Shape();
  P.forEach((p, i) => (i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1])));
  return s;
}
export function shapeH(P, holes) {
  const s = shp(P);
  (holes || []).forEach((hole) => {
    const h = new THREE.Path();
    hole.forEach((p, i) => (i ? h.lineTo(p[0], -p[1]) : h.moveTo(p[0], -p[1])));
    s.holes.push(h);
  });
  return s;
}

// ---------- outline smoothing ----------
// OSM outlines are hand-traced with few vertices, so they look jagged once
// rendered at golf-ball scale. smoothOutline() cleans and rounds them.

/** Drop duplicate / near-duplicate vertices (and the repeated closing point). */
export function dedupe(P, eps = 0.05) {
  const o = [];
  for (const p of P) {
    const q = o[o.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) o.push([p[0], p[1]]);
  }
  while (o.length > 3 && Math.hypot(o[0][0] - o.at(-1)[0], o[0][1] - o.at(-1)[1]) <= eps) o.pop();
  return o;
}

/** Douglas–Peucker simplification of a closed ring (tolerance in metres). */
export function simplify(P, tol) {
  if (P.length < 5) return P;
  const keep = new Uint8Array(P.length);
  const dp = (a, b) => {
    let best = -1,
      bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(P[i][0], P[i][1], P[a], P[b % P.length]);
      if (d > best) ((best = d), (bi = i));
    }
    if (best > tol) {
      keep[bi] = 1;
      dp(a, bi);
      dp(bi, b);
    }
  };
  // split the ring at vertex 0 and the vertex farthest from it
  let far = 1;
  for (let i = 1; i < P.length; i++)
    if (
      Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]) > Math.hypot(P[far][0] - P[0][0], P[far][1] - P[0][1])
    )
      far = i;
  keep[0] = keep[far] = 1;
  dp(0, far);
  dp(far, P.length);
  return P.filter((_, i) => keep[i]);
}

/** One round of Chaikin corner cutting on a closed ring. */
export function chaikin(P) {
  const o = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i],
      b = P[(i + 1) % P.length];
    o.push(
      [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
      [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75],
    );
  }
  return o;
}

function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** True if any two non-adjacent edges of the closed ring intersect. */
export function selfIntersects(P) {
  const n = P.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i == 0 && j == n - 1) continue;
      if (segsCross(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return true;
    }
  return false;
}

/** Remove self-intersections by cutting off the loop between crossing edges (keeps the larger part). */
export function untangle(P) {
  for (let guard = 0; guard < 50; guard++) {
    const n = P.length;
    let hit = null;
    for (let i = 0; i < n && !hit; i++)
      for (let j = i + 2; j < n; j++) {
        if (i == 0 && j == n - 1) continue;
        if (segsCross(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) {
          hit = [i, j];
          break;
        }
      }
    if (!hit) return P;
    const [i, j] = hit;
    const inner = P.slice(i + 1, j + 1),
      outer = [...P.slice(0, i + 1), ...P.slice(j + 1)];
    P = Math.abs(area(inner)) > Math.abs(area(outer)) ? inner : outer;
  }
  return P;
}

/**
 * Clean, de-jag and round a closed outline:
 * dedupe → untangle → light simplify → 3× Chaikin → simplify back to ~cm accuracy.
 */
export function smoothOutline(P, { simplifyTol = 0.35, rounds = 3 } = {}) {
  let o = untangle(dedupe(P));
  o = simplify(o, simplifyTol);
  for (let k = 0; k < rounds; k++) o = chaikin(o);
  o = simplify(o, 0.04);
  return selfIntersects(o) ? untangle(o) : o;
}

/** Chaikin smoothing for an open polyline (endpoints are kept). */
export function smoothLine(P, rounds = 2) {
  let o = dedupe(P);
  for (let k = 0; k < rounds; k++) {
    const n = [o[0]];
    for (let i = 0; i < o.length - 1; i++) {
      const a = o[i],
        b = o[i + 1];
      n.push(
        [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
        [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75],
      );
    }
    n.push(o.at(-1));
    o = n;
  }
  return o;
}
