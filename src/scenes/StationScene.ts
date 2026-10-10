/**
 * Interactive docking-station viewer: orbit, zoom, reset, explode, cutaway,
 * subsystem highlight/isolation, clickable parts with attached labels and a
 * scripted "how it works" sequence (approach → land → centre → charge → ready).
 */
import * as THREE from 'three';
import { createOrbit } from './core/orbit';
import type { SceneContext, SceneController } from './core/types';
import { createDockingStation, PAD_TOP_M, type PartKey } from '../models/DockingStation';
import { createDrone } from '../models/Drone';
import { createSky } from './core/environment';
import { fbm } from '../utils/terrainField';

export interface StationViewerState {
  explode: number;
  cutaway: boolean;
  emphasis: PartKey[] | null;
  isolate: boolean;
  braked: boolean;
  doorsClosed: boolean;
  windKmh: number;
  /** increments when the user asks for a camera reset */
  resetTick: number;
  /** increments to (re)start the how-it-works sequence */
  demoTick: number;
  /** keyboard/button camera nudges */
  nudge: { tick: number; yaw: number; zoom: number };
}

export type DemoPhase = 'idle' | 'approach' | 'descent' | 'centering' | 'charging' | 'ready' | 'takeoff';

export const LABEL_PARTS: PartKey[] = ['frame', 'enclosure', 'anchors', 'pad', 'contacts', 'mast', 'turbine', 'solar', 'battery', 'sensors', 'shutdown', 'drainage', 'radio', 'controller', 'gps', 'chargeCtrl', 'charger'];

