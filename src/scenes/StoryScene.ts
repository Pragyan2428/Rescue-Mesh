/**
 * The scroll-driven world: Himalayan valley at dusk → storm and blackout →
 * engineering constraints → network assembly and hop sequence → connected
 * network. Camera and parameters come from storyState (reversible).
 */
import * as THREE from 'three';
import { SYSTEM, WORLD } from '../data/systemConstants';
import { FULL_AREA_STATIONS, INCIDENT, STATION_BY_ID } from '../data/demoStations';
import { createClouds, createLights, createRain, createSky, createWindStreaks } from './core/environment';
import type { SceneContext, SceneController } from './core/types';
import { createTerrain } from './HimalayanTerrain';
import { createBlackoutLayer } from './BlackoutScene';
import { createNetworkLayer, nodeWorld } from './NetworkScene';
import { createNetworkNode } from '../models/NetworkNode';
import { createFlowTube } from '../models/FlightRibbon';
import { PALETTE } from '../models/materials';
import { currentStoryParams, storyBus, type StoryParams } from './storyState';
import { groundY } from '../utils/terrainField';
import { createInitialState, DOCK_LIFT } from '../simulation/store';
import { maxHopKm, planRoute } from '../simulation/routePlanner';
import type { NodeId } from '../simulation/types';

const U = WORLD.unitsPerKm;

interface Label {
  id: string;
  pos: THREE.Vector3;
  show: (p: StoryParams) => boolean;
}

