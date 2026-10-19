/**
 * Player state helpers: the ball, club choice, aim and launch maths.
 */
import * as THREE from "three";
import { tier } from "./config.js";
import { scene } from "./renderer.js";
import { cupPos } from "./props.js";
import { BALL_R, CLUBS, GRAVITY, ROLL_FRICTION, lie } from "./physics.js";
import { updClubUI } from "./ui.js";
import { game } from "./state.js";

// ---------- game state ----------
game.state = "start";
game.strokes = 0;
game.clubI = 0;
game.aim = 0;
game.shape = 0;
export let ball = new THREE.Vector3();
export let lastSafe = new THREE.Vector3();
game.cur = null;
game.shotRec = [];
game.lastRec = null;
game.stats = { putts: 0, fir: null, gir: false };
export const ballM = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 20, 14),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, emissive: 0x333333 }),
);
ballM.castShadow = !!tier.shadow;
scene.add(ballM);
export const curLie = () => lie(ball.x, ball.z);
export const distPin = () => Math.hypot(cupPos.x - ball.x, cupPos.z - ball.z);
export const club = () => CLUBS[game.clubI];
function lieMul(l) {
  return l == "rough" ? game.diff.rough : l == "bunker" ? game.diff.sand : 1;
}
export function putMax() {
  return Math.max(3, Math.min(25, Math.ceil(distPin() * 1.45)));
}
export function clubTotal(c, l) {
  return c.n == "Putter" ? putMax() : c.d * lieMul(l);
}
export function autoClub() {
  const l = curLie(),
    d = distPin();
  if (l == "green" || (l == "fringe" && d < 12)) {
    game.clubI = 7;
  } else {
    game.clubI = 6;
    for (let i = 0; i < 7; i++) {
      if (clubTotal(CLUBS[i], l) <= d * 1.02) {
        game.clubI = Math.max(0, i - (i > 0 && clubTotal(CLUBS[i], l) < d * 0.97 ? 1 : 0));
        break;
      }
    }
    if (clubTotal(CLUBS[6], l) >= d) game.clubI = 6;
    if (l == "tee") game.clubI = 0;
  }
  updClubUI();
}
export function aimAtPin() {
  game.aim = Math.atan2(cupPos.z - ball.z, cupPos.x - ball.x);
}
export function launchVel(c, p, a, l) {
  if (c.n == "Putter") {
    const d = p * putMax();
    const v = Math.sqrt(2 * ROLL_FRICTION.green * GRAVITY * d);
    return new THREE.Vector3(Math.cos(a) * v, 0, Math.sin(a) * v);
  }
  let th = (c.a * Math.PI) / 180;
  if (l == "bunker") th += 0.1;
  if (l == "rough") th -= 0.03;
  const v = c.v * Math.sqrt(Math.max(0.01, p) * lieMul(l));
  return new THREE.Vector3(Math.cos(a) * v * Math.cos(th), v * Math.sin(th), Math.sin(a) * v * Math.cos(th));
}
export function shapeCurve(c) {
  return c.n == "Putter" ? 0 : game.shape * 1.7;
}
export function compensate(c, p, l, curve) {
  if (!curve) return 0;
  const v = launchVel(c, p, 0, l);
  const T = (2 * v.y) / GRAVITY;
  const disp = 0.5 * curve * T * T * 0.55;
  const dist = v.x * T || 1;
  return -Math.atan2(disp, dist);
}
