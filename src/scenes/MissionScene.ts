/**
 * Live operations twin used by the medical mission, failure demo and
 * dashboard chapters. Everything drawn here is read from the shared
 * simulation state each frame: stations, links, drones, messages, plans.
 */
import * as THREE from 'three';
import { createOrbit } from './core/orbit';
import { WORLD } from '../data/systemConstants';
import { INCIDENT } from '../data/demoStations';
import { createLights, createSky, createClouds } from './core/environment';
import type { SceneContext, SceneController } from './core/types';
import { createTerrain } from './HimalayanTerrain';
import { createNetworkLayer, nodeWorld } from './NetworkScene';
import { createFailureOverlay } from './FailureScene';
import { getSim } from '../simulation/store';
import { groundY } from '../utils/terrainField';
import type { NodeId } from '../simulation/types';

const U = WORLD.unitsPerKm;
export type OpsView = 'overview' | 'follow' | 'top';

export const OPS_LABEL_IDS = ['CC', 'G', 'S1', 'S2', 'S2b', 'S3', 'INC'] as const;

export function createMissionScene(ctx: SceneContext, labelEls: Map<string, HTMLElement>, opts: { view: { current: OpsView } }): SceneController {
  const { mobile, reducedMotion, canvas } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 50 : 38, 1, 0.5, 1800);
  scene.fog = new THREE.Fog(0x24303b, 160, 620);
  const sky = createSky(900);
  sky.uniforms.uStorm.value = 0.15;
  sky.uniforms.uDusk.value = 0.55;
  scene.add(sky.mesh);
  const lights = createLights(scene, { shadows: !mobile, shadowSize: 2048, extent: 120 });
  lights.sun.target.position.set(-75, 0, 5);
  const terrain = createTerrain({ segments: mobile ? 140 : 260, halfKm: 13, center: { x: -7.5, z: 0.8 }, instances: mobile ? { rocks: 120, trees: 360 } : { rocks: 420, trees: 1300 } });
  scene.add(terrain.group);
  const clouds = createClouds(mobile ? 5 : 10, 300, 50);
  scene.add(clouds.group);
  const net = createNetworkLayer({ detail: mobile ? 'low' : 'high', mobile });
  scene.add(net.group);
  const fail = createFailureOverlay();
  scene.add(fail.group);

  // selection halo
  const halo = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false }));
  halo.rotation.x = -Math.PI / 2;
  halo.visible = false;
  scene.add(halo);

  camera.position.set(-82, 150, 150);
  const controls = createOrbit(camera, canvas);
  controls.target.set(-58, 14, 8);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.08;
  controls.minDistance = 25;
  controls.maxDistance = 260;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.update();

  let lastView: OpsView = opts.view.current;
  const desiredPos = new THREE.Vector3();
  const desiredTgt = new THREE.Vector3();
  let animating = 0;
  const tmp = new THREE.Vector3();
  let width = 1;
  let height = 1;
  const userBreak = () => (animating = 0);
  controls.addEventListener('start', userBreak);

  function presetFor(view: OpsView) {
    const s = getSim();
    if (view === 'top') {
      desiredTgt.set(-72, 0, 6);
      desiredPos.set(-72, 230, 18);
    } else if (view === 'follow') {
      const d = s.drones.find((x) => x.missionId && x.missionId === s.activeMissionId) ?? s.drones[0];
      desiredTgt.set(d.pos.x, d.pos.y, d.pos.z);
      desiredPos.set(d.pos.x - 26, d.pos.y + 18, d.pos.z + 30);
    } else {
      desiredTgt.set(-58, 14, 8);
      desiredPos.set(-82, 150, 150);
    }
  }

  const labelPos: Record<string, THREE.Vector3> = {};
  for (const id of ['CC', 'G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]) labelPos[id] = nodeWorld(id, id === 'CC' ? 5 : 4.6);
  labelPos.INC = new THREE.Vector3(INCIDENT.x * U, groundY(INCIDENT.x, INCIDENT.z) + 5, INCIDENT.z * U);

  return {
    scene,
    camera,
    update(dt, t) {
      const s = getSim();
      net.syncSim(s, dt, t);
      fail.update(s, t, terrain.uniforms.uLandslide);
      clouds.update(dt, 0.2, s.conditions.highWind ? 1 : 0.3);
      terrain.update(t);
      sky.uniforms.uTime.value = t;
      sky.uniforms.uStorm.value += ((s.conditions.highWind ? 0.7 : 0.15) - sky.uniforms.uStorm.value) * Math.min(1, dt * 2);

      if (s.selectedStation && s.selectedStation !== 'CC') {
        halo.visible = true;
        halo.position.copy(nodeWorld(s.selectedStation, 0.4));
        const k = 1 + Math.sin(t * 3) * 0.06;
        halo.scale.setScalar(k);
        (halo.material as THREE.MeshBasicMaterial).color.set(s.stations[s.selectedStation].online ? 0xffffff : 0xff6b5e);
      } else halo.visible = false;

      const view = opts.view.current;
      if (view !== lastView) {
        lastView = view;
        presetFor(view);
        animating = reducedMotion ? 0.001 : 1.6;
        if (reducedMotion) {
          camera.position.copy(desiredPos);
          controls.target.copy(desiredTgt);
        }
      }
      if (view === 'follow') {
        presetFor('follow');
        controls.target.lerp(desiredTgt, Math.min(1, dt * 3));
        if (animating > 0) camera.position.lerp(desiredPos, Math.min(1, dt * 2.5));
        else {
          // keep relative offset while following
          tmp.copy(desiredTgt).sub(controls.target);
          camera.position.add(tmp.multiplyScalar(Math.min(1, dt * 3)));
        }
      } else if (animating > 0) {
        camera.position.lerp(desiredPos, Math.min(1, dt * 2.5));
        controls.target.lerp(desiredTgt, Math.min(1, dt * 2.5));
      }
      if (animating > 0) animating -= dt;
      controls.update();

      for (const id of OPS_LABEL_IDS) {
        const el = labelEls.get(id);
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
      controls.removeEventListener('start', userBreak);
      controls.dispose();
      terrain.dispose();
      clouds.dispose();
      net.dispose();
    },
  };
}
