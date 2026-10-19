/**
 * Static course meshes: terrain, fairways, tees, greens, bunkers, water and cart paths.
 */
import * as THREE from "three";
import COURSE from "./data/course.json";
import DEM from "./data/elevation.json";
import { tier } from "./config.js";
import { scene } from "./renderer.js";
import {
  COURSE_CENTRE,
  DEM_NX,
  DEM_NY,
  ELEV_EXAG,
  HOLE,
  LAYERS,
  bunkerShape,
  bunkers,
  demHeight,
  groundY,
  near,
} from "./course.js";
import { polyDist, offsetPoly, pointInPoly, resample, shapeH, shp, subdiv } from "./geometry.js";
import { fogCol, sunDir } from "./lighting.js";
import { grassMat, greenNormalTex, sandTex } from "./materials.js";
import { game } from "./state.js";

/**
 * Drape a flat polygon (with optional holes) over the terrain.
 * fadeBand > 0 adds a per-vertex "fade" attribute that goes 0 → 1 over that many
 * metres in from the outline; fade-enabled materials dither it into a ragged,
 * natural grass edge instead of a hard polygon line.
 */
function flat(P, mat, y, uvS = 5, hole = null, maxE = tier.maxE, fadeBand = 0) {
  const g = subdiv(
    new THREE.ShapeGeometry(
      shapeH(resample(P, maxE, true), hole && hole.map((h) => resample(h, Math.min(maxE, 1), true))),
    ),
    maxE,
  );
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const X = p.getX(i),
      Z = -p.getY(i);
    p.setXYZ(i, X, groundY(X, Z) + y, Z);
    uv[i * 2] = Z / uvS;
    uv[i * 2 + 1] = X / uvS;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (fadeBand > 0) {
    const fade = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++)
      fade[i] = Math.min(1, Math.max(0, -polyDist(p.getX(i), p.getZ(i), P) / fadeBand));
    g.setAttribute("fade", new THREE.BufferAttribute(fade, 1));
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
// terrain with vertex colour (paddock vs course rough) + AO
const RGH = new THREE.Color(0x4f7330),
  PAD = new THREE.Color(0x6b7a3a),
  AOc = new THREE.Color();
{
  const WX = (DEM_NX - 1) * DEM.sp,
    WZ = (DEM_NY - 1) * DEM.sp,
    ST = tier.step,
    tg = new THREE.PlaneGeometry(WX, WZ, Math.floor((DEM_NX - 1) / ST), Math.floor((DEM_NY - 1) / ST));
  tg.rotateX(-Math.PI / 2);
  const p = tg.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const X = p.getX(i) + DEM.x0 + WX / 2,
      Z = p.getZ(i) + DEM.y0 + WZ / 2;
    const bk = bunkerShape(X, Z);
    const h = demHeight(X, Z) + (bk < 0 ? bk - 0.35 : bk !== 0 ? -0.3 : 0);
    p.setXYZ(i, X, h, Z);
    const lap =
      (demHeight(X + 6, Z) + demHeight(X - 6, Z) + demHeight(X, Z + 6) + demHeight(X, Z - 6)) / 4 -
      demHeight(X, Z);
    const ao = Math.max(0.62, Math.min(1.08, 1 - lap * 0.35));
    const inC = pointInPoly(X, Z, COURSE.boundary);
    AOc.copy(inC ? RGH : PAD);
    const v = 0.92 + 0.16 * Math.sin(X * 0.05 + Z * 0.03) * Math.cos(Z * 0.041);
    AOc.multiplyScalar(ao * v);
    col[i * 3] = AOc.r;
    col[i * 3 + 1] = AOc.g;
    col[i * 3 + 2] = AOc.b;
  }
  tg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  tg.computeVertexNormals();
  const tm = new THREE.Mesh(tg, grassMat({ a: 0xffffff, vc: true, rep: 3 }));
  tm.receiveShadow = true;
  scene.add(tm);
  const gp2 = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x5f6f34, roughness: 1 }),
  );
  gp2.position.set(COURSE_CENTRE.x, -1.5, COURSE_CENTRE.y);
  scene.add(gp2);
}
const HOLE_RADIUS = 120;
const turf = {
  cut: grassMat({ a: 0x5b8d34, b: 0x5f9237, order: 2, rep: 2.5, fade: true }),
  fair: grassMat({ a: 0x6cab42, b: 0x84c457, sw: 7, order: 3, rep: 2.2 }),
  col: grassMat({ a: 0x6fb447, b: 0x77bb4d, order: 4, rep: 1.6, fade: true }),
  green: grassMat({
    a: 0x7cc753,
    b: 0x8ad25f,
    sw: 2.6,
    xw: 2.6,
    order: 6,
    rep: 1.2,
    nm: greenNormalTex,
    ns: 0.35,
    rough: 0.8,
  }),
  tee: grassMat({ a: 0x73b84b, b: 0x85c75a, sw: 1.8, order: 5, rep: 1.6 }),
  sur: grassMat({ a: 0x5c8e35, order: 5, rep: 2.4, fade: true }),
};
const sandM = new THREE.MeshStandardMaterial({
  map: sandTex,
  roughness: 1,
  polygonOffset: true,
  polygonOffsetFactor: -7,
  polygonOffsetUnits: -14,
});
export const holeFW = (LAYERS.fairway || []).filter((P) => near(P, HOLE_RADIUS));
const bIn = (P) =>
  bunkers.filter((b) => pointInPoly(b.c[0], b.c[1], P)).map((b) => offsetPoly(b.P, 0.05).reverse());
