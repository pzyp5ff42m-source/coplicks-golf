/**
 * three.js renderer, scene, camera and optional bloom post-processing.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { $, quality, tier } from "./config.js";

// ---------- renderer ----------
export const renderer = new THREE.WebGLRenderer({
  antialias: quality != "low",
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, tier.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
if (tier.shadow) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality == "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
}
$("wrap").appendChild(renderer.domElement);
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 4000);
export let composer = null;
if (tier.bloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.5, 0.92));
  composer.addPass(new OutputPass());
}
