/**
 * Sun, sky, fog and hemisphere light.
 */
import * as THREE from "three";
import { lightMode, quality, tier } from "./config.js";
import { scene } from "./renderer.js";

// ---------- lighting ----------
export const GOLDEN = lightMode == "golden";
// golden hour: low warm sun from the west-ish, long shadows, warm haze
const L = GOLDEN
  ? { az: 0.35, el: 8.5, tb: 9, ray: 2.6, mie: 0.012, fog: 0xe8b98a, hemiS: 0xf3cfa6, hemiG: 0x5a4a2a, hemiI: 1.0, sunC: 0xffa860, sunI: 3.6, exp: 0.95 }
  : { az: 0, el: 28, tb: 2.6, ray: 2.2, mie: 0.004, fog: 0xcfdbe2, hemiS: 0xc9def5, hemiG: 0x5a6a35, hemiI: 1.3, sunC: 0xfff0d6, sunI: 3.1, exp: 1.0 };
const sunAz = L.az,
  sunEl = THREE.MathUtils.degToRad(L.el);
export const exposure = L.exp;
export const sunDir = new THREE.Vector3(
  Math.cos(sunAz) * Math.cos(sunEl),
  Math.sin(sunEl),
  Math.sin(sunAz) * Math.cos(sunEl),
);
// gradient sky dome: zenith blue → hazy horizon, warm glow around the sun
const SKY = GOLDEN
  ? { hz: 0xffc58e, zn: 0x48699f, glow: 0xffc27a, gi: 1.6 }
  : { hz: 0xdde9f0, zn: 0x3b7bd0, glow: 0xfff1d0, gi: 0.6 };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(3400, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      hz: { value: new THREE.Color(SKY.hz) },
      zn: { value: new THREE.Color(SKY.zn) },
      glow: { value: new THREE.Color(SKY.glow) },
      gi: { value: SKY.gi },
      sd: { value: null },
    },
    vertexShader: `varying vec3 vd;void main(){vd=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader: `uniform vec3 hz,zn,glow,sd;uniform float gi;varying vec3 vd;
void main(){vec3 d=normalize(vd);float h=max(d.y,0.);
vec3 c=mix(hz,zn,pow(h,.55));c=mix(c,hz*.85,smoothstep(0.,-.08,d.y));
float s=max(dot(d,sd),0.);c+=glow*(pow(s,6.)*.35+pow(s,64.)*.6)*gi+glow*pow(s,1500.)*8.;
gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
  }),
);
sky.material.uniforms.sd.value = sunDir;
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);
export const fogCol = new THREE.Color(L.fog);
scene.fog = new THREE.Fog(fogCol, 300, 1400);
scene.add(new THREE.HemisphereLight(L.hemiS, L.hemiG, L.hemiI));
const sun = new THREE.DirectionalLight(L.sunC, L.sunI);
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
  sky.position.copy(p);
  sun.position.set(p.x + sunDir.x * 400, p.y + sunDir.y * 400, p.z + sunDir.z * 400);
  sun.target.position.copy(p);
  sun.target.updateMatrixWorld();
}