holeFW.forEach((P) =>
  flat(offsetPoly(P, 2.4), turf.cut, 0.12, 6, bIn(offsetPoly(P, 2.4)), tier.maxE * 1.4, 1.8),
);
holeFW.forEach((P) => flat(P, turf.fair, 0.2, 6, bIn(P)));
(LAYERS.tee || [])
  .filter((P) => near(P, HOLE_RADIUS))
  .forEach((P) => {
    flat(offsetPoly(P, 1), turf.cut, 0.25, 4, null, tier.maxE, 0.8);
    flat(P, turf.tee, 0.4, 4);
  });
const GREENS = (LAYERS.green || []).filter((P) => near(P, HOLE_RADIUS));
game.greenPoly = LAYERS.green[HOLE.green];
GREENS.forEach((P) => {
  flat(offsetPoly(P, 1.5), turf.col, 0.26, 3, null, Math.min(1.2, tier.maxE), 0.6);
  flat(P, turf.green, 0.3, 4, null, Math.min(1, tier.maxE));
});
// bunkers: surround turf, sand bowl, lip edge
function tube(P, rad, col, yo) {
  const pts = resample(P, 1.2, true).map((p) => new THREE.Vector3(p[0], groundY(p[0], p[1]) + yo, p[1]));
  const m = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), pts.length * 2, rad, 5, true),
    new THREE.MeshStandardMaterial({ color: col, roughness: 1 }),
  );
  m.receiveShadow = true;
  m.castShadow = !!tier.shadow;
  scene.add(m);
}
bunkers.forEach((b) => {
  flat(offsetPoly(b.P, 2.2), turf.sur, 0.18, 4, [offsetPoly(b.P, 0.05).reverse()], 0.9, 1.6);
  flat(b.P, sandM, 0.3, 4.5, null, 0.7);
  tube(b.P, 0.22, 0x4e7d2c, 0.32);
});
// water
export const wU = {
  time: { value: 0 },
  sunDir: { value: sunDir },
  fogColor: { value: fogCol },
  fogNear: { value: 300 },
  fogFar: { value: 1400 },
};
const waterMat = new THREE.ShaderMaterial({
  uniforms: wU,
  polygonOffset: true,
  polygonOffsetFactor: -8,
  polygonOffsetUnits: -16,
  vertexShader: `varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader: `uniform float time;uniform vec3 sunDir,fogColor;uniform float fogNear,fogFar;varying vec3 wp;
float h(vec2 p){return sin(p.x*.9+time*1.3)*.5+sin(p.y*1.1-time*1.7+p.x*.3)*.5+sin((p.x+p.y)*2.3+time*2.1)*.25+sin((p.x-p.y)*3.7-time*2.9)*.15+sin(length(p-vec2(floor(p.x/9.)*9.+4.5,floor(p.y/9.)*9.+4.5))*6.-time*4.)*.08;}
void main(){vec2 p=wp.xz;float e=.05;vec3 n=normalize(vec3(-(h(p+vec2(e,0))-h(p))/e*.05,1.,-(h(p+vec2(0,e))-h(p))/e*.05));
vec3 v=normalize(cameraPosition-wp);float fr=.03+.97*pow(1.-max(dot(n,v),0.),5.);vec3 rd=reflect(-v,n);
float up=clamp(rd.y,0.,1.);vec3 skyc=mix(vec3(.86,.78,.66),vec3(.32,.52,.78),pow(up,.45));
float treeBand=smoothstep(.02,.16,up)*(1.-smoothstep(.16,.3,up));skyc=mix(skyc,vec3(.1,.17,.08),treeBand*.85);
vec3 deep=vec3(.04,.16,.18);vec3 col=mix(deep,skyc,clamp(fr*.9+.12,0.,.85));
float sp=pow(max(dot(rd,sunDir),0.),300.);col+=vec3(1.,.9,.7)*sp*6.;
float d=length(cameraPosition-wp);col=mix(col,fogColor,smoothstep(fogNear,fogFar,d));gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
});
const WLV = [];
(LAYERS.water || []).forEach((P, wi) => {
  const lv = (DEM.water[wi] ?? 0.6) * ELEV_EXAG + 0.1;
  WLV.push(lv);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shp(P)).rotateX(-Math.PI / 2), waterMat);
  m.position.y = lv;
  scene.add(m);
  tube(P, 0.6, 0x6b5a3a, -0.35 + lv - groundY(P[0][0], P[0][1]));
});
(COURSE.lines.river || []).forEach((P) => {
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i],
      b = P[i + 1],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      l = Math.hypot(dx, dz);
    if (l < 0.1) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l + 10, 18).rotateX(-Math.PI / 2), waterMat);
    m.rotation.y = -Math.atan2(dz, dx);
    m.position.set(
      (a[0] + b[0]) / 2,
      Math.min(demHeight(a[0], a[1]), demHeight(b[0], b[1])) + 0.15,
      (a[1] + b[1]) / 2,
    );
    scene.add(m);
  }
});
// cart paths (merged ribbon)
{
  const pos = [];
  (COURSE.lines.road || [])
    .filter((P) => near(P, 300))
    .forEach((P0) => {
      const inC = pointInPoly(P0[0][0], P0[0][1], COURSE.boundary);
      const w = inC ? 1.4 : 3.5;
      const P = resample(P0, 2.5, false);
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i],
          b = P[i + 1],
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          l = Math.hypot(dx, dz) || 1,
          nx = (-dz / l) * w,
          nz = (dx / l) * w;
        const ya = groundY(a[0], a[1]) + 0.22,
          yb = groundY(b[0], b[1]) + 0.22;
        pos.push(
          a[0] + nx,
          ya,
          a[1] + nz,
          b[0] + nx,
          yb,
          b[1] + nz,
          a[0] - nx,
          ya,
          a[1] - nz,
          b[0] + nx,
          yb,
          b[1] + nz,
          b[0] - nx,
          yb,
          b[1] - nz,
          a[0] - nx,
          ya,
          a[1] - nz,
        );
      }
    });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      color: 0xb9b2a2,
      roughness: 0.95,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
    }),
  );
  m.receiveShadow = true;
  scene.add(m);
}
