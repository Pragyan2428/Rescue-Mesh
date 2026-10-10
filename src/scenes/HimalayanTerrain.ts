/**
 * Procedural Himalayan environment: height-mapped terrain with vertex colour
 * (meadow, rock, cliffs, snow), contour lines, blackout tint, instanced rocks
 * and conifers, a river, the access road and layered distant ranges.
 * Conceptual visualization only — not a DEM of Kishtwar.
 */
import * as THREE from 'three';
import { WORLD } from '../data/systemConstants';
import { MAIN_VALLEY, ROAD, ROAD_BLACKOUT_INDEX, elevationM, elevToY, elevationFar, fbm, groundY, slopeAt } from '../utils/terrainField';
import { LANDSLIDE_ZONE } from '../data/demoStations';

const U = WORLD.unitsPerKm;

export interface TerrainOptions {
  segments: number;
  halfKm?: number;
  center?: { x: number; z: number };
  instances?: { rocks: number; trees: number };
  distant?: boolean;
}

export interface TerrainUniforms {
  uBlackoutR: { value: number };
  uBlackoutOn: { value: number };
  uContours: { value: number };
  uTime: { value: number };
  uLandslide: { value: number };
}

const C = {
  meadow: new THREE.Color(0x56603f),
  meadow2: new THREE.Color(0x6d6a4b),
  forest: new THREE.Color(0x253328),
  forest2: new THREE.Color(0x2f3d2c),
  rock: new THREE.Color(0x50545a),
  rock2: new THREE.Color(0x6b665e),
  cliff: new THREE.Color(0x2a2d31),
  snow: new THREE.Color(0xe4ebf1),
  scree: new THREE.Color(0x7a746a),
};
const tmpC = new THREE.Color();
function colorFor(elev: number, slope: number, x: number, z: number, out: THREE.Color) {
  const n = fbm(x * 1.7, z * 1.7, 2) * 0.5 + 0.5;
  const n2 = fbm(x * 0.45 + 9, z * 0.45 - 4, 2) * 0.5 + 0.5;
  const meadow = tmpC.copy(C.meadow).lerp(C.meadow2, n);
  out.copy(meadow);
  // conifer forest on lower slopes (Kishtwar valleys are heavily forested)
  const forestAmt = (1 - THREE.MathUtils.smoothstep(elev, 3050, 3450)) * THREE.MathUtils.smoothstep(slope, 0.12, 0.3) * (1 - THREE.MathUtils.smoothstep(slope, 0.85, 1.1)) * THREE.MathUtils.smoothstep(n2, 0.3, 0.55);
  out.lerp(C.forest, forestAmt * 0.9).lerp(C.forest2, forestAmt * n * 0.3);
  // rock above the tree line and on steep ground
  const rockAmt = Math.max(THREE.MathUtils.smoothstep(elev, 3300, 3800), THREE.MathUtils.smoothstep(slope, 0.55, 0.9));
  const rock = new THREE.Color().copy(C.rock).lerp(C.rock2, n);
  out.lerp(rock, rockAmt);
  out.lerp(C.scree, THREE.MathUtils.smoothstep(elev, 3600, 4000) * (1 - THREE.MathUtils.smoothstep(slope, 0.3, 0.6)) * 0.35);
  out.lerp(C.cliff, THREE.MathUtils.smoothstep(slope, 0.9, 1.5) * 0.8);
  // banded rock strata on high faces
  const band = Math.sin(elev / 140 + n * 2.5) * 0.5 + 0.5;
  out.lerp(C.cliff, THREE.MathUtils.smoothstep(elev, 3900, 4400) * band * 0.35);
  const snowLine = 4650 + n * 420;
  const snow = THREE.MathUtils.smoothstep(elev, snowLine, snowLine + 320) * (1 - THREE.MathUtils.smoothstep(slope, 0.5, 0.9));
  out.lerp(C.snow, snow);
  return out;
}

