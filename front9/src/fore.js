/**
 * "Fore!" calls: when a full shot is going to finish on another hole's
 * fairway, near another hole, or out of bounds, a shouted "FORE LEFT!" /
 * "FORE RIGHT!" clip plays mid-flight with an on-screen caption.
 *
 * Direction is relative to the line the ball was launched on. Clips are
 * small bundled MP3s in ../audio (two voices per side, picked at random).
 */
import COURSE from "./data/course.json";
import { $ } from "./config.js";
import { HOLES, LAYERS, holeIndex } from "./course.js";
import { pointInPoly, segDist } from "./geometry.js";
import { AC, master } from "./audio.js";
import { game } from "./state.js";

const CLIPS = { left: ["audio/fore-left-1.mp3", "audio/fore-left-2.mp3"], right: ["audio/fore-right-1.mp3", "audio/fore-right-2.mp3"] };
const bufs = { left: [], right: [] };
let loading = false;
/** Decode the clips once the AudioContext exists (after the first tap). */
export function foreLoad() {
  if (loading || !AC) return;
  loading = true;
  for (const side of ["left", "right"])
    CLIPS[side].forEach((url, i) =>
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((a) => AC.decodeAudioData(a))
        .then((b) => (bufs[side][i] = b))
        .catch(() => {}),
    );
}
const holeDist = (h, x, z) => {
  let d = 1e9;
  for (let k = 0; k < h.pts.length - 1; k++) d = Math.min(d, segDist(x, z, h.pts[k], h.pts[k + 1]));
  return d;
};
/**
 * Decide whether a shot needs a Fore call.
 * @param from launch position, @param to predicted landing/rest point, @param v launch velocity
 * @returns "left" | "right" | null
 */
export function foreCheck(from, to, v) {
  const x = to.x,
    z = to.z;
  const dCur = holeDist(HOLES[holeIndex], x, z);
  if (dCur < 22) return null; // still on our own hole corridor
  const ob = COURSE.boundary && !pointInPoly(x, z, COURSE.boundary);
  let other = false;
  HOLES.forEach((h, i) => {
    if (i == holeIndex) return;
    const d = holeDist(h, x, z);
    if (d < 40 && d < dCur) other = true;
  });
  const onFW = (LAYERS.fairway || []).some((P) => pointInPoly(x, z, P));
  if (!(ob || other || (onFW && dCur > 30))) return null;
  // right-hand side of the launch direction in the xz-plane is (-vz, vx)
  const ox = x - from.x,
    oz = z - from.z;
  return -ox * v.z + oz * v.x > 0 ? "right" : "left";
}
/** Shout and show the caption (once per shot; the caller guards that). */
export function foreShout(side) {
  const el = $("fore");
  el.textContent = side == "left" ? "FORE LEFT! ⬅️" : "FORE RIGHT! ➡️";
  el.classList.remove("on");
  void el.offsetWidth;
  el.classList.add("on");
  clearTimeout(foreShout.t);
  foreShout.t = setTimeout(() => el.classList.remove("on"), 2600);
  game.foreCount = (game.foreCount || 0) + 1;
  if (!AC || !game.sound) return;
  const list = bufs[side].filter(Boolean);
  if (!list.length) return;
  const s = AC.createBufferSource();
  s.buffer = list[(Math.random() * list.length) | 0];
  const g = AC.createGain();
  g.gain.value = 1.1;
  s.connect(g).connect(master);
  s.start();
}
