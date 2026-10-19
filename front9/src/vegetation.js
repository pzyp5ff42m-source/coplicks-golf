/**
 * Trees, bushes and grass tufts (instanced), plus the tree collision grid.
 */
import * as THREE from "three";
import COURSE from "./data/course.json";
import { tier } from "./config.js";
import { scene } from "./renderer.js";
import { nearAnyHole, COURSE_CENTRE, HOLES, LAYERS, groundY, holeMid } from "./course.js";
import { offsetPoly, pointInPoly, polyDist, resample } from "./geometry.js";
import { ctex, rnd } from "./materials.js";
import { holeFW } from "./scenery.js";

// ---------- vegetation ----------
const avoid = ["fairway", "green", "tee", "water", "bunker", "building"]
  .flatMap((k) => LAYERS[k] || [])
  .map((P) => {
    const xs = P.map((p) => p[0]),
      zs = P.map((p) => p[1]);
    P.bb = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    return P;
  });
function blocked(x, z, m = 6) {
  for (const P of avoid) {
    const b = P.bb;
    if (x < b[0] - m || x > b[1] + m || z < b[2] - m || z > b[3] + m) continue;
    if (pointInPoly(x, z, P)) return true;
    if (polyDist(x, z, P) < m) return true;
  }
  for (const P of COURSE.lines.road || [])
    for (const p of P) if (Math.hypot(p[0] - x, p[1] - z) < 5) return true;
  return false;
}
function merge(list) {
  let pos = [],
    nor = [],
    col = [];
  for (const [g, c] of list) {
    const gg = g.index ? g.toNonIndexed() : g;
    gg.computeVertexNormals();
    const p = gg.attributes.position.array,
      n = gg.attributes.normal.array;
    for (let i = 0; i < p.length; i++) {
      pos.push(p[i]);
      nor.push(n[i]);
    }
    const cc = new THREE.Color(c);
    for (let i = 0; i < p.length / 3; i++) {
      const v = 0.88 + rnd() * 0.24;
      col.push(cc.r * v, cc.g * v, cc.b * v);
    }
  }
  const G = new THREE.BufferGeometry();
  G.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  G.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  G.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return G;
}
const xform = (g, x, y, z, s = [1, 1, 1], rx = 0, rz = 0) => {
  g.scale(...s);
  g.rotateX(rx);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};
const bark = 0x9a8a78;
const gumP = [
  [xform(new THREE.CylinderGeometry(0.022, 0.045, 0.62, 6), 0, 0.31, 0), bark],
  [xform(new THREE.CylinderGeometry(0.012, 0.02, 0.35, 5), 0.06, 0.62, 0, [1, 1, 1], 0, -0.6), bark],
  [xform(new THREE.CylinderGeometry(0.012, 0.02, 0.35, 5), -0.05, 0.6, 0.03, [1, 1, 1], 0.3, 0.6), bark],
];
for (let k = 0; k < 8; k++) {
  const a = k * 2.3,
    rr = 0.08 + rnd() * 0.15;
  gumP.push([
    xform(
      new THREE.IcosahedronGeometry(0.15 + rnd() * 0.08, 1),
      Math.cos(a) * rr,
      0.66 + rnd() * 0.28,
      Math.sin(a) * rr,
      [1, 0.68, 1],
    ),
    [0x5d7a3e, 0x4f6d35, 0x6b8445, 0x56713a][k % 4],
  ]);
}
const palmP = [];
for (let k = 0; k < 8; k++) {
  const t0 = k / 8,
    t1 = (k + 1) / 8;
  palmP.push([
    xform(
      new THREE.CylinderGeometry(0.03 - t1 * 0.008, 0.034 - t0 * 0.008, 1 / 8, 6),
      Math.sin(t0 * 1.6) * 0.06,
      t0 + 0.0625,
      0,
    ),
    0x8b7558,
  ]);
}
for (let k = 0; k < 10; k++) {
  const a = (k / 10) * Math.PI * 2;
  const f = new THREE.ConeGeometry(0.07, 0.58, 4, 1);
  f.scale(1, 1, 0.25);
  f.rotateZ(-Math.PI / 2 - 0.35);
  f.translate(0.28, -0.06, 0);
  f.rotateY(a);
  f.translate(Math.sin(1.6) * 0.06, 1, 0);
  palmP.push([f, k % 2 ? 0x5b8a32 : 0x4c7a2a]);
}
const casP = [[xform(new THREE.CylinderGeometry(0.02, 0.035, 0.5, 5), 0, 0.25, 0), 0x7a6652]];
for (let k = 0; k < 5; k++)
  casP.push([
    xform(new THREE.ConeGeometry(0.22 - k * 0.03, 0.32, 7), 0, 0.38 + k * 0.13, 0),
    [0x34502a, 0x3c5a2e, 0x2f4a26][k % 3],
  ]);
