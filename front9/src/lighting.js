/**
 * Sun, sky, fog and hemisphere light.
 */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { quality, tier } from "./config.js";
import { scene } from "./renderer.js";

// ---------- lighting ----------
const sunAz = -2.3 + 2.3,
  sunEl = THREE.MathUtils.degToRad(24);
export const sunDir = new THREE.Vector3(
  Math.cos(sunAz) * Math.cos(sunEl),
  Math.sin(sunEl),
  Math.sin(sunAz) * Math.cos(sunEl),
);
const sky = new Sky();
sky.scale.setScalar(3500);
const su = sky.material.uniforms;
su.turbidity.value = 5;
su.rayleigh.value = 1.4;
su.mieCoefficient.value = 0.005;
su.mieDirectionalG.value = 0.85;
su.sunPosition.value.copy(sunDir);
scene.add(sky);
export const fogCol = new THREE.Color(0xdcc9ad);
scene.fog = new THREE.Fog(fogCol, 300, 1400);
sky.material.fog = false;
scene.add(new THREE.HemisphereLight(0xcfe2f5, 0x5a6a35, 1.35));
const sun = new THREE.DirectionalLight(0xffd9a0, 3.0);
scene.add(sun, sun.target);
if (tier.shadow) {
  sun.castShadow = true;
  const sz = quality == "high" ? 95 : 120;
  Object.assign(sun.shadow.camera, { left: -sz, right: sz, top: sz, bottom: -sz, near: 10, far: 900 });
  sun.shadow.mapSize.set(tier.shadow, tier.shadow);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.5;
  if (quality == "high") sun.shadow.radius = 4;
}
export function sunFollow(p) {
  sun.position.set(p.x + sunDir.x * 400, p.y + sunDir.y * 400, p.z + sunDir.z * 400);
  sun.target.position.copy(p);
  sun.target.updateMatrixWorld();
}
