/**
 * Procedural textures and the shader-patched turf material (mowing
 * stripes, detail noise, soft dithered edges).
 */
import * as THREE from "three";
import { tier } from "./config.js";
import { renderer } from "./renderer.js";

// ---------- textures ----------
let seed = 11;
export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export function ctex(sz, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = c.height = sz;
  const x = c.getContext("2d");
  draw(x, sz);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
const TEX_SIZE = tier.tex;
const detailTex = ctex(
  TEX_SIZE,
  (x, s) => {
    x.fillStyle = "#808080";
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < (s * s) / 6; i++) {
      const v = (90 + rnd() * 80) | 0;
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.globalAlpha = 0.5;
      const px = rnd() * s,
        py = rnd() * s;
      x.fillRect(px, py, 1, 2 + rnd() * 3);
    }
    x.globalAlpha = 1;
  },
  false,
);
export const sandTex = ctex(TEX_SIZE, (x, s) => {
  x.fillStyle = "#e8d6a4";
  x.fillRect(0, 0, s, s);
  for (let i = 0; i < (s * s) / 3; i++) {
    const v = rnd();
    x.fillStyle = v < 0.5 ? "#d6c08a" : "#f6e8c2";
    x.globalAlpha = 0.5;
    x.fillRect(rnd() * s, rnd() * s, 1.3, 1.3);
  }
  x.globalAlpha = 0.35;
  for (let k = 0; k < s; k += s / 16) {
    x.strokeStyle = "#bfa671";
    x.lineWidth = s / 90;
    x.beginPath();
    for (let u = 0; u <= s; u += 4) {
      const y = k + (Math.sin((u / s) * Math.PI * 2) * s) / 22;
      u ? x.lineTo(u, y) : x.moveTo(u, y);
    }
    x.stroke();
    x.strokeStyle = "#fff3d6";
    x.lineWidth = s / 160;
    x.beginPath();
    for (let u = 0; u <= s; u += 4) {
      const y = k + s / 48 + (Math.sin((u / s) * Math.PI * 2) * s) / 22;
      u ? x.lineTo(u, y) : x.moveTo(u, y);
    }
    x.stroke();
  }
  x.globalAlpha = 1;
});
export const greenNormalTex = (() => {
  const s = TEX_SIZE,
    c = document.createElement("canvas");
  c.width = c.height = s;
  const x = c.getContext("2d");
  const h = new Float32Array(s * s);
  for (let o = 0; o < 4; o++) {
    const f = 4 << o,
      a = 1 / (1 << o);
    const g = new Float32Array((f + 1) * (f + 1)).map(() => rnd());
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const u = (i / s) * f,
          v = (j / s) * f,
          i0 = u | 0,
          j0 = v | 0,
          fu = u - i0,
          fv = v - j0,
          G = (a2, b2) => g[(b2 % f) * (f + 1) + (a2 % f)];
        h[j * s + i] +=
          a *
          ((G(i0, j0) * (1 - fu) + G(i0 + 1, j0) * fu) * (1 - fv) +
            (G(i0, j0 + 1) * (1 - fu) + G(i0 + 1, j0 + 1) * fu) * fv);
      }
  }
  const im = x.createImageData(s, s);
  for (let j = 0; j < s; j++)
    for (let i = 0; i < s; i++) {
      const dx = h[j * s + ((i + 1) % s)] - h[j * s + ((i - 1 + s) % s)],
        dy = h[((j + 1) % s) * s + i] - h[((j - 1 + s) % s) * s + i];
      let nx = -dx * 3,
        ny = -dy * 3,
        nz = 1,
        l = Math.hypot(nx, ny, nz);
      const k = (j * s + i) * 4;
      im.data[k] = ((nx / l) * 0.5 + 0.5) * 255;
      im.data[k + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      im.data[k + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      im.data[k + 3] = 255;
    }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
const NOISE = `float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}`;
export const stripeDir = { value: new THREE.Vector2(1, 0) };
export function grassMat(o) {
  const m = new THREE.MeshStandardMaterial({
    roughness: o.rough ?? 0.93,
    metalness: 0,
    vertexColors: !!o.vc,
    normalMap: o.nm || null,
    normalScale: new THREE.Vector2(o.ns || 0, o.ns || 0),
    polygonOffset: o.order != null,
    polygonOffsetFactor: -(o.order || 0),
    polygonOffsetUnits: -(o.order || 0) * 2,
  });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, {
      cA: { value: new THREE.Color(o.a) },
      cB: { value: new THREE.Color(o.b ?? o.a) },
      sw: { value: o.sw || 0 },
      det: { value: detailTex },
      drep: { value: o.rep || 2.5 },
      hd: stripeDir,
      xw: { value: o.xw || 0 },
    });
    const fade = !!o.fade;
    s.vertexShader =
      (fade ? "attribute float fade;varying float vFade;\n" : "") +
      "varying vec3 vWP;\n" +
      s.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;" +
          (fade ? "vFade=fade;" : ""),
      );
    s.fragmentShader =
      (fade ? "varying float vFade;\n" : "") +
      "uniform vec3 cA,cB;uniform float sw,drep,xw;uniform sampler2D det;uniform vec2 hd;varying vec3 vWP;\n" +
      NOISE +
      "\n" +
      s.fragmentShader.replace(
        "#include <map_fragment>",
        `
  float st=0.;if(sw>0.){float ac=dot(vWP.xz,vec2(-hd.y,hd.x));st=smoothstep(.4,.6,abs(fract(ac/sw)-.5)*2.);if(xw>0.){float al=dot(vWP.xz,hd);st=mix(st,1.-st,step(.5,fract(al/xw))*.5);}}
  vec3 gc=mix(cA,cB,st);float dd=texture2D(det,vWP.xz/drep).r;float dd2=texture2D(det,vWP.xz/(drep*7.3)).r;float n=vnoise(vWP.xz*.07)*.55+vnoise(vWP.xz*.29)*.3;
  gc*=(.8+.42*dd)*(.9+.2*dd2)*(.86+.28*n);` +
          // rough variation: dry straw patches, lush damp hollows and clover clumps
          (o.rv
            ? `float rp=vnoise(vWP.xz*.035+3.1)*.65+vnoise(vWP.xz*.11)*.35;gc*=mix(vec3(.9,1.02,.86),vec3(1.16,1.08,.74),smoothstep(.5,.78,rp));float cl=smoothstep(.72,.8,vnoise(vWP.xz*.6+7.));gc=mix(gc,gc*vec3(.82,1.05,.8),cl*.6);`
            : "") +
          `diffuseColor.rgb*=gc;` +
          // dithered soft edge: blotchy noise threshold makes a ragged grass margin
          (fade
            ? `float fn=vnoise(vWP.xz*1.3)*.6+h21(floor(vWP.xz*9.))*.4;if(vFade<fn*.95+.03)discard;`
            : ""),
      );
  };
  m.customProgramCacheKey = () => "g" + (o.vc ? 1 : 0) + (o.nm ? 1 : 0) + (o.fade ? 1 : 0) + (o.rv ? 1 : 0);
  return m;
}

/** Normal map for raked bunker sand (rake furrows + grain); used on the High tier. */
export const sandNormalTex = (() => {
  const s = TEX_SIZE,
    c = document.createElement("canvas");
  c.width = c.height = s;
  const x = c.getContext("2d");
  const h = new Float32Array(s * s);
  for (let j = 0; j < s; j++)
    for (let i = 0; i < s; i++) {
      const y = j + (Math.sin((i / s) * Math.PI * 2) * s) / 22;
      h[j * s + i] = Math.sin((y / s) * Math.PI * 2 * 16) * 0.6 + rnd() * 0.35;
    }
  const im = x.createImageData(s, s);
  for (let j = 0; j < s; j++)
    for (let i = 0; i < s; i++) {
      const dx = h[j * s + ((i + 1) % s)] - h[j * s + ((i - 1 + s) % s)],
        dy = h[((j + 1) % s) * s + i] - h[((j - 1 + s) % s) * s + i];
      const nx = -dx * 1.5,
        ny = -dy * 1.5,
        l = Math.hypot(nx, ny, 1),
        k = (j * s + i) * 4;
      im.data[k] = ((nx / l) * 0.5 + 0.5) * 255;
      im.data[k + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      im.data[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      im.data[k + 3] = 255;
    }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
