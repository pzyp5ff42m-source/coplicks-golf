/**
 * Pin, cup, flag, tee markers, clouds, birds and wind particles.
 */
import * as THREE from "three";
import { quality, tier } from "./config.js";
import { scene } from "./renderer.js";
import { COURSE_CENTRE } from "./course.js";
import { rnd } from "./materials.js";

// ---------- flag, cup, tee markers ----------
export const cupPos = new THREE.Vector3();
export let cupM, ring;
{
  cupM = new THREE.Mesh(
    new THREE.CircleGeometry(0.108, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x0a0a0a,
      polygonOffset: true,
      polygonOffsetFactor: -12,
      polygonOffsetUnits: -24,
    }),
  );
  scene.add(cupM);
  ring = new THREE.Mesh(
    new THREE.RingGeometry(0.108, 0.125, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -12,
      polygonOffsetUnits: -24,
    }),
  );
  scene.add(ring);
  // worn, slightly darker turf ring around the hole + white cap on the pin
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.125, 0.55, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -11,
      polygonOffsetUnits: -22,
    }),
  );
  ring.add(halo);
}
const pc = document.createElement("canvas");
pc.width = 8;
pc.height = 64;
{
  const x = pc.getContext("2d");
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? "#ffffff" : "#f2c230";
    x.fillRect(0, i * 8, 8, 8);
  }
}
const poleT = new THREE.CanvasTexture(pc);
poleT.colorSpace = THREE.SRGBColorSpace;
export const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.025, 0.025, 2.4, 8),
  new THREE.MeshStandardMaterial({ map: poleT, roughness: 0.4 }),
);
pole.castShadow = !!tier.shadow;
scene.add(pole);
{
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  );
  cap.position.y = 1.21;
  pole.add(cap);
}
const fc = document.createElement("canvas");
fc.width = 256;
fc.height = 176;
{
  const x = fc.getContext("2d");
  x.fillStyle = "#d8281f";
  x.fillRect(0, 0, 256, 176);
  x.fillStyle = "#fff";
  x.font = "bold 140px Arial";
  x.textAlign = "center";
  x.textBaseline = "middle";
}
const ft = new THREE.CanvasTexture(fc);
ft.colorSpace = THREE.SRGBColorSpace;
const flagG = new THREE.PlaneGeometry(0.75, 0.5, 16, 6);
const fbase = flagG.attributes.position.array.slice();
export const flag = new THREE.Mesh(
  flagG,
  new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.8 }),
);
flag.castShadow = !!tier.shadow;
scene.add(flag);
export function drawFlag(n) {
  const x = fc.getContext("2d");
  x.fillStyle = "#d8281f";
  x.fillRect(0, 0, 256, 176);
  x.fillStyle = "#fff";
  x.font = "bold 140px Arial";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(String(n), 128, 96);
  ft.needsUpdate = true;
}
export function waveFlag(t, wa, ws) {
  flag.rotation.y = -wa;
  const p = flagG.attributes.position.array;
  const amp = 0.03 + ws * 0.012;
  for (let i = 0; i < p.length; i += 3) {
    const u = fbase[i] + 0.375;
    p[i] = u;
    p[i + 2] = Math.sin(u * 7 - t * (5 + ws)) * amp * u + Math.sin(u * 13 - t * 11) * 0.02 * u;
    p[i + 1] = fbase[i + 1] - u * u * (0.12 - Math.min(0.1, ws * 0.012));
  }
  flagG.attributes.position.needsUpdate = true;
  flagG.computeVertexNormals();
}
export const tperp = new THREE.Vector2();
export const teeMarkers = [1, -1].map((s) => {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a64d8, roughness: 0.35 }),
  );
  m.castShadow = !!tier.shadow;
  scene.add(m);
  m.s = s;
  return m;
});
// clouds
{
  const cc = document.createElement("canvas");
  cc.width = cc.height = 256;
  const x = cc.getContext("2d");
  for (let i = 0; i < 26; i++) {
    const px = 60 + rnd() * 136,
      py = 100 + rnd() * 60,
      rr = 24 + rnd() * 40;
    const g = x.createRadialGradient(px, py, 0, px, py, rr);
    g.addColorStop(0, "rgba(255,255,255,.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
  }
  const ct = new THREE.CanvasTexture(cc);
  ct.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < tier.clouds; i++) {
    const a = rnd() * Math.PI * 2,
      d = 1300 + rnd() * 1700;
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.8 }),
    );
    const s = 500 + rnd() * 700;
    sp.scale.set(s, s * 0.45, 1);
    sp.position.set(COURSE_CENTRE.x + Math.cos(a) * d, 280 + rnd() * 380, COURSE_CENTRE.y + Math.sin(a) * d);
    scene.add(sp);
  }
}
// birds
const BIRDS = [];
{
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.55, 0, -0.1, 0.15, 0, 0.25], 3));
  wg.computeVertexNormals();
  const bm = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
  for (let i = 0; i < (quality == "low" ? 4 : 9); i++) {
    const g = new THREE.Group();
    const l = new THREE.Mesh(wg, bm),
      rr = new THREE.Mesh(wg, bm);
    rr.scale.x = -1;
    g.add(l, rr);
    g.scale.setScalar(1.4);
    scene.add(g);
    BIRDS.push({
      g,
      l,
      r: rr,
      c: [COURSE_CENTRE.x + (rnd() - 0.5) * 400, COURSE_CENTRE.y + (rnd() - 0.5) * 500],
      rad: 30 + rnd() * 60,
      h: 35 + rnd() * 30,
      sp: (0.15 + rnd() * 0.15) * (rnd() < 0.5 ? 1 : -1),
      ph: rnd() * 6,
    });
  }
}
export function updBirds(t) {
  for (const b of BIRDS) {
    const a = b.ph + t * b.sp;
    b.g.position.set(
      b.c[0] + Math.cos(a) * b.rad,
      b.h + Math.sin(t * 0.3 + b.ph) * 3,
      b.c[1] + Math.sin(a) * b.rad,
    );
    b.g.rotation.y = -a - (b.sp > 0 ? 0 : Math.PI);
    const f = Math.sin(t * 9 + b.ph) * 0.6;
    b.l.rotation.z = f;
    b.r.rotation.z = -f;
  }
}
// wind particles
export let parts = null;
if (tier.parts) {
  const n = tier.parts,
    pg = new THREE.BufferGeometry();
  pg.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      new Float32Array(n * 3).map(() => (rnd() - 0.5) * 80),
      3,
    ),
  );
  parts = new THREE.Points(
    pg,
    new THREE.PointsMaterial({
      color: 0xf3ecd0,
      size: 0.09,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  );
  parts.frustumCulled = false;
  scene.add(parts);
}
