/**
 * Route-planning digital twin. Shows the Level-1 dock graph (feasible vs
 * infeasible edges), the Level-2 terrain A* paths of the selected and
 * alternative routes, the straight-line "as the crow flies" comparison and
 * the landslide obstacle. Inputs come from React via a ref (plans computed by
 * the shared route planner).
 */
import * as THREE from 'three';
import { createOrbit } from './core/orbit';

import { STATIONS } from '../data/demoStations';
import { createLights, createSky } from './core/environment';
import type { SceneContext, SceneController } from './core/types';
import { createTerrain } from './HimalayanTerrain';
import { nodeWorld, STATION_SCALE } from './NetworkScene';
import { createDockingStation } from '../models/DockingStation';
import { createFlowTube, type FlowTube } from '../models/FlightRibbon';
import { PALETTE } from '../models/materials';
import { DOCK_LIFT } from '../simulation/store';
import type { EdgeEval, HopPlan, NodeId } from '../simulation/types';


export interface RouteSceneInput {
  key: string;
  edges: EdgeEval[];
  chosen: HopPlan[];
  alternative: HopPlan[];
  blocked: boolean;
  offline: NodeId[];
}

export function createRouteScene(ctx: SceneContext, io: { input: { current: RouteSceneInput }; labels: Map<string, HTMLElement> }): SceneController {
  const { mobile, reducedMotion, canvas } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 50 : 36, 1, 0.5, 1600);
  scene.fog = new THREE.Fog(0x1d2733, 170, 600);
  const sky = createSky(800);
  sky.uniforms.uStorm.value = 0.1;
  sky.uniforms.uDusk.value = 0.35;
  scene.add(sky.mesh);
  const lights = createLights(scene, { shadows: !mobile, shadowSize: 2048, extent: 120 });
  lights.sun.target.position.set(-75, 0, 5);
  const terrain = createTerrain({ segments: mobile ? 130 : 240, halfKm: 12, center: { x: -7.5, z: 0.8 }, instances: mobile ? { rocks: 80, trees: 200 } : { rocks: 260, trees: 700 } });
  terrain.uniforms.uContours.value = 0.55;
  scene.add(terrain.group);

  // docks
  const docks = new Map<NodeId, ReturnType<typeof createDockingStation>>();
  for (const s of STATIONS) {
    if (s.kind === 'command') continue;
    const st = createDockingStation({ detail: 'low' });
    st.group.scale.setScalar(STATION_SCALE);
    st.group.position.copy(nodeWorld(s.id));
    st.group.rotation.y = -0.4;
    scene.add(st.group);
    docks.set(s.id, st);
  }

  // dynamic graph + paths
  const dyn = new THREE.Group();
  scene.add(dyn);
  let tubes: FlowTube[] = [];
  let lines: THREE.Line[] = [];
  const okMat = new THREE.LineBasicMaterial({ color: 0xffd7a8, transparent: true, opacity: 0.75 });
  const badMat = new THREE.LineDashedMaterial({ color: PALETTE.coral, dashSize: 1.4, gapSize: 1.1, transparent: true, opacity: 0.85 });
  const crowMat = new THREE.LineDashedMaterial({ color: 0xeaf2f8, dashSize: 0.8, gapSize: 0.9, transparent: true, opacity: 0.45 });
  let lastKey = '';

  function rebuild() {
    const inp = io.input.current;
    tubes.forEach((t) => {
      dyn.remove(t.mesh);
      t.dispose();
    });
    lines.forEach((l) => {
      dyn.remove(l);
      l.geometry.dispose();
    });
    tubes = [];
    lines = [];
    // Level 1: dock graph edges (elevated straight segments)
    for (const e of inp.edges) {
      const a = nodeWorld(e.from, 7);
      const b = nodeWorld(e.to, 7);
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      const l = new THREE.Line(g, e.verdict === 'ok' ? okMat : badMat);
      l.computeLineDistances();
      dyn.add(l);
      lines.push(l);
    }
    const addRoute = (hops: HopPlan[], color: number, radius: number, speed: number, opacity: number, crow: boolean) => {
      for (const h of hops) {
        const pts = [nodeWorld(h.from, DOCK_LIFT), ...h.profile.map((p) => new THREE.Vector3(p.x, p.y, p.z)), nodeWorld(h.to, DOCK_LIFT)];
        const t = createFlowTube(pts, { color, radius, dash: 0.04, speed, opacity });
        dyn.add(t.mesh);
        tubes.push(t);
        if (crow) {
          const g = new THREE.BufferGeometry().setFromPoints([nodeWorld(h.from, 1.2), nodeWorld(h.to, 1.2)]);
          const l = new THREE.Line(g, crowMat);
          l.computeLineDistances();
          dyn.add(l);
          lines.push(l);
        }
      }
    };
    addRoute(inp.alternative, 0x9aa6b2, 0.12, 0, 0.55, false);
    addRoute(inp.chosen, PALETTE.amber, 0.2, 2.2, 0.95, true);
    for (const [id, st] of docks) st.setStatus(inp.offline.includes(id) ? 'fault' : 'ok');
  }

  camera.position.set(-118, 96, 98);
  const controls = createOrbit(camera, canvas);
  controls.target.set(-70, 6, 8);
  controls.enableDamping = !reducedMotion;
  controls.minDistance = 30;
  controls.maxDistance = 260;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.update();

  const tmp = new THREE.Vector3();
  let width = 1;
  let height = 1;
  const labelPos: Record<string, THREE.Vector3> = {};
  for (const id of ['G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]) labelPos[id] = nodeWorld(id, 8.5);

  return {
    scene,
    camera,
    update(dt, t) {
      const inp = io.input.current;
      if (inp.key !== lastKey) {
        lastKey = inp.key;
        rebuild();
      }
      const target = inp.blocked ? 1 : 0;
      terrain.uniforms.uLandslide.value += (target - terrain.uniforms.uLandslide.value) * Math.min(1, dt * 4);
      tubes.forEach((tb) => tb.update(t));
      for (const [id, st] of docks) st.update(dt, t, { windKmh: 22, braked: inp.offline.includes(id), charging: 0.7, chargeActive: false, sun: 0.4 });
      terrain.update(t);
      controls.update();
      for (const id of Object.keys(labelPos)) {
        const el = io.labels.get(id);
        if (!el) continue;
        tmp.copy(labelPos[id]).project(camera);
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
      controls.dispose();
      tubes.forEach((t) => t.dispose());
      lines.forEach((l) => l.geometry.dispose());
      terrain.dispose();
    },
  };
}


