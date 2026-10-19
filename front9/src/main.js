/**
 * Entry point: wires the modules together, runs the render/update loop and
 * auto-drops graphics quality on slow devices.
 */
import { params, quality, qualitySetting, store } from "./config.js";
import { camera, composer, renderer, scene } from "./renderer.js";
import { TEE, hdir } from "./course.js";
import { sunFollow } from "./lighting.js";
import { wU } from "./scenery.js";
import { sway } from "./vegetation.js";
import { parts, updBirds, waveFlag } from "./props.js";
import { SFX, windNode } from "./audio.js";
import { newWind, surfY, wind, windNow } from "./physics.js";
import { ball, ballM } from "./player.js";
import { gridGrp, prevL, ringM, tracer } from "./preview.js";
import { camLook, camPos, updCam } from "./camera.js";
import { loadHole } from "./holes.js";
import { update } from "./game.js";
import { updMeter } from "./swing.js";
import { hud, toStart } from "./ui.js";
import { installTestHooks } from "./debug.js";
import { game } from "./state.js";

// ---------- loop ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer && composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  [prevL, tracer].forEach((l) => l.material.resolution.set(innerWidth, innerHeight));
}
addEventListener("resize", resize);
let last = performance.now(),
  fpsN = 0,
  fpsT = 0,
  birdT = 3,
  checked = !!store.cgQChecked || qualitySetting != "auto";
export function render() {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}
export function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  render();
  requestAnimationFrame(frame);
}
export function tick(dt) {
  update(dt);
  if (game.state == "aim") updMeter(dt);
  updCam(dt);
  ballM.position.copy(ball);
  sunFollow(game.state == "start" || game.state == "intro" ? camLook : ball);
  wU.time.value = game.time;
  sway.value = game.time * (0.6 + wind.spd * 0.12);
  const w = windNow();
  waveFlag(game.time, Math.atan2(w.z, w.x), w.s);
  updBirds(game.time);
  ringM.material.opacity = 0.55 + 0.35 * Math.sin(game.time * 5);
  if (gridGrp.visible) gridGrp.children[1].material.opacity = 0.6 + 0.3 * Math.sin(game.time * 3);
  if (parts) {
    const a = parts.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += (w.x * 1.3 + Math.sin(game.time + i) * 0.3) * dt;
      a[i + 1] += Math.sin(game.time * 2 + i) * 0.2 * dt;
      a[i + 2] += (w.z * 1.3 + Math.cos(game.time + i) * 0.3) * dt;
      for (let k = 0; k < 3; k++) {
        const c = k == 0 ? camPos.x : k == 1 ? camPos.y : camPos.z;
        const o = a[i + k] - c;
        if (o > 40) a[i + k] -= 80;
        else if (o < -40) a[i + k] += 80;
      }
    }
    parts.geometry.attributes.position.needsUpdate = true;
    parts.material.opacity = Math.min(0.8, 0.2 + w.s * 0.08);
  }
  if (windNode) windNode.gain.value = 0.015 + w.s * 0.006;
  birdT -= dt;
  if (birdT < 0) {
    birdT = 4 + Math.random() * 7;
    if (game.state != "start") SFX.bird();
  }
  if (game.state == "aim" || game.state == "fly") hud();
  if (!checked && game.state == "start") {
    fpsN++;
    fpsT += dt;
    if (fpsT > 3) {
      checked = true;
      store.cgQChecked = 1;
      const f = fpsN / fpsT;
      if (f < 28 && quality != "low") {
        store.cgQAuto = quality == "high" ? "med" : "low";
        location.reload();
      }
    }
  }
}
loadHole(0);
toStart();
newWind();
ball.set(TEE.x + hdir.x, 0, TEE.y + hdir.y);
ball.y = surfY(ball.x, ball.z, "tee");
if (params.has("debug")) installTestHooks();
