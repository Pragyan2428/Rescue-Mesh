/**
 * Atmosphere: sky dome, lights, fog, clouds, rain and wind streaks.
 * Every effect exposes a parameter driven by scene state (storm, wind) rather
 * than running as free-floating decoration.
 */
import * as THREE from 'three';

export function createSky(radius = 900) {
  const uniforms = {
    uStorm: { value: 0 },
    uDusk: { value: 1 },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uStorm; uniform float uDusk; uniform float uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 zenith = mix(vec3(0.035,0.07,0.12), vec3(0.04,0.05,0.07), uStorm);
        vec3 horizonDusk = vec3(0.56,0.36,0.27);
        vec3 horizonClear = vec3(0.30,0.42,0.52);
        vec3 horizon = mix(horizonClear, horizonDusk, uDusk);
        horizon = mix(horizon, vec3(0.13,0.15,0.18), uStorm*0.85);
        vec3 col = mix(horizon, zenith, pow(max(h,0.0), 0.55));
        // sun glow towards -x (west) at dusk
        vec3 sunDir = normalize(vec3(-0.9, 0.06, 0.35));
        float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 18.0);
        col += vec3(1.0,0.55,0.3) * sun * 0.55 * uDusk * (1.0 - uStorm*0.9);
        // cloud bands
        vec2 uv = vDir.xz / max(0.12, vDir.y + 0.25) * 1.4 + vec2(uTime*0.004, 0.0);
        float c = noise(uv*1.3) * 0.6 + noise(uv*3.1) * 0.3 + noise(uv*7.0)*0.1;
        float cover = mix(0.62, 0.38, uStorm);
        float cl = smoothstep(cover, cover+0.25, c) * smoothstep(-0.05, 0.25, vDir.y);
        vec3 cloudCol = mix(vec3(0.55,0.46,0.42)*uDusk + vec3(0.2,0.24,0.28)*(1.0-uDusk), vec3(0.09,0.1,0.12), uStorm);
        col = mix(col, cloudCol, cl * (0.55 + uStorm*0.4));
        if (h < 0.0) col = mix(col, vec3(0.03,0.05,0.08), smoothstep(0.0, -0.2, h));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function createLights(scene: THREE.Scene, opts: { shadows: boolean; shadowSize?: number; extent?: number }) {
  const hemi = new THREE.HemisphereLight(0x9fb7cc, 0x1a1712, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc6a0, 2.2);
  sun.position.set(-260, 160, 120);
  sun.castShadow = opts.shadows;
  if (opts.shadows) {
    const e = opts.extent ?? 160;
    sun.shadow.mapSize.set(opts.shadowSize ?? 2048, opts.shadowSize ?? 2048);
    sun.shadow.camera.left = -e;
    sun.shadow.camera.right = e;
    sun.shadow.camera.top = e;
    sun.shadow.camera.bottom = -e;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
  }
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x6fa6c8, 0.35);
  fill.position.set(200, 80, -150);
  scene.add(fill);
  return { hemi, sun, fill };
}

/** Procedural soft cloud texture (canvas, no external assets). */
function cloudTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 14; i++) {
    const x = 30 + Math.random() * 68;
    const y = 36 + Math.random() * 56;
    const r = 14 + Math.random() * 22;
    const gg = g.createRadialGradient(x, y, 1, x, y, r);
    gg.addColorStop(0, 'rgba(255,255,255,0.35)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gg;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createClouds(count: number, area: number, height: number) {
  const tex = cloudTexture();
  const group = new THREE.Group();
  const mats: THREE.SpriteMaterial[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color: 0x9aa6b2, transparent: true, opacity: 0.5, depthWrite: false, fog: true });
    mats.push(m);
    const sp = new THREE.Sprite(m);
    const s = 50 + rnd() * 90;
    sp.scale.set(s * 1.8, s * 0.6, 1);
    sp.position.set((rnd() - 0.5) * area, height + rnd() * 40, (rnd() - 0.5) * area);
    sp.userData.speed = 1.5 + rnd() * 2.5;
    group.add(sp);
  }
  return {
    group,
    update(dt: number, storm: number, wind: number) {
      for (const sp of group.children as THREE.Sprite[]) {
        sp.position.x += dt * sp.userData.speed * (1 + wind * 2);
        if (sp.position.x > area / 2) sp.position.x -= area;
      }
      for (const m of mats) {
        m.opacity = 0.18 + storm * 0.55;
        m.color.setRGB(0.6 - storm * 0.35, 0.64 - storm * 0.36, 0.7 - storm * 0.38);
      }
    },
    dispose() {
      tex.dispose();
      mats.forEach((m) => m.dispose());
    },
  };
}

/** Rain streaks that follow the camera; intensity 0..1 controls visible count. */
export function createRain(maxDrops: number) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(maxDrops * 6);
  const R = 60;
  for (let i = 0; i < maxDrops; i++) {
    const x = (Math.random() - 0.5) * R * 2;
    const y = Math.random() * 60;
    const z = (Math.random() - 0.5) * R * 2;
    pos.set([x, y, z, x - 0.3, y - 1.6, z], i * 6);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xa9c2d6, transparent: true, opacity: 0.35, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return {
    object: lines,
    update(dt: number, intensity: number, camera: THREE.Camera) {
      lines.visible = intensity > 0.02;
      if (!lines.visible) return;
      geo.setDrawRange(0, Math.floor(maxDrops * intensity) * 2);
      lines.position.set(camera.position.x, camera.position.y - 30, camera.position.z);
      const p = geo.attributes.position.array as Float32Array;
      const fall = dt * 70;
      for (let i = 0; i < maxDrops; i++) {
        const o = i * 6;
        p[o + 1] -= fall;
        p[o + 4] -= fall;
        p[o] -= fall * 0.18;
        p[o + 3] -= fall * 0.18;
        if (p[o + 1] < 0) {
          const x = (Math.random() - 0.5) * R * 2;
          const z = (Math.random() - 0.5) * R * 2;
          p[o] = x;
          p[o + 1] = 60;
          p[o + 2] = z;
          p[o + 3] = x - 0.3;
          p[o + 4] = 58.4;
          p[o + 5] = z;
        }
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.18 + intensity * 0.3;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/** Wind streaks: short lines moving downwind; speed and count from wind 0..1. */
export function createWindStreaks(count: number, center: THREE.Vector3, size: number, heightFn: (x: number, z: number) => number) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 6);
  const seeds: { x: number; z: number; y: number; l: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x = center.x + (Math.random() - 0.5) * size;
    const z = center.z + (Math.random() - 0.5) * size;
    seeds.push({ x, z, y: heightFn(x, z) + 2 + Math.random() * 6, l: 2 + Math.random() * 4 });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xd8e6f0, transparent: true, opacity: 0.0, depthWrite: false });
  const obj = new THREE.LineSegments(geo, mat);
  obj.frustumCulled = false;
  return {
    object: obj,
    update(dt: number, wind: number) {
      obj.visible = wind > 0.02;
      if (!obj.visible) return;
      mat.opacity = Math.min(0.55, wind * 0.6);
      const p = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const s = seeds[i];
        s.x += dt * (12 + wind * 40);
        if (s.x > center.x + size / 2) {
          s.x -= size;
          s.y = heightFn(s.x, s.z) + 2 + Math.random() * 6;
        }
        p.set([s.x, s.y, s.z, s.x - s.l * (0.5 + wind), s.y, s.z + 0.3], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