export function createTerrain(opts: TerrainOptions) {
  const half = opts.halfKm ?? WORLD.terrainHalfKm;
  const c = opts.center ?? { x: 0, z: 0 };
  const size = half * 2 * U;
  const geo = new THREE.PlaneGeometry(size, size, opts.segments, opts.segments);
  geo.rotateX(-Math.PI / 2);
  geo.translate(c.x * U, 0, c.z * U);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / U;
    const z = pos.getZ(i) / U;
    const e = elevationM(x, z);
    pos.setY(i, elevToY(e));
    colorFor(e, slopeAt(x, z), x, z, col);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const uniforms: TerrainUniforms = {
    uBlackoutR: { value: 0 },
    uBlackoutOn: { value: 0 },
    uContours: { value: 0 },
    uTime: { value: 0 },
    uLandslide: { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0 });
  const vexag = WORLD.verticalExaggeration;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      uLs: { value: new THREE.Vector3(LANDSLIDE_ZONE.x * U, LANDSLIDE_ZONE.z * U, LANDSLIDE_ZONE.r * U) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos; uniform float uBlackoutR; uniform float uBlackoutOn; uniform float uContours; uniform float uTime; uniform float uLandslide; uniform vec3 uLs;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float r = length(vWPos.xz);
        if (uBlackoutOn > 0.001) {
          float inside = 1.0 - smoothstep(uBlackoutR - 1.5, uBlackoutR, r);
          vec3 tinted = mix(gl_FragColor.rgb, vec3(dot(gl_FragColor.rgb, vec3(0.3,0.59,0.11))) * vec3(0.95,0.72,0.7), 0.55);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, tinted, inside * uBlackoutOn);
          float edge = smoothstep(uBlackoutR - 2.5, uBlackoutR - 0.6, r) * (1.0 - smoothstep(uBlackoutR - 0.6, uBlackoutR + 0.2, r));
          gl_FragColor.rgb += vec3(1.0, 0.42, 0.37) * edge * 0.85 * uBlackoutOn;
        }
        if (uContours > 0.001) {
          float elev = vWPos.y / (${(U * vexag).toFixed(3)}) * 1000.0 + 2300.0;
          float c = abs(fract(elev / 200.0 + 0.5) - 0.5) / fwidth(elev / 200.0);
          float line = 1.0 - min(c, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.62, 0.86, 0.92), line * 0.35 * uContours);
        }
        if (uLandslide > 0.001) {
          float d = length((vWPos.xz - uLs.xy) * vec2(1.0, 1.0));
          float zone = 1.0 - smoothstep(uLs.z * 0.85, uLs.z, d);
          float stripes = step(0.5, fract((vWPos.x + vWPos.z) * 0.35));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(vec3(0.55,0.25,0.18), vec3(0.95,0.42,0.32), stripes), zone * 0.55 * uLandslide);
        }`,
      );
  };
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  terrain.name = 'terrain';

  const group = new THREE.Group();
  group.add(terrain);

  // ---------- river ----------
  const riverPts = MAIN_VALLEY.map(([x, z]) => new THREE.Vector3(x * U, 0, z * U));
  const riverCurve = new THREE.CatmullRomCurve3(riverPts);
  const riverSamples = riverCurve.getSpacedPoints(400).map((p) => new THREE.Vector3(p.x, groundY(p.x / U, p.z / U) + 0.12, p.z));
  group.add(ribbon(riverSamples, 0.55, new THREE.MeshStandardMaterial({ color: 0x5f7f8f, roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.85 })));

  // ---------- road ----------
  const roadCurve = new THREE.CatmullRomCurve3(ROAD.map(([x, z]) => new THREE.Vector3(x * U, 0, z * U)));
  const all = roadCurve.getSpacedPoints(500);
  const splitAt = Math.round((ROAD_BLACKOUT_INDEX / (ROAD.length - 1)) * all.length);
  const onGround = (p: THREE.Vector3) => new THREE.Vector3(p.x, groundY(p.x / U, p.z / U) + 0.1, p.z);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x8c8577, roughness: 0.9 });
  const roadOut = ribbon(all.slice(0, splitAt + 1).map(onGround), 0.32, roadMat);
  group.add(roadOut);
  const roadInMat = new THREE.MeshStandardMaterial({ color: 0x8c8577, roughness: 0.9, emissive: new THREE.Color(0xff6b5e), emissiveIntensity: 0 });
  // inside the blackout: segments with washout gaps
  const inside = all.slice(splitAt).map(onGround);
  const roadIn = new THREE.Group();
  const gapSet = new Set<number>();
  for (let i = 0; i < inside.length; i++) {
    const p = inside[i];
    const inSlide = Math.hypot(p.x / U - LANDSLIDE_ZONE.x, p.z / U - LANDSLIDE_ZONE.z) < LANDSLIDE_ZONE.r * 0.8;
    if (inSlide || Math.floor(i / 22) % 5 === 3) gapSet.add(i);
  }
  let run: THREE.Vector3[] = [];
  for (let i = 0; i < inside.length; i++) {
    if (gapSet.has(i)) {
      if (run.length > 2) roadIn.add(ribbon(run, 0.32, roadInMat));
      run = [];
    } else run.push(inside[i]);
  }
  if (run.length > 2) roadIn.add(ribbon(run, 0.32, roadInMat));
  // intact version (shown before the disaster)
  const roadInIntact = ribbon(inside, 0.32, roadMat);
  group.add(roadIn, roadInIntact);

  // ---------- instanced rocks & conifers ----------
  const inst = opts.instances ?? { rocks: 900, trees: 2200 };
  let seed = 99;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dummy = new THREE.Object3D();
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x6b6863, roughness: 0.95, flatShading: true }), inst.rocks);
  let n = 0;
  for (let tries = 0; n < inst.rocks && tries < inst.rocks * 30; tries++) {
    const x = c.x - half * 0.85 + rnd() * half * 1.7;
    const z = c.z - half * 0.85 + rnd() * half * 1.7;
    const sl = slopeAt(x, z);
    if (sl < 0.35 || sl > 1.2) continue;
    dummy.position.set(x * U, groundY(x, z) - 0.05, z * U);
    const s = 0.07 + rnd() * 0.14;
    dummy.scale.set(s * (0.8 + rnd() * 0.6), s * 0.6, s);
    dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dummy.updateMatrix();
    rocks.setMatrixAt(n++, dummy.matrix);
  }
  rocks.count = n;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);

  const treeGeo = new THREE.ConeGeometry(0.22, 0.9, 5);
  treeGeo.translate(0, 0.45, 0);
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0x22301f, roughness: 0.9, flatShading: true }), inst.trees);
  n = 0;
  for (let tries = 0; n < inst.trees && tries < inst.trees * 30; tries++) {
    const x = c.x - half * 0.8 + rnd() * half * 1.6;
    const z = c.z - half * 0.8 + rnd() * half * 1.6;
    const e = elevationM(x, z);
    const sl = slopeAt(x, z);
    if (e > 3250 || sl < 0.1 || sl > 0.8 || fbm(x * 0.45 + 9, z * 0.45 - 4, 2) < -0.1) continue;
    dummy.position.set(x * U, groundY(x, z) - 0.05, z * U);
    const s = 0.28 + rnd() * 0.22;
    dummy.scale.set(s, s * (0.9 + rnd() * 0.5), s);
    dummy.rotation.set(0, rnd() * 6, 0);
    dummy.updateMatrix();
    trees.setMatrixAt(n++, dummy.matrix);
  }
  trees.count = n;
  trees.castShadow = true;
  group.add(trees);

  // ---------- distant layered ranges ----------
  if (opts.distant !== false) {
    group.add(createSkirt(c, half));
    group.add(createDistantRanges(600));
  }

  return {
    group,
    terrain,
    uniforms,
    setRoadFailure(f: number) {
      roadIn.visible = f > 0.5;
      roadInIntact.visible = f <= 0.5;
      roadInMat.emissiveIntensity = f > 0.5 ? 0.35 : 0;
      roadInMat.color.set(f > 0.5 ? 0x7a5a52 : 0x8c8577);
    },
    update(t: number) {
      uniforms.uTime.value = t;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mm = m.material as THREE.Material | undefined;
        mm?.dispose?.();
      });
    },
  };
}

/** Flat ribbon along points, oriented horizontally. */
function ribbon(points: THREE.Vector3[], width: number, mat: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[Math.min(points.length - 1, i + 1)];
    const r = points[Math.max(0, i - 1)];
    const dir = new THREE.Vector3().subVectors(q, r).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);
    pos.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
    if (i < points.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/** Low-resolution terrain beyond the detailed tile so its edge never shows. */
function createSkirt(c: { x: number; z: number }, half: number): THREE.Mesh {
  const span = 130; // km
  const seg = 130;
  const geo = new THREE.PlaneGeometry(span * U, span * U, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(-20 * U, 0, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const d = 0.4;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / U;
    const z = pos.getZ(i) / U;
    const inside = Math.abs(x - c.x) < half - 1.2 && Math.abs(z - c.z) < half - 1.2;
    const e = elevationFar(x, z);
    const sl = Math.hypot(elevationFar(x + d, z) - elevationFar(x - d, z), elevationFar(x, z + d) - elevationFar(x, z - d)) / (2 * d * 1000);
    pos.setY(i, inside ? elevToY(e) - 25 : elevToY(e) - 0.6);
    colorFor(e, sl, x, z, col);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }));
  m.receiveShadow = true;
  m.name = 'terrain-skirt';
  return m;
}

function createDistantRanges(inner: number): THREE.Group {
  const g = new THREE.Group();
  const layers = [
    { r0: inner * 1.0, r1: inner * 1.9, h: 70, color: 0x2d3a48, seed: 1 },
    { r0: inner * 1.6, r1: inner * 2.7, h: 120, color: 0x22303d, seed: 7 },
  ];
  for (const L of layers) {
    const geo = new THREE.RingGeometry(L.r0, L.r1, 160, 10);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(L.color);
    const snow = new THREE.Color(0xb9c6d2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const t = (r - L.r0) / (L.r1 - L.r0);
      const env = Math.sin(Math.min(1, t * 1.25) * Math.PI) ;
      const a = Math.atan2(z, x);
      const ridge = Math.abs(fbm(Math.cos(a) * 6 + L.seed, Math.sin(a) * 6 - L.seed, 5));
      const h = env * L.h * (0.35 + ridge * 1.6) - 6;
      pos.setY(i, h);
      const c = base.clone().lerp(snow, THREE.MathUtils.smoothstep(h, L.h * 0.55, L.h * 0.95));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    g.add(m);
  }
  return g;
}