const bushG = merge([
  [xform(new THREE.IcosahedronGeometry(0.5, 0), 0, 0.3, 0, [1, 0.7, 1]), 0x46652c],
  [xform(new THREE.IcosahedronGeometry(0.38, 0), 0.35, 0.25, 0.1, [1, 0.7, 1]), 0x55753a],
  [xform(new THREE.IcosahedronGeometry(0.33, 0), -0.3, 0.22, -0.15, [1, 0.7, 1]), 0x3e5c27],
]);
export const sway = { value: 0 };
function vegMat(o = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, ...o });
  m.onBeforeCompile = (s) => {
    s.uniforms.sway = sway;
    s.vertexShader =
      "uniform float sway;\n" +
      s.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
 float ph=instanceMatrix[3].x*.07+instanceMatrix[3].z*.05; transformed.x+=sin(sway*1.3+ph)*.025*position.y*position.y; transformed.z+=cos(sway*1.1+ph)*.018*position.y*position.y;`,
      );
  };
  return m;
}
function inst(G, list, mat, cast = true) {
  const im = new THREE.InstancedMesh(G, mat, list.length);
  const Mx = new THREE.Matrix4(),
    Qt = new THREE.Quaternion(),
    U = new THREE.Vector3(0, 1, 0);
  list.forEach((t, i) => {
    Qt.setFromAxisAngle(U, t.rot);
    Mx.compose(new THREE.Vector3(t.x, groundY(t.x, t.z) - 0.25, t.z), Qt, new THREE.Vector3(t.sx, t.h, t.sz));
    im.setMatrixAt(i, Mx);
  });
  im.castShadow = cast && !!tier.shadow;
  im.receiveShadow = true;
  scene.add(im);
  return im;
}
export const trees = [],
  treeGrid = new Map();
export const tkey = (x, z) => ((x / 20) | 0) + "," + ((z / 20) | 0);
function addTree(x, z, type) {
  const u = rnd();
  const h = type == "palm" ? 9 + u * 5 : type == "cas" ? 12 + u * 7 : 11 + u * 8;
  const t = { x, z, h, type, rot: u * 40, sx: h * (0.8 + rnd() * 0.4), sz: h * (0.8 + rnd() * 0.4) };
  t.r = t.sx * (type == "palm" ? 0.3 : type == "cas" ? 0.2 : 0.32);
  trees.push(t);
  const k = tkey(x, z);
  if (!treeGrid.has(k)) treeGrid.set(k, []);
  treeGrid.get(k).push(t);
}
// tree rows lining hole-1 & neighbours (as in the aerial), then fill
for (const P of holeFW) {
  const E = resample(offsetPoly(P, 1), 5.5, true);
  for (const p of E) {
    if (trees.length > tier.trees * 0.6) break;
    const cx = p[0],
      cz = p[1];
    const d = polyDist(cx, cz, P);
    const nx = cx - holeMid.x,
      nz = cz - holeMid.y;
    for (let k = 0; k < 2; k++) {
      const off = 9 + rnd() * 9 + k * 7; // push outward along gradient of distance
      const e = 0.5,
        gx = polyDist(cx + e, cz, P) - polyDist(cx - e, cz, P),
        gz = polyDist(cx, cz + e, P) - polyDist(cx, cz - e, P),
        gl = Math.hypot(gx, gz) || 1;
      const x = cx + (gx / gl) * off + (rnd() - 0.5) * 3,
        z = cz + (gz / gl) * off + (rnd() - 0.5) * 3;
      if (blocked(x, z, 7)) continue;
      if (
        HOLES.some((h) => {
          const t = h.pts[0],
            g = h.pts[h.pts.length - 1];
          return Math.hypot(x - g[0], z - g[1]) < 30 || Math.hypot(x - t[0], z - t[1]) < 14;
        })
      )
        continue;
      if (nearAnyHole(x, z, 24)) continue;
      addTree(x, z, rnd() < 0.45 ? "cas" : rnd() < 0.2 ? "palm" : "gum");
    }
  }
}
for (let i = 0; i < 60000 && trees.length < tier.trees; i++) {
  const x = COURSE_CENTRE.x + (rnd() - 0.5) * 760,
    z = COURSE_CENTRE.y + (rnd() - 0.5) * 1060;
  const inC = pointInPoly(x, z, COURSE.boundary);
  if (rnd() < (inC ? 0.3 : 0.65)) continue;
  if (blocked(x, z)) continue;
  if (COURSE.greens.some((g) => Math.hypot(x - g[0], z - g[1]) < 38)) continue;
  if (nearAnyHole(x, z, 28)) continue;
  addTree(x, z, rnd() < 0.3 ? "cas" : rnd() < 0.25 ? "palm" : "gum");
}
const tm = vegMat();
inst(
  merge(gumP),
  trees.filter((t) => t.type == "gum"),
  tm,
);
inst(
  merge(palmP),
  trees.filter((t) => t.type == "palm"),
  tm,
);
inst(
  merge(casP),
  trees.filter((t) => t.type == "cas"),
  tm,
);
{
  const B = [];
  for (let i = 0; i < tier.bush * 6 && B.length < tier.bush; i++) {
    const t = trees[(rnd() * trees.length) | 0];
    if (!t) break;
    const a = rnd() * 6.28,
      d = 2 + rnd() * 5,
      x = t.x + Math.cos(a) * d,
      z = t.z + Math.sin(a) * d;
    if (blocked(x, z, 3)) continue;
    const s = 0.9 + rnd() * 1.4;
    B.push({ x, z, h: s * 0.9, sx: s, sz: s, rot: rnd() * 6 });
  }
  inst(bushG, B, vegMat(), false);
}
// grass tufts (instanced crossed quads, alpha-tested)
if (tier.tufts) {
  const tt = ctex(128, (x, s) => {
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      const bx = s * 0.15 + rnd() * s * 0.7,
        h = s * (0.45 + rnd() * 0.5),
        lean = (rnd() - 0.5) * s * 0.35;
      x.strokeStyle = ["#5f8a33", "#7a9c40", "#4c7429", "#93a957"][i % 4];
      x.lineWidth = 2 + rnd() * 2;
      x.beginPath();
      x.moveTo(bx, s);
      x.quadraticCurveTo(bx + lean * 0.3, s - h * 0.6, bx + lean, s - h);
      x.stroke();
    }
  });
  const q1 = new THREE.PlaneGeometry(0.9, 0.6).translate(0, 0.3, 0),
    q2 = q1.clone().rotateY(Math.PI / 2);
  const tg = new THREE.BufferGeometry();
  const mg = (a, b) => {
    const pa = [...a.attributes.position.array, ...b.attributes.position.array],
      ua = [...a.attributes.uv.array, ...b.attributes.uv.array],
      ia = [...a.index.array, ...b.index.array.map((v) => v + 4)];
    tg.setAttribute("position", new THREE.Float32BufferAttribute(pa, 3));
    tg.setAttribute("uv", new THREE.Float32BufferAttribute(ua, 2));
    tg.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(
        new Array(pa.length).fill(0).map((v, i) => (i % 3 == 1 ? 1 : 0)),
        3,
      ),
    );
    tg.setIndex(ia);
  };
  mg(q1, q2);
  const U = [];
  for (let i = 0; i < tier.tufts * 8 && U.length < tier.tufts; i++) {
    const P = holeFW[(rnd() * holeFW.length) | 0];
    const E = P[(rnd() * P.length) | 0];
    let x, z;
    if (rnd() < 0.7) {
      x = E[0] + (rnd() - 0.5) * 30;
      z = E[1] + (rnd() - 0.5) * 30;
    } else {
      const t = trees[(rnd() * trees.length) | 0];
      x = t.x + (rnd() - 0.5) * 10;
      z = t.z + (rnd() - 0.5) * 10;
    }
    if (blocked(x, z, 2.6)) continue;
    const s = 0.7 + rnd() * 0.9;
    U.push({ x, z, h: s, sx: s, sz: s, rot: rnd() * 6 });
  }
  const m = new THREE.MeshStandardMaterial({
    map: tt,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  const im = inst(tg, U, m, false);
  im.position.y = 0.2;
}