export function createStationScene(
  ctx: SceneContext,
  io: {
    state: { current: StationViewerState };
    labels: Map<string, HTMLElement>;
    onPick: (k: PartKey | null) => void;
    onPhase: (p: DemoPhase, charge: number) => void;
  },
): SceneController {
  const { mobile, reducedMotion, canvas } = ctx;
  const scene = new THREE.Scene();
  const sky = createSky(260);
  sky.uniforms.uStorm.value = 0.25;
  sky.uniforms.uDusk.value = 0.5;
  scene.add(sky.mesh);
  scene.fog = new THREE.Fog(0x1a2633, 40, 140);
  const camera = new THREE.PerspectiveCamera(mobile ? 46 : 34, 1, 0.1, 400);

  // lights: cool sky fill, warm low sun key, rim
  scene.add(new THREE.HemisphereLight(0xb8cde0, 0x2a2620, 1.1));
  const key = new THREE.DirectionalLight(0xffe2c4, 2.6);
  key.position.set(9, 12, 7);
  key.castShadow = !mobile;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -9;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd9ff, 0.9);
  rim.position.set(-8, 6, -9);
  scene.add(rim);

  // rocky ridge-shoulder ground patch
  const groundGeo = new THREE.CircleGeometry(16, mobile ? 64 : 128, 0, Math.PI * 2);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  const gcol = new Float32Array(gp.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const r = Math.hypot(x, z);
    const n = fbm(x * 0.18 + 3, z * 0.18 - 2, 4);
    const fall = Math.max(0, r - 4.2);
    gp.setY(i, r < 3.6 ? -0.02 : n * 0.5 * Math.min(1, (r - 3.6) / 3) - fall * fall * 0.035);
    c.set(0x4a4c4b).lerp(new THREE.Color(0x5d5a50), n * 0.5 + 0.5).lerp(new THREE.Color(0x3d4a35), Math.max(0, n) * 0.6);
    gcol[i * 3] = c.r;
    gcol[i * 3 + 1] = c.g;
    gcol[i * 3 + 2] = c.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }));
  ground.receiveShadow = true;
  scene.add(ground);
  // scattered rocks
  const rockGeo = new THREE.DodecahedronGeometry(0.3, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x6a6a66, roughness: 0.95, flatShading: true }), 60);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 60; i++) {
    const a = i * 2.39996;
    const r = 4.6 + ((i * 37) % 100) / 100 * 9;
    const s = 0.4 + ((i * 53) % 100) / 100 * 1.4;
    m4.compose(new THREE.Vector3(Math.cos(a) * r, -0.05, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(a, a * 1.7, 0)), new THREE.Vector3(s, s * 0.6, s));
    rocks.setMatrixAt(i, m4);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);

  const station = createDockingStation({ detail: 'high' });
  station.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(station.group);

  const drone = createDrone({ detail: 'high' });
  drone.group.scale.setScalar(1.15);
  drone.group.visible = false;
  scene.add(drone.group);

  camera.position.set(9.5, 6.8, 11.5);
  const home = { pos: camera.position.clone(), tgt: new THREE.Vector3(0, 2.2, 0.3) };
  const controls = createOrbit(camera, canvas);
  controls.target.copy(home.tgt);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 28;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enablePan = false;
  controls.update();

  // picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 5) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(station.group, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !(o.parent === station.group && (LABEL_PARTS as string[]).includes(o.name))) o = o.parent;
      if (o && o.visible) {
        io.onPick(o.name as PartKey);
        return;
      }
    }
    io.onPick(null);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  // state application
  let explodeCur = 0;
  let lastKey = '';
  let resetSeen = io.state.current.resetTick;
  let demoSeen = io.state.current.demoTick;
  let nudgeSeen = io.state.current.nudge.tick;
  const sph = new THREE.Spherical();
  let resetAnim = 0;
  const tmp = new THREE.Vector3();
  let width = 1;
  let height = 1;

  // demo sequence
  let phase: DemoPhase = 'idle';
  let phaseT = 0;
  let charge = 0.32;
  const PAD = PAD_TOP_M + 0.04;
  const setPhase = (p: DemoPhase) => {
    phase = p;
    phaseT = 0;
    io.onPhase(p, charge);
  };

  return {
    scene,
    camera,
    update(dt, t) {
      const st = io.state.current;
      // explode / cutaway / emphasis
      const k = reducedMotion ? 1 : Math.min(1, dt * 4);
      explodeCur += (st.explode - explodeCur) * k;
      if (Math.abs(st.explode - explodeCur) < 0.001) explodeCur = st.explode;
      station.setExplode(explodeCur);
      const key2 = `${st.cutaway}|${st.isolate}|${(st.emphasis ?? []).join(',')}`;
      if (key2 !== lastKey) {
        lastKey = key2;
        station.setEmphasis(st.emphasis, st.isolate ? 'isolate' : 'highlight');
        station.setCutaway(st.cutaway);
      }
      // reset
      if (st.resetTick !== resetSeen) {
        resetSeen = st.resetTick;
        resetAnim = reducedMotion ? 0.0001 : 1.2;
        if (reducedMotion) {
          camera.position.copy(home.pos);
          controls.target.copy(home.tgt);
        }
      }
      if (resetAnim > 0) {
        resetAnim -= dt;
        camera.position.lerp(home.pos, Math.min(1, dt * 3.5));
        controls.target.lerp(home.tgt, Math.min(1, dt * 3.5));
      }
      if (st.nudge.tick !== nudgeSeen) {
        nudgeSeen = st.nudge.tick;
        tmp.copy(camera.position).sub(controls.target);
        sph.setFromVector3(tmp);
        sph.theta += st.nudge.yaw;
        sph.radius = THREE.MathUtils.clamp(sph.radius * st.nudge.zoom, 5, 28);
        tmp.setFromSpherical(sph);
        camera.position.copy(controls.target).add(tmp);
      }
      controls.update();

      // demo
      if (st.demoTick !== demoSeen) {
        demoSeen = st.demoTick;
        charge = 0.32;
        drone.group.visible = true;
        setPhase('approach');
      }
      phaseT += dt;
      let throttle = 0;
      let bank = 0;
      let pitch = 0;
      let chargeActive = false;
      const sp = reducedMotion ? 3 : 1;
      if (phase === 'approach') {
        const f = Math.min(1, (phaseT * sp) / 3.2);
        const e = 1 - Math.pow(1 - f, 2);
        drone.group.position.set(THREE.MathUtils.lerp(-9, 0, e), THREE.MathUtils.lerp(9, PAD + 3.2, e), THREE.MathUtils.lerp(6, 0.15, e));
        drone.group.rotation.y = 0.6 * (1 - e);
        throttle = 1;
        pitch = 0.18 * (1 - e);
        bank = -0.12 * Math.sin(f * Math.PI);
        if (f >= 1) setPhase('descent');
      } else if (phase === 'descent') {
        const f = Math.min(1, (phaseT * sp) / 2.6);
        const e = f * f * (3 - 2 * f);
        drone.group.position.set(0, THREE.MathUtils.lerp(PAD + 3.2, PAD, e), 0.15 + Math.sin(phaseT * 7) * 0.02 * (1 - f));
        throttle = 1 - f * 0.4;
        if (f >= 1) setPhase('centering');
      } else if (phase === 'centering') {
        const f = Math.min(1, (phaseT * sp) / 1.4);
        drone.group.position.set(0, PAD, THREE.MathUtils.lerp(0.15, 0, f));
        drone.group.rotation.y = THREE.MathUtils.lerp(drone.group.rotation.y, 0, Math.min(1, dt * 4));
        throttle = 0;
        if (f >= 1) setPhase('charging');
      } else if (phase === 'charging') {
        chargeActive = true;
        charge = Math.min(1, charge + dt * sp * 0.16);
        if (Math.floor(phaseT * 4) !== Math.floor((phaseT - dt) * 4)) io.onPhase('charging', charge);
        if (charge >= 1) setPhase('ready');
      } else if (phase === 'ready') {
        throttle = phaseT > 1.6 ? 0.6 : 0;
        if (phaseT * sp > 2.4) setPhase('takeoff');
      } else if (phase === 'takeoff') {
        const f = Math.min(1, (phaseT * sp) / 3);
        drone.group.position.set(f * f * 7, PAD + f * 8, -f * f * 4);
        drone.group.rotation.y = -0.5 * f;
        throttle = 1;
        pitch = 0.15 * f;
        if (f >= 1) {
          drone.group.visible = false;
          setPhase('idle');
        }
      }
      if (drone.group.visible) drone.update(dt, { throttle, bank, pitch, release: 0, hasPayload: phase === 'approach' || phase === 'descent' || phase === 'centering' });

      const doorsTarget = st.doorsClosed ? 0 : 1;
      station.setDoors(phase !== 'idle' && !st.doorsClosed ? 1 : doorsTarget);
      station.update(dt, t, { windKmh: st.windKmh, braked: st.braked, charging: phase === 'idle' ? 0.72 : charge, chargeActive, sun: 0.65 });
      sky.uniforms.uTime.value = t;

      // labels attached to parts
      for (const p of LABEL_PARTS) {
        const el = io.labels.get(p);
        if (!el) continue;
        station.labelAnchor(p, tmp);
        tmp.project(camera);
        const vis = el.dataset.show === '1';
        const on = vis && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
        el.style.opacity = on ? '1' : '0';
        el.style.pointerEvents = on ? 'auto' : 'none';
        if (on) el.style.transform = `translate(${((tmp.x + 1) / 2) * width}px, ${((1 - tmp.y) / 2) * height}px)`;
      }
    },
    resize(w, h) {
      width = w;
      height = h;
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      controls.dispose();
      groundGeo.dispose();
      rockGeo.dispose();
    },
  };
}
