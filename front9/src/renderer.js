/**
 * three.js renderer, scene, camera and optional bloom post-processing.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { $, lightMode, quality, tier } from "./config.js";

// ---------- renderer ----------
export const renderer = new THREE.WebGLRenderer({
  antialias: quality != "low",
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, tier.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = lightMode == "golden" ? 0.95 : 1.0;
if (tier.shadow) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality == "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
}
$("wrap").appendChild(renderer.domElement);
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 4000);
export let composer = null;
/**
 * High-tier colour grade, applied in display space after tone mapping:
 * gentle S-curve contrast, a touch more saturation, warm highlights /
 * cool shadows split-tone and a soft vignette.
 */
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    warm: { value: lightMode == "golden" ? 1 : 0 },
  },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float warm;varying vec2 vUv;
void main(){vec4 t=texture2D(tDiffuse,vUv);vec3 c=t.rgb;
float l=dot(c,vec3(.2126,.7152,.0722));
c=mix(vec3(l),c,1.12+warm*.04);
vec3 sc=mix(c,c*c*(3.-2.*c),.28);c=clamp(sc,0.,1.);
l=dot(c,vec3(.2126,.7152,.0722));
c+=mix(vec3(-.012,0.,.022),vec3(.03,.012,-.02)*(1.+warm),smoothstep(.25,.85,l));
vec2 d=vUv-.5;c*=1.-dot(d,d)*(.55+warm*.25);
gl_FragColor=vec4(c,t.a);}`,
};
if (tier.bloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.5, 0.92));
  composer.addPass(new OutputPass());
  if (tier.fx) composer.addPass(new ShaderPass(GRADE));
}
