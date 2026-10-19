/**
 * Aim preview arc, shot tracer, landing ring and the putting slope grid.
 */
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { scene } from "./renderer.js";
import { pointInPoly } from "./geometry.js";
import { groundY } from "./course.js";
import { UP, gradP, mkBall, step } from "./physics.js";
import { ball, club, compensate, curLie, launchVel, putMax, shapeCurve } from "./player.js";
import { game } from "./state.js";

// ---------- previews ----------
const lineMat = (c, w, o = 1, dash = false) => {
  const m = new LineMaterial({
    color: c,
    linewidth: w,
    transparent: true,
    opacity: o,
    dashed: dash,
    dashSize: 1.2,
    gapSize: 0.8,
    depthTest: false,
  });
  m.resolution.set(innerWidth, innerHeight);
  return m;
};
export const prevL = new Line2(new LineGeometry(), lineMat(0xffffff, 3, 0.85, true));
prevL.renderOrder = 30;
prevL.frustumCulled = false;
scene.add(prevL);
export const tracer = new Line2(new LineGeometry(), lineMat(0xffd23f, 5, 0.95));
tracer.renderOrder = 31;
tracer.frustumCulled = false;
scene.add(tracer);
export const ringM = new THREE.Mesh(
  new THREE.RingGeometry(1.5, 2.1, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xf5d142, transparent: true, opacity: 0.9, depthTest: false }),
);
ringM.renderOrder = 32;
scene.add(ringM);
export function setLine(l, pts) {
  if (pts.length < 2)
    pts = [
      pts[0] || new THREE.Vector3(),
      (pts[0] || new THREE.Vector3()).clone().add(new THREE.Vector3(0, 0.01, 0)),
    ];
  const a = [];
  pts.forEach((p) => a.push(p.x, p.y, p.z));
  l.geometry.dispose();
  l.geometry = new LineGeometry();
  l.geometry.setPositions(a);
  l.computeLineDistances();
  l.visible = true;
}
game.previewPower = 0.8;
export function updPreview() {
  prevL.visible = ringM.visible = false;
  if (game.state != "aim") return;
  const c = club(),
    l = curLie();
  const p = game.previewPower;
  const isPutt = c.n == "Putter";
  if (isPutt) {
    if (game.diff.putt == "none") return;
    const v = launchVel(c, p, game.aim, l);
    const b = mkBall(ball, v, c);
    const pts = [b.p.clone()];
    let n = 0,
      lim = game.diff.putt == "short" ? Math.min(2.5, p * putMax() * 0.4) : 1e9,
      dd = 0;
    while (!b.done && n++ < 6000) {
      const o = b.p.clone();
      step(b, 1 / 60);
      dd += o.distanceTo(b.p);
      if (n % 4 == 0) pts.push(b.p.clone().setY(b.p.y - 0.12));
      if (dd > lim) break;
    }
    pts.push(b.p.clone().setY(b.p.y - 0.12));
    setLine(prevL, pts);
    if (game.diff.putt == "full") {
      ringM.visible = true;
      ringM.position.copy(b.p).y -= 0.15;
      ringM.scale.setScalar(0.12);
    }
    return;
  }
  const curve = shapeCurve(c),
    a2 = game.aim + compensate(c, p, l, curve);
  const b = mkBall(ball, launchVel(c, p, a2, l), c, { curve });
  const pts = [b.p.clone()];
  let n = 0;
  if (!game.diff.arc) {
    const d = 40;
    const e = ball.clone().add(new THREE.Vector3(Math.cos(game.aim) * d, 0, Math.sin(game.aim) * d));
    e.y = groundY(e.x, e.z) + 0.5;
    setLine(prevL, [ball.clone(), e]);
    return;
  }
  while (b.phase == "air" && !b.done && n++ < 4000) {
    step(b, 1 / 30);
    if (n % 2 == 0) pts.push(b.p.clone());
  }
  pts.push(b.p.clone());
  setLine(prevL, pts);
  ringM.visible = true;
  ringM.position.set(b.p.x, groundY(b.p.x, b.p.z) + 0.35, b.p.z);
  ringM.scale.setScalar(Math.max(0.8, Math.hypot(b.p.x - ball.x, b.p.z - ball.z) / 60));
}
// putting grid
export const gridGrp = new THREE.Group();
scene.add(gridGrp);
export function buildGrid() {
  gridGrp.children.slice().forEach((c) => {
    gridGrp.remove(c);
    c.geometry.dispose();
  });
  const xs = game.greenPoly.map((p) => p[0]),
    zs = game.greenPoly.map((p) => p[1]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    z0 = Math.min(...zs),
    z1 = Math.max(...zs);
  const seg = [],
    arrows = [];
  for (let x = Math.ceil(x0); x <= x1; x += 1)
    for (let z = Math.ceil(z0); z <= z1; z += 1) {
      const inn = (a, b2) => pointInPoly(a, b2, game.greenPoly);
      if (!inn(x, z)) continue;
      if (inn(x + 1, z)) seg.push(x, groundY(x, z) + 0.33, z, x + 1, groundY(x + 1, z) + 0.33, z);
      if (inn(x, z + 1)) seg.push(x, groundY(x, z) + 0.33, z, x, groundY(x, z + 1) + 0.33, z + 1);
      if ((x + z) % 2 == 0) arrows.push([x + 0.5, z + 0.5]);
    }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
  gridGrp.add(
    new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        depthTest: false,
      }),
    ),
  );
  const ag = new THREE.ConeGeometry(0.09, 0.4, 3).rotateX(Math.PI / 2).scale(1, 0.15, 1);
  const am = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    depthTest: false,
  });
  const im = new THREE.InstancedMesh(ag, am, arrows.length);
  const Mx = new THREE.Matrix4(),
    Qt = new THREE.Quaternion(),
    col = new THREE.Color();
  arrows.forEach(([x, z], i) => {
    const [gx, gz] = gradP(x, z);
    const sl = Math.hypot(gx, gz);
    const a = Math.atan2(-gx, -gz);
    Qt.setFromAxisAngle(UP, a);
    const s = 0.6 + Math.min(1.6, sl * 40);
    Mx.compose(new THREE.Vector3(x, groundY(x, z) + 0.36, z), Qt, new THREE.Vector3(1, 1, s));
    im.setMatrixAt(i, Mx);
    col.setHSL(Math.max(0, 0.33 - sl * 9), 0.9, 0.55);
    im.setColorAt(i, col);
  });
  gridGrp.add(im);
  gridGrp.children.forEach((c) => (c.renderOrder = 25));
  gridGrp.visible = false;
}