export function createStoryScene(ctx: SceneContext, labelEls: Map<string, HTMLElement>): SceneController {
  const { mobile, reducedMotion } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 55 : 42, 1, 0.5, 2600);
  const fogColor = new THREE.Color(0x3a3f4a);
  scene.fog = new THREE.Fog(fogColor, 140, 900);
  const sky = createSky(1400);
  scene.add(sky.mesh);
  const lights = createLights(scene, { shadows: !mobile, shadowSize: 2048, extent: 190 });
  lights.sun.target.position.set(-70, 0, 0);

  const terrain = createTerrain({ segments: mobile ? 150 : 300, instances: mobile ? { rocks: 250, trees: 700 } : { rocks: 900, trees: 2400 } });
  scene.add(terrain.group);
  const clouds = createClouds(mobile ? 12 : 26, 700, 100);
  scene.add(clouds.group);
  const rain = createRain(reducedMotion ? 0 : mobile ? 700 : 2400);
  scene.add(rain.object);
  // wind streak helper expects world units
  const windFix = createWindStreaks(mobile ? 90 : 260, new THREE.Vector3(-75, 0, 0), 200, (x, z) => groundY(x / U, z / U));
  scene.add(windFix.object);

  const blackout = createBlackoutLayer();
  scene.add(blackout.group);
  const net = createNetworkLayer({ detail: 'low', mobile });
  scene.add(net.group);

  // ----- story drone route (5 kg design case) -----
  const plan = planRoute(createInitialState(), 'G', 'S3', SYSTEM.payloadTargetKg, 100);
  type Seg = { kind: 'fly' | 'charge'; pts: THREE.Vector3[]; cum: number[]; w: number; from: NodeId; to: NodeId; energy: number; km: number };
  const segs: Seg[] = [];
  plan.hops.forEach((h, i) => {
    const pts = [nodeWorld(h.from, DOCK_LIFT), ...h.profile.map((p) => new THREE.Vector3(p.x, p.y, p.z)), nodeWorld(h.to, DOCK_LIFT)];
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
    segs.push({ kind: 'fly', pts, cum, w: 1, from: h.from, to: h.to, energy: h.energyPct, km: h.distanceKm });
    if (i < plan.hops.length - 1) segs.push({ kind: 'charge', pts: [nodeWorld(h.to, DOCK_LIFT)], cum: [0], w: 0.3, from: h.to, to: h.to, energy: h.energyPct, km: 0 });
  });
  const totalW = segs.reduce((a, s) => a + s.w, 0) + 0.12;
  const routePts = segs.filter((s) => s.kind === 'fly').flatMap((s) => s.pts);

  // ----- range rings -----
  const ringMat = new THREE.LineDashedMaterial({ color: PALETTE.amber, dashSize: 2.2, gapSize: 1.4, transparent: true, opacity: 0.9 });
  const designMat = new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.95 });
  const makeRing = (cx: number, cz: number, rKm: number, mat: THREE.Material, lift = 0.6) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 2;
      const x = cx + Math.cos(a) * rKm;
      const z = cz + Math.sin(a) * rKm;
      pts.push(new THREE.Vector3(x * U, groundY(x, z) + lift, z * U));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    line.computeLineDistances();
    return line;
  };
  const G = STATION_BY_ID.G;
  const nominalRing = makeRing(G.x, G.z, SYSTEM.nominalDroneRadiusKm, ringMat);
  scene.add(nominalRing);
  let designRing = makeRing(G.x, G.z, SYSTEM.designHopKm, designMat);
  scene.add(designRing);
  let lastHop = '';

  // ----- full-area coverage (conceptual ~11 stations) -----
  const coverage = new THREE.Group();
  const covMat = new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55 });
  const covR = Math.sqrt(65 / Math.PI);
  for (const p of FULL_AREA_STATIONS) {
    const n = createNetworkNode(0.9);
    n.group.position.set(p.x * U, groundY(p.x, p.z), p.z * U);
    coverage.add(n.group);
    coverage.add(makeRing(p.x, p.z, covR, covMat, 0.8));
  }
  coverage.visible = false;
  scene.add(coverage);

  // ----- labels -----
  const st = (id: NodeId, lift = 4) => nodeWorld(id, lift);
  const R = SYSTEM.blackoutRadiusKm;
  const labels: Label[] = [
    { id: 'lbl-blackout', pos: new THREE.Vector3(-R * 0.72 * U, groundY(-R * 0.72, R * 0.69) + 22, R * 0.69 * U), show: (p) => p.blackout > 0.6 && p.final < 0.3 },
    { id: 'lbl-cell', pos: blackout.towerAnchor(0), show: (p) => p.fail > 0.5 && p.contours < 0.5 && p.reveal < 0.1 },
    { id: 'lbl-road', pos: new THREE.Vector3(-8.2 * U, groundY(-8.2, -0.4) + 3, -0.4 * U), show: (p) => p.fail > 0.6 && p.contours < 0.5 && p.reveal < 0.1 },
    { id: 'lbl-resp', pos: nodeWorld('CC', 6), show: (p) => p.fail > 0.85 && p.contours < 0.5 && p.reveal < 0.1 },
    { id: 'lbl-casualty', pos: new THREE.Vector3(INCIDENT.x * U, groundY(INCIDENT.x, INCIDENT.z) + 6, INCIDENT.z * U), show: (p) => p.blackout > 0.5 && p.reveal < 0.95 && p.final < 0.5 },
    { id: 'lbl-elev-g', pos: st('G', 6), show: (p) => p.contours > 0.5 },
    { id: 'lbl-elev-s3', pos: st('S3', 6), show: (p) => p.contours > 0.5 },
    { id: 'lbl-wind', pos: new THREE.Vector3(-90, groundY(-9, 3) + 14, 30), show: (p) => p.contours > 0.5 },
    { id: 'lbl-G', pos: st('G'), show: (p) => p.reveal > 0.15 && p.contours < 0.5 && p.final < 0.4 },
    { id: 'lbl-S1', pos: st('S1'), show: (p) => p.reveal > 0.35 && p.contours < 0.5 && p.final < 0.4 },
    { id: 'lbl-S2', pos: st('S2'), show: (p) => p.reveal > 0.55 && p.contours < 0.5 && p.final < 0.4 },
    { id: 'lbl-S3', pos: st('S3'), show: (p) => p.reveal > 0.75 && p.contours < 0.5 && p.final < 0.4 },
    { id: 'lbl-S2b', pos: st('S2b'), show: (p) => p.reveal > 0.95 && p.contours < 0.5 && p.final < 0.4 },
    { id: 'lbl-confirm', pos: nodeWorld('CC', 7), show: () => false },
  ];

  // ----- state -----
  const cur = currentStoryParams();
  const camPos = new THREE.Vector3(...cur.cam);
  const camTgt = new THREE.Vector3(...cur.tgt);
  const smooth = { ...cur };
  let intro = reducedMotion ? 0 : 1;
  const tmp = new THREE.Vector3();
  const tgtV = new THREE.Vector3();
  const posV = new THREE.Vector3();
  let width = 1;
  let height = 1;

  function droneAt(t: number) {
    let acc = t * totalW;
    for (const s of segs) {
      if (acc <= s.w) {
        const f = acc / s.w;
        if (s.kind === 'charge') return { p: s.pts[0].clone(), heading: 0, flying: false, battery: 100 - s.energy * (1 - f), leg: `Charging at ${s.from}`, km: 0 };
        const d = f * s.cum[s.cum.length - 1];
        let i = 0;
        while (i < s.cum.length - 2 && s.cum[i + 1] < d) i++;
        const a = s.pts[i];
        const b = s.pts[i + 1];
        const k = (d - s.cum[i]) / Math.max(1e-6, s.cum[i + 1] - s.cum[i]);
        const p = a.clone().lerp(b, k);
        return { p, heading: Math.atan2(b.x - a.x, b.z - a.z), flying: f > 0.01 && f < 0.99, battery: 100 - s.energy * f, leg: `${s.from} → ${s.to}`, km: s.km * f };
      }
      acc -= s.w;
    }
    const last = segs[segs.length - 1];
    return { p: last.pts[last.pts.length - 1].clone(), heading: 0, flying: false, battery: 100 - last.energy, leg: 'Arrived at S3', km: last.km };
  }

  // amber story route ribbon (revealed with drone progress)
  const routeTube = createFlowTube(routePts, { color: PALETTE.amber, radius: mobile ? 0.34 : 0.26, dash: 0.02, speed: 1.5, opacity: 0.95 });
  scene.add(routeTube.mesh);

  const update = (dt: number, t: number) => {
    const target = currentStoryParams();
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.4);
    const kp = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.5);
    // numeric params
    (Object.keys(smooth) as (keyof StoryParams)[]).forEach((key) => {
      if (key === 'cam' || key === 'tgt') return;
      (smooth as unknown as Record<string, number>)[key] += ((target as unknown as Record<string, number>)[key] - (smooth as unknown as Record<string, number>)[key]) * kp;
    });
    // camera
    posV.set(...target.cam);
    tgtV.set(...target.tgt);
    const inGeometry = storyBus.progress.geometry > 0 && storyBus.progress.closing === 0;
    if (storyBus.interactive.topDown && inGeometry) {
      posV.set(-72, 300, 1);
      tgtV.set(-72, 0, 0);
    }
    if (mobile) posV.add(tmp.set(-30, 30, 40));
    if (intro > 0) {
      intro = Math.max(0, intro - dt / 3.5);
      const e = intro * intro;
      posV.add(tmp.set(-90 * e, 80 * e, 60 * e));
    }
    camPos.lerp(posV, k);
    camTgt.lerp(tgtV, k);
    // keep the camera above ground
    const gy = groundY(camPos.x / U, camPos.z / U) + 8;
    if (camPos.y < gy) camPos.y = gy;
    camera.position.copy(camPos);
    camera.lookAt(camTgt);

    const p = smooth;
    sky.uniforms.uStorm.value = p.storm;
    sky.uniforms.uDusk.value = p.dusk;
    sky.uniforms.uTime.value = t;
    const fogC = new THREE.Color(0x58504f).lerp(new THREE.Color(0x2a3038), p.storm);
    (scene.fog as THREE.Fog).color.copy(fogC);
    (scene.fog as THREE.Fog).near = 120 - p.storm * 70;
    (scene.fog as THREE.Fog).far = 950 - p.storm * 520;
    lights.sun.intensity = 2.3 * (1 - p.storm * 0.75);
    lights.hemi.intensity = 0.45 + p.storm * 0.15;
    terrain.uniforms.uBlackoutOn.value = p.blackout;
    terrain.uniforms.uBlackoutR.value = SYSTEM.blackoutRadiusKm * U * p.blackout;
    terrain.uniforms.uContours.value = p.contours;
    terrain.setRoadFailure(p.fail);
    clouds.update(dt, p.storm, p.wind);
    rain.update(dt, Math.max(0, p.storm - 0.35) * 1.5, camera);
    windFix.update(dt, reducedMotion ? 0 : p.wind * 0.8 * (p.contours > 0.3 ? 1 : 0.4));
    blackout.update(t, p.blackout, p.fail);
    net.setStory({ reveal: p.reveal, links: p.links, fail: 0, dt, t, wind: p.wind });

    // drone + HUD
    const dState = droneAt(p.drone);
    const showDrone = p.reveal > 0.95 && (p.drone > 0.001 || storyBus.progress.geometry > 0.3);
    net.setStoryDrone(showDrone ? dState.p : null, dState.heading, dt, dState.flying);
    routeTube.mesh.visible = p.drone > 0.001;
    routeTube.uniforms.uProgress.value = Math.min(1, p.drone * 1.04);
    routeTube.update(t);
    if (storyBus.hud && inGeometry) storyBus.hud({ battery: dState.battery, leg: dState.leg, km: dState.km });

    // rings & coverage
    const ringsOn = inGeometry && p.reveal > 0.5;
    nominalRing.visible = ringsOn;
    designRing.visible = ringsOn;
    const hopKey = `${storyBus.interactive.payloadKg}|${storyBus.interactive.windKmh}`;
    if (hopKey !== lastHop) {
      lastHop = hopKey;
      scene.remove(designRing);
      designRing.geometry.dispose();
      const r = Math.max(0.5, maxHopKm(storyBus.interactive.payloadKg, storyBus.interactive.windKmh));
      designRing = makeRing(G.x, G.z, r, designMat, 0.8);
      scene.add(designRing);
    }
    coverage.visible = storyBus.interactive.coverage && (inGeometry || storyBus.progress.closing > 0);
    terrain.update(t);

    // labels
    for (const L of labels) {
      const el = labelEls.get(L.id);
      if (!el) continue;
      const vis = L.show(p);
      tmp.copy(L.pos).project(camera);
      const on = vis && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      el.style.opacity = on ? '1' : '0';
      if (on) el.style.transform = `translate(${((tmp.x + 1) / 2) * width}px, ${((1 - tmp.y) / 2) * height}px) translate(-50%, -100%)`;
    }
  };

  return {
    scene,
    camera,
    update,
    resize(w, h) {
      width = w;
      height = h;
    },
    dispose() {
      terrain.dispose();
      clouds.dispose();
      rain.dispose();
      windFix.dispose();
      blackout.dispose();
      net.dispose();
      routeTube.dispose();
    },
  };
}
