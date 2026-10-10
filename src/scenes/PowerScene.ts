/**
 * Off-grid power system: wind turbine → wind charge controller, solar array →
 * MPPT controller, controllers → LiFePO4 + BMS, battery → protected DC bus →
 * loads. Energy flows are animated tubes whose speed/opacity follow the
 * illustrative power model; drone charging visibly sheds first.
 */
import * as THREE from 'three';
import { createOrbit } from './core/orbit';
import type { SceneContext, SceneController } from './core/types';
import { createWindTurbine } from '../models/WindTurbine';
import { createSolarArray } from '../models/SolarArray';
import { createBatteryModules } from '../models/BatteryModules';
import { createAntennaMast } from '../models/Antenna';
import { createFlowTube, type FlowTube } from '../models/FlightRibbon';
import { PALETTE, mesh, roundedBox, std, emissive } from '../models/materials';
import { createDrone } from '../models/Drone';

export type PowerNode = 'turbine' | 'windCtrl' | 'solar' | 'mppt' | 'battery' | 'bus' | 'comms' | 'controller' | 'sensors' | 'safety' | 'charger';

export interface PowerSceneInput {
  windKmh: number;
  sun: number; // 0..1
  soc: number; // 0..1 of 10 kWh
  reserve: number; // 0..1
  chargerOn: number; // 0 shed, 1 full
  turbineBraked: boolean;
  selected: PowerNode | null;
}

export const POWER_NODES: PowerNode[] = ['turbine', 'windCtrl', 'solar', 'mppt', 'battery', 'bus', 'comms', 'controller', 'sensors', 'safety', 'charger'];

