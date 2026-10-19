/**
 * TV-style cameras: orbit, hole flyover, aim, chase, landing cut and replay.
 */
import * as THREE from "three";
import { camera } from "./renderer.js";
import { GREEN, TEE, groundY, hdir, holeMid, holePath } from "./course.js";
import { cupPos, tperp } from "./props.js";
import { ball, club, distPin } from "./player.js";
import { endFly } from "./ui.js";
import { game } from "./state.js";

// ---------- cameras ----------
export const camPos = new THREE.Vector3(),
  camLook = new THREE.Vector3(),
  tp = new THREE.Vector3(),
  tl = new THREE.Vector3();
game.camMode = "orbit";
game.landCam = null;
game.camCut = false;
export function aimCamTarget() {
  const putt = club().n == "Putter";
  const dx = Math.cos(game.aim),
    dz = Math.sin(game.aim);
  const back = putt ? Math.min(5, 2.2 + distPin() * 0.3) : 7.5,
    up = putt ? 1.5 : 2.6;
  tp.set(ball.x - dx * back, 0, ball.z - dz * back);
  tp.y = Math.max(groundY(tp.x, tp.z) + 0.6, ball.y) + up;
  const ah = putt ? Math.max(2.5, Math.min(distPin(), 14)) : 45;
  tl.set(ball.x + dx * ah, 0, ball.z + dz * ah);
  tl.y = groundY(tl.x, tl.z) + (putt ? 0 : 2);
}
game.flyT = 0;
const FLY_SECONDS = 11;
let flyC, flyLook;
export function buildFly() {
  const M1 = holePath.length > 2 ? holePath[1] : [(TEE.x + GREEN.x) / 2, (TEE.y + GREEN.y) / 2];
  const flyPts = [
    [TEE.x - hdir.x * 40, 40, TEE.y - hdir.y * 40],
    [holePath[0][0] + hdir.x * 40, 30, holePath[0][1] + hdir.y * 40],
    [M1[0], 26, M1[1]],
    [GREEN.x - hdir.x * 40, 18, GREEN.y - hdir.y * 40],
    [GREEN.x + tperp.x * 35, 14, GREEN.y + tperp.y * 35],
    [GREEN.x + hdir.x * 30, 22, GREEN.y + hdir.y * 30],
  ].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  flyC = new THREE.CatmullRomCurve3(flyPts, false, "centripetal");
  flyLook = new THREE.CatmullRomCurve3([
    new THREE.Vector3(M1[0], 0, M1[1]),
    new THREE.Vector3(M1[0], 0, M1[1]),
    new THREE.Vector3(GREEN.x, 0, GREEN.y),
    new THREE.Vector3(cupPos.x, 0, cupPos.z),
    new THREE.Vector3(cupPos.x, 0, cupPos.z),
    new THREE.Vector3(cupPos.x, 0, cupPos.z),
  ]);
}
export function updCam(dt) {
  if (game.camMode == "free") return;
  let k = 1 - Math.exp(-dt * 3.5),
    kl = k;
  if (game.camMode == "orbit") {
    const a = game.time * 0.05;
    tp.set(GREEN.x + Math.cos(a) * 90, 0, GREEN.y + Math.sin(a) * 90);
    tp.y = groundY(tp.x, tp.z) + 40;
    tl.set(holeMid.x, groundY(holeMid.x, holeMid.y), holeMid.y);
    k = kl = 1;
  } else if (game.camMode == "fly") {
    game.flyT += dt;
    const t = Math.min(1, game.flyT / FLY_SECONDS),
      e = t * t * (3 - 2 * t);
    flyC.getPoint(e, tp);
    tp.y += groundY(tp.x, tp.z);
    flyLook.getPoint(e, tl);
    tl.y = groundY(tl.x, tl.z) + 1;
    k = kl = 1;
    if (t >= 1) endFly();
  } else if (game.camMode == "aim") {
    aimCamTarget();
  } else if (game.camMode == "chase" && game.cur) {
    const h = Math.hypot(game.cur.v.x, game.cur.v.z);
    let dx = Math.cos(game.aim),
      dz = Math.sin(game.aim);
    if (h > 1) {
      dx = game.cur.v.x / h;
      dz = game.cur.v.z / h;
    }
    const putt = game.cur.club.n == "Putter";
    tp.set(ball.x - dx * (putt ? 3.5 : 12), 0, ball.z - dz * (putt ? 3.5 : 12));
    tp.y = Math.max(groundY(tp.x, tp.z) + 2, ball.y + (putt ? 1.2 : 3.5));
    tl.copy(ball);
    k = 1 - Math.exp(-dt * (putt ? 3 : 2.4));
    kl = 1 - Math.exp(-dt * 10);
  } else if (game.camMode == "land" && game.landCam) {
    tp.copy(game.landCam);
    tl.copy(ball);
    k = game.camCut ? 1 : 1 - Math.exp(-dt * 6);
    kl = 1 - Math.exp(-dt * 12);
    game.camCut = false;
  } else if (game.camMode == "replay") {
    tl.copy(ball);
    k = 1 - Math.exp(-dt * 2);
    kl = 1 - Math.exp(-dt * 10);
  }
  camPos.lerp(tp, k);
  camLook.lerp(tl, kl);
  const minY = groundY(camPos.x, camPos.z) + 0.5;
  if (camPos.y < minY) camPos.y = minY;
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const tf = innerWidth < innerHeight ? 62 : 48;
  if (Math.abs(camera.fov - tf) > 0.1) {
    camera.fov = tf;
    camera.updateProjectionMatrix();
  }
}