export function createPowerScene(ctx: SceneContext, io: { input: { current: PowerSceneInput }; labels: Map<string, HTMLElement>; onPick: (n: PowerNode | null) => void }): SceneController {
  const { mobile, reducedMotion, canvas } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1622);
  scene.fog = new THREE.Fog(0x0a1622, 30, 70);
  const camera = new THREE.PerspectiveCamera(mobile ? 52 : 36, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xa9c4dc, 0x1b1915, 1.0));
  const sunLight = new THREE.DirectionalLight(0xffe0bd, 2.4);
  sunLight.position.set(-6, 12, 8);
  sunLight.castShadow = !mobile;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -14;
  sunLight.shadow.camera.right = 14;
  sunLight.shadow.camera.top = 10;
  sunLight.shadow.camera.bottom = -10;
  scene.add(sunLight);

  // floor plate with fine grid
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), std(0x111d29, 0.95, 0));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0x1e3347, 0x16283a);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.6;
  grid.position.y = 0.01;
  scene.add(grid);

  const nodes = new Map<PowerNode, THREE.Group>();
  const anchors = new Map<PowerNode, THREE.Vector3>();
  const add = (k: PowerNode, g: THREE.Group, pos: [number, number, number], anchorY: number) => {
    g.position.set(...pos);
    g.name = k;
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(g);
    nodes.set(k, g);
    anchors.set(k, new THREE.Vector3(pos[0], anchorY, pos[2]));
  };
  const plinth = (w: number, d: number) => mesh(new THREE.BoxGeometry(w, 0.16, d), std(0x22303c, 0.8, 0.2), [0, 0.08, 0]);
  const box = (w: number, h: number, d: number, color: number, led?: number) => {
    const g = new THREE.Group();
    g.add(plinth(w + 0.4, d + 0.4));
    g.add(mesh(roundedBox(w, h, d, 0.08, 2), std(color, 0.5, 0.35), [0, 0.16 + h / 2, 0]));
    if (led !== undefined) g.add(mesh(new THREE.BoxGeometry(w * 0.5, 0.05, 0.02), emissive(led, 2.2), [0, 0.16 + h * 0.75, d / 2 + 0.01]));
    return g;
  };

  // generation (left)
  const turbine = createWindTurbine(3.6, 1.25);
  const tg = new THREE.Group();
  tg.add(plinth(1.2, 1.2));
  turbine.group.position.y = 0.16;
  tg.add(turbine.group);
  add('turbine', tg, [-11, 0, -3.6], 4.6);
  const solar = createSolarArray(2, 1.1, 1.9, 0.5);
  const sg = new THREE.Group();
  sg.add(solar.group);
  add('solar', sg, [-11.4, 0, 3.4], 1.9);
  add('windCtrl', box(1.1, 1.2, 0.6, 0x3d5068, PALETTE.amber), [-6.5, 0, -3.6], 1.7);
  add('mppt', box(1.1, 1.2, 0.6, 0x3d5068, PALETTE.amber), [-6.5, 0, 3.4], 1.7);
  // storage (centre)
  const bg = new THREE.Group();
  bg.add(plinth(3.4, 2.4));
  const walls = mesh(roundedBox(3.1, 1.25, 2.1, 0.12, 2), std(PALETTE.insulation, 0.85, 0.05, { transparent: true, opacity: 0.35, depthWrite: false }), [0, 0.8, 0]);
  walls.castShadow = false;
  bg.add(walls);
  const modules = createBatteryModules(4, 2);
  modules.group.position.y = 0.2;
  bg.add(modules.group);
  bg.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), std(0x1f5a3a, 0.6, 0.2), [1.3, 1.6, 0.7])); // BMS
  add('battery', bg, [-1.2, 0, 0], 2.2);
  // DC bus (copper bar)
  const busG = new THREE.Group();
  busG.add(mesh(new THREE.BoxGeometry(0.22, 0.22, 9.5), std(PALETTE.copper, 0.32, 0.85), [0, 0.7, 0]));
  for (let i = 0; i < 6; i++) busG.add(mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), std(0x2a3846, 0.6, 0.3), [0, 0.35, -4 + i * 1.6]));
  add('bus', busG, [3.2, 0, 0], 1.4);
  // loads (right column)
  const comms = new THREE.Group();
  comms.add(plinth(1.4, 1.4));
  const mast = createAntennaMast(3.2);
  mast.group.position.set(0.35, 0.16, 0);
  comms.add(mast.group);
  comms.add(mesh(roundedBox(0.8, 0.6, 0.5, 0.05, 2), std(0x2a3b4a, 0.5, 0.3), [-0.25, 0.46, 0]));
  add('comms', comms, [8.2, 0, -4.6], 3.8);
  add('controller', box(0.9, 0.35, 0.7, 0x1f5a3a, PALETTE.cyan), [8.2, 0, -2.2], 0.9);
  const sensors = new THREE.Group();
  sensors.add(plinth(1, 1));
  for (let i = 0; i < 6; i++) sensors.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 14), std(PALETTE.white, 0.5, 0.05), [0, 0.9 + i * 0.09, 0]));
  sensors.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), std(PALETTE.steel, 0.4, 0.7), [0, 0.5, 0]));
  add('sensors', sensors, [8.2, 0, 0.1], 1.7);
  add('safety', box(0.8, 0.9, 0.6, 0x7a3b36, PALETTE.coral), [8.2, 0, 2.3], 1.4);
  const charger = new THREE.Group();
  charger.add(mesh(new THREE.BoxGeometry(2.2, 0.2, 2.2), std(0x2b333b, 0.85, 0.1), [0, 0.1, 0]));
  charger.add(mesh(new THREE.TorusGeometry(0.75, 0.03, 6, 40), std(PALETTE.amber, 0.6, 0.1), [0, 0.21, 0], [Math.PI / 2, 0, 0]));
  const padMat = new THREE.MeshStandardMaterial({ color: PALETTE.copper, roughness: 0.3, metalness: 0.85, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0 });
  for (const x of [-0.35, 0.35]) charger.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 1.0), padMat, [x, 0.215, 0]));
  const drone = createDrone({ detail: 'low' });
  drone.group.scale.setScalar(0.9);
  drone.group.position.y = 0.22;
  charger.add(drone.group);
  add('charger', charger, [8.4, 0, 5.1], 1.4);

  // flows
  const busAt = (z: number) => new THREE.Vector3(3.2, 0.95, z);
  const flow = (a: THREE.Vector3, b: THREE.Vector3, color: number, lift = 0.9) => {
    const mid = a.clone().lerp(b, 0.5);
    mid.y += lift;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    return createFlowTube(curve.getPoints(30), { color, radius: 0.07, dash: 0.08, speed: 1.5, opacity: 0.9 });
  };
  const GEN = 0xffc46b;
  const flows: Record<string, { tube: FlowTube; from: PowerNode; to: PowerNode }> = {
    turbine: { tube: flow(new THREE.Vector3(-11, 0.8, -3.6), new THREE.Vector3(-7.1, 1.0, -3.6), GEN), from: 'turbine', to: 'windCtrl' },
    solar: { tube: flow(new THREE.Vector3(-10.4, 0.8, 3.4), new THREE.Vector3(-7.1, 1.0, 3.4), GEN), from: 'solar', to: 'mppt' },
    windCtrl: { tube: flow(new THREE.Vector3(-5.9, 1.0, -3.6), new THREE.Vector3(-2.4, 1.2, -0.6), GEN, 1.2), from: 'windCtrl', to: 'battery' },
    mppt: { tube: flow(new THREE.Vector3(-5.9, 1.0, 3.4), new THREE.Vector3(-2.4, 1.2, 0.6), GEN, 1.2), from: 'mppt', to: 'battery' },
    battery: { tube: flow(new THREE.Vector3(0.4, 1.1, 0), busAt(0), PALETTE.cyan, 0.8), from: 'battery', to: 'bus' },
    comms: { tube: flow(busAt(-3.9), new THREE.Vector3(7.6, 0.6, -4.6), PALETTE.cyan, 0.6), from: 'bus', to: 'comms' },
    controller: { tube: flow(busAt(-2.2), new THREE.Vector3(7.6, 0.5, -2.2), PALETTE.cyan, 0.6), from: 'bus', to: 'controller' },
    sensors: { tube: flow(busAt(0.1), new THREE.Vector3(7.6, 0.5, 0.1), PALETTE.cyan, 0.6), from: 'bus', to: 'sensors' },
    safety: { tube: flow(busAt(2.3), new THREE.Vector3(7.6, 0.5, 2.3), PALETTE.cyan, 0.6), from: 'bus', to: 'safety' },
    charger: { tube: flow(busAt(4.4), new THREE.Vector3(7.2, 0.3, 5.1), PALETTE.amber, 0.6), from: 'bus', to: 'charger' },
  };
  for (const f of Object.values(flows)) scene.add(f.tube.mesh);

  // selection ring
  const sel = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.4, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
  sel.rotation.x = -Math.PI / 2;
  sel.position.y = 0.03;
  sel.visible = false;
  scene.add(sel);

  camera.position.set(-3, 15, 19);
  const controls = createOrbit(camera, canvas);
  controls.target.set(-1, 0.8, 0.6);
  controls.enableDamping = !reducedMotion;
  controls.minDistance = 10;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.45;
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
    const hits = ray.intersectObjects([...nodes.values()], true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !(POWER_NODES as string[]).includes(o.name)) o = o.parent;
      if (o) {
        io.onPick(o.name as PowerNode);
        return;
      }
    }
    io.onPick(null);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  const tmp = new THREE.Vector3();
  let width = 1;
  let height = 1;

  return {
    scene,
    camera,
    update(dt, t) {
      const inp = io.input.current;
      const windPow = inp.turbineBraked ? 0 : Math.min(1, Math.pow(Math.min(inp.windKmh, 43) / 43, 3));
      turbine.update(dt, inp.windKmh, inp.turbineBraked);
      mast.update(dt, inp.windKmh);
      solar.setSun(inp.sun);
      sunLight.intensity = 0.6 + inp.sun * 2.2;
      const charging = inp.sun + windPow > 0.05;
      modules.setLevel(inp.soc, charging, t);
      const set = (k: string, level: number) => {
        const f = flows[k].tube;
        f.uniforms.uSpeed.value = reducedMotion ? 0 : 0.4 + level * 2.2;
        f.uniforms.uOpacity.value = level <= 0.01 ? 0.12 : 0.35 + level * 0.6;
        f.update(t);
      };
      set('turbine', windPow);
      set('windCtrl', windPow);
      set('solar', inp.sun);
      set('mppt', inp.sun);
      set('battery', 0.6);
      for (const k of ['comms', 'controller', 'sensors', 'safety']) set(k, inp.soc > 0.001 ? 0.5 : 0);
      set('charger', inp.chargerOn);
      flows.charger.tube.setColor(inp.chargerOn > 0.01 ? PALETTE.amber : PALETTE.coral);
      padMat.emissiveIntensity = inp.chargerOn > 0.01 ? 0.6 + Math.sin(t * 6) * 0.3 : 0;
      drone.update(dt, { throttle: 0, bank: 0, pitch: 0, release: 0, hasPayload: false });
      if (inp.selected && nodes.has(inp.selected)) {
        const g = nodes.get(inp.selected)!;
        sel.visible = true;
        sel.position.x = g.position.x;
        sel.position.z = g.position.z;
        const s = inp.selected === 'bus' ? 3.6 : inp.selected === 'battery' ? 1.8 : 1.1;
        sel.scale.setScalar(s * (1 + Math.sin(t * 3) * 0.04));
      } else sel.visible = false;
      controls.update();
      for (const k of POWER_NODES) {
        const el = io.labels.get(k);
        if (!el) continue;
        tmp.copy(anchors.get(k)!).project(camera);
        const on = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
        el.style.opacity = on ? '1' : '0';
        if (on) el.style.transform = `translate(${((tmp.x + 1) / 2) * width}px, ${((1 - tmp.y) / 2) * height}px) translate(-50%, -100%)`;
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
      Object.values(flows).forEach((f) => f.tube.dispose());
    },
  };
}
