/**
 * Network layer shared by the story scene and the live simulation scene:
 * docking stations, command center, mesh links (cyan), drone routes (amber),
 * drones, message pulses and the incident marker. Can be driven by scripted
 * story parameters or directly by the shared simulation state.
 */
import * as THREE from 'three';
import { WORLD } from '../data/systemConstants';
import { STATIONS, STATION_BY_ID, COMM_LINKS, INCIDENT } from '../data/demoStations';
import { elevationM, elevToY, groundY } from '../utils/terrainField';
import { createDockingStation, type DockingStationApi } from '../models/DockingStation';
import { createDrone, type DroneApi } from '../models/Drone';
import { createCommandCenter } from '../models/CommandCenter';
import { createIncidentMarker } from '../models/Markers';
import { createFlowTube, arcPoints, type FlowTube } from '../models/FlightRibbon';
import { createPulseRing } from '../models/NetworkNode';
import { PALETTE } from '../models/materials';
import { linkId, linkUsable } from '../simulation/networkGraph';
import { DOCK_LIFT } from '../simulation/store';
import type { NodeId, SimState, Vec3 } from '../simulation/types';

const U = WORLD.unitsPerKm;
export const STATION_SCALE = 0.15;
export const DRONE_SCALE = 0.26;

export function nodeWorld(id: NodeId, lift = 0): THREE.Vector3 {
  const s = STATION_BY_ID[id];
  return new THREE.Vector3(s.x * U, elevToY(elevationM(s.x, s.z)) + lift, s.z * U);
}

const PRIORITY_COLOR = [0xffffff, PALETTE.cyan, 0x3fb3ad, 0x5f8a96];

export function createNetworkLayer(opts: { detail: 'high' | 'low'; mobile: boolean }) {
  const group = new THREE.Group();
  const stations = new Map<NodeId, { api: DockingStationApi; root: THREE.Group; ring: ReturnType<typeof createPulseRing>; beacon: THREE.Group; beaconMat: THREE.MeshBasicMaterial }>();
  for (const s of STATIONS) {
    if (s.kind === 'command') continue;
    const api = createDockingStation({ detail: 'low' });
    const root = new THREE.Group();
    root.add(api.group);
    api.group.scale.setScalar(STATION_SCALE);
    root.position.copy(nodeWorld(s.id));
    root.rotation.y = -0.4;
    const ring = createPulseRing(PALETTE.cyan);
    ring.mesh.position.y = 0.6;
    root.add(ring.mesh);
    // tall beacon so each dock reads at valley scale
    const beaconMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    const beacon = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 12, 8, 1, true), beaconMat);
    shaft.position.y = 6.4;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), beaconMat);
    tip.position.y = 12.6;
    beacon.add(shaft, tip);
    root.add(beacon);
    group.add(root);
    stations.set(s.id, { api, root, ring, beacon, beaconMat });
  }
  const cc = createCommandCenter();
  cc.group.scale.setScalar(0.12);
  cc.group.position.copy(nodeWorld('CC'));
  cc.group.rotation.y = 0.5;
  group.add(cc.group);

  // mesh links
  const links = new Map<string, { tube: FlowTube; a: NodeId; b: NodeId; pts: THREE.Vector3[] }>();
  for (const l of COMM_LINKS) {
    const a = nodeWorld(l.a, l.a === 'CC' ? 1.0 : 1.1);
    const b = nodeWorld(l.b, l.b === 'CC' ? 1.0 : 1.1);
    const pts = arcPoints(a, b, 1.2 + a.distanceTo(b) * 0.06, 28);
    const tube = createFlowTube(pts, { color: PALETTE.cyan, radius: opts.mobile ? 0.2 : 0.16, dash: 0.06, speed: 1.4, opacity: 0.85 });
    group.add(tube.mesh);
    links.set(linkId(l.a, l.b), { tube, a: l.a, b: l.b, pts });
  }

  // drones (pool of 3, matching the simulation)
  const drones: { api: DroneApi; obj: THREE.Group }[] = [];
  for (let i = 0; i < 3; i++) {
    const api = createDrone({ detail: opts.detail });
    const obj = new THREE.Group();
    api.group.scale.setScalar(DRONE_SCALE);
    obj.add(api.group);
    obj.visible = false;
    group.add(obj);
    drones.push({ api, obj });
  }

  // routes
  const routeTube = createFlowTube([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)], { color: PALETTE.amber, radius: 0.16, dash: 0.03, speed: 2, opacity: 0.95 });
  routeTube.mesh.visible = false;
  group.add(routeTube.mesh);
  const prevTube = createFlowTube([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)], { color: 0x8a7a66, radius: 0.1, dash: 0.02, speed: 0, opacity: 0.5 });
  prevTube.mesh.visible = false;
  group.add(prevTube.mesh);
  const flightTube = createFlowTube([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)], { color: PALETTE.amber, radius: 0.1, dash: 0.05, speed: 3, opacity: 0.9 });
  flightTube.mesh.visible = false;
  group.add(flightTube.mesh);

  // message pulses
  const msgGeo = new THREE.SphereGeometry(0.35, 12, 8);
  const msgPool: THREE.Mesh[] = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(msgGeo, new THREE.MeshBasicMaterial({ color: PALETTE.cyan, toneMapped: false }));
    m.visible = false;
    group.add(m);
    msgPool.push(m);
  }

  // incident
  const incident = createIncidentMarker();
  incident.group.scale.setScalar(0.5);
  incident.group.position.set(INCIDENT.x * U, groundY(INCIDENT.x, INCIDENT.z), INCIDENT.z * U);
  group.add(incident.group);

  const v = new THREE.Vector3();
  let routeKey = '';
  let prevKey = '';
  let flightKey = '';

  function placeDrone(i: number, p: Vec3, heading: number, bank: number, dt: number, flying: boolean, release: number, hasPayload: boolean, offset: number) {
    const d = drones[i];
    d.obj.visible = true;
    d.obj.position.set(p.x + offset, p.y, p.z + offset * 0.6);
    d.obj.rotation.y = heading;
    d.api.update(dt, { throttle: flying ? 1 : 0.0, bank, pitch: flying ? 0.12 : 0, release, hasPayload });
  }

  return {
    group,
    stations,
    links,
    drones,
    incident,
    cc,
    /** Scripted story mode. */
    setStory(o: { reveal: number; links: number; fail: number; dt: number; t: number; wind: number; coverage?: boolean }) {
      let i = 0;
      for (const [id, st] of stations) {
        const order = ['G', 'S1', 'S2', 'S3', 'S2b'].indexOf(id);
        const local = THREE.MathUtils.clamp(o.reveal * 5.2 - order, 0, 1);
        st.root.visible = local > 0.01;
        const e = 1 - Math.pow(1 - local, 3);
        st.root.scale.setScalar(Math.max(0.001, e));
        st.root.position.y = nodeWorld(id).y + (1 - e) * 6;
        st.api.setDoors(local > 0.9 ? 1 : 0);
        st.api.setStatus(local > 0.95 ? 'ok' : 'off');
        st.api.update(o.dt, o.t, { windKmh: 20 + o.wind * 40, braked: o.wind > 0.8, charging: 0.7, chargeActive: false, sun: 0.4 });
        const ph = (o.t * 0.5 + i * 0.2) % 1;
        st.ring.set(ph, 6);
        st.ring.mesh.visible = local > 0.95 && o.links > 0.05;
        st.beacon.visible = local > 0.6;
        st.beacon.scale.setScalar(Math.max(0.001, local));
        st.beaconMat.color.set(PALETTE.cyan);
        i++;
      }
      for (const [, l] of links) {
        const order = ['G', 'S1', 'S2', 'S3', 'S2b'].indexOf(l.b) + (l.a === 'CC' ? -1 : 0);
        const local = THREE.MathUtils.clamp(o.links * 5 - Math.max(0, order), 0, 1);
        l.tube.uniforms.uProgress.value = local;
        l.tube.mesh.visible = local > 0.01;
        l.tube.setColor(o.fail > 0.5 && (l.a === 'S2' || l.b === 'S2') ? PALETTE.coral : PALETTE.cyan);
        l.tube.update(o.t);
      }
      incident.update(o.t, 1);
    },
    /** Live mode: everything comes from the shared simulation state. */
    syncSim(s: SimState, dt: number, t: number) {
      for (const [id, st] of stations) {
        const ss = s.stations[id];
        const charging = s.drones.find((d) => d.at === id && d.state === 'charging');
        st.api.setStatus(!ss.online ? 'fault' : ss.powerMode === 'shed' || !ss.tiltOk ? 'warn' : 'ok');
        st.api.setDoors(!ss.online || s.conditions.highWind ? 0 : 1);
        st.api.update(dt, t, { windKmh: ss.windKmh, braked: !ss.online, charging: ss.batteryPct / 100, chargeActive: !!charging, sun: 0.5 });
        const ph = (t * 0.5) % 1;
        st.ring.set(ph, 6);
        st.ring.mesh.visible = ss.online;
        st.beacon.visible = true;
        st.beacon.scale.setScalar(1);
        st.beaconMat.color.set(ss.online ? (s.selectedStation === id ? 0xffffff : PALETTE.cyan) : PALETTE.coral);
        st.beaconMat.opacity = ss.online ? 0.55 : 0.8;
      }
      for (const [, l] of links) {
        const sl = s.links.find((x) => x.a === l.a && x.b === l.b) ?? s.links.find((x) => x.id === linkId(l.a, l.b))!;
        const ok = linkUsable(s, sl);
        l.tube.setColor(ok ? PALETTE.cyan : PALETTE.coral);
        l.tube.uniforms.uSpeed.value = ok ? 1.4 : 0;
        l.tube.uniforms.uOpacity.value = ok ? 0.85 : 0.55;
        l.tube.uniforms.uProgress.value = 1;
        l.tube.mesh.visible = true;
        l.tube.update(t);
      }
      // drones
      const occupancy = new Map<string, number>();
      s.drones.forEach((d, i) => {
        let off = 0;
        if (d.at) {
          const k = d.at;
          const c = occupancy.get(k) ?? 0;
          occupancy.set(k, c + 1);
          off = c * 0.5;
        }
        const flying = d.state === 'flying' || d.state === 'delivering';
        placeDrone(i, d.pos, d.heading, d.bank, dt, flying, d.state === 'delivering' ? d.release : d.release >= 1 && d.payloadKg === 0 ? 0 : 0, d.payloadKg > 0, off);
        if (d.state === 'grounded') drones[i].obj.position.y = Math.max(drones[i].obj.position.y, groundY(d.pos.x / U, d.pos.z / U));
      });
      // plan ribbons
      const plan = s.plan;
      const key = plan && plan.feasible ? `${plan.createdAt}|${plan.route.join('>')}` : '';
      if (key !== routeKey) {
        routeKey = key;
        if (plan && plan.feasible) {
          const pts: THREE.Vector3[] = [];
          for (const h of plan.hops) {
            pts.push(nodeWorld(h.from, DOCK_LIFT));
            for (const p of h.profile) pts.push(new THREE.Vector3(p.x, p.y, p.z));
            pts.push(nodeWorld(h.to, DOCK_LIFT));
          }
          routeTube.setPoints(pts);
          routeTube.mesh.visible = true;
        } else routeTube.mesh.visible = false;
      }
      const prev = s.previousPlan;
      const pk = prev && prev.feasible ? `${prev.createdAt}|${prev.route.join('>')}` : '';
      if (pk !== prevKey) {
        prevKey = pk;
        if (prev && prev.feasible) {
          const pts: THREE.Vector3[] = [];
          for (const h of prev.hops) for (const p of h.profile) pts.push(new THREE.Vector3(p.x, p.y + 0.05, p.z));
          prevTube.setPoints(pts);
          prevTube.mesh.visible = true;
        } else prevTube.mesh.visible = false;
      }
      routeTube.update(t);
      // active flight path (diverts, drops, returns)
      const md = s.drones.find((d) => d.flight && (d.flight.purpose !== 'hop' || d.missionId === null));
      const fk = md?.flight ? `${md.id}|${md.flight.purpose}|${md.flight.total.toFixed(2)}` : '';
      if (fk !== flightKey) {
        flightKey = fk;
        if (md?.flight) {
          flightTube.setPoints(md.flight.pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
          flightTube.setColor(md.flight.purpose === 'divert' ? 0xffc078 : md.flight.purpose === 'mule' ? PALETTE.cyan : PALETTE.amber);
          flightTube.mesh.visible = true;
        } else flightTube.mesh.visible = false;
      }
      flightTube.update(t);
      // messages
      let k = 0;
      for (const m of s.messages) {
        if (k >= msgPool.length) break;
        if (m.state === 'transit' && m.hopTo) {
          const L = links.get(linkId(m.at, m.hopTo));
          if (!L) continue;
          let f = THREE.MathUtils.clamp((s.clock - m.hopStart) / Math.max(0.01, m.hopEnd - m.hopStart), 0, 1);
          if (L.a !== m.at) f = 1 - f;
          const idx = f * (L.pts.length - 1);
          const i0 = Math.floor(idx);
          const i1 = Math.min(L.pts.length - 1, i0 + 1);
          v.copy(L.pts[i0]).lerp(L.pts[i1], idx - i0);
          const mesh = msgPool[k++];
          mesh.visible = true;
          mesh.position.copy(v);
          mesh.scale.setScalar(m.priority === 0 ? 1.5 : 1);
          (mesh.material as THREE.MeshBasicMaterial).color.set(PRIORITY_COLOR[m.priority]);
        } else if (m.state === 'stored' || m.state === 'queued') {
          const base = nodeWorld(m.at, 2.2);
          const stackIdx = s.messages.filter((x) => (x.state === 'stored' || x.state === 'queued') && x.at === m.at && x.id < m.id).length;
          const mesh = msgPool[k++];
          mesh.visible = true;
          mesh.position.set(base.x, base.y + stackIdx * 0.8, base.z);
          mesh.scale.setScalar(m.state === 'stored' ? 0.8 : 0.6);
          (mesh.material as THREE.MeshBasicMaterial).color.set(m.state === 'stored' ? PALETTE.amber : PRIORITY_COLOR[m.priority]);
        } else if (m.state === 'mule') {
          const d = s.drones.find((x) => x.bundle.includes(m.id));
          if (!d) continue;
          const mesh = msgPool[k++];
          mesh.visible = true;
          mesh.position.set(d.pos.x, d.pos.y + 0.6, d.pos.z);
          mesh.scale.setScalar(0.7);
          (mesh.material as THREE.MeshBasicMaterial).color.set(PALETTE.cyan);
        }
      }
      for (; k < msgPool.length; k++) msgPool[k].visible = false;
      const m = s.missions.find((x) => x.id === s.activeMissionId);
      incident.update(t, m && m.status !== 'completed' ? 1 : 0.35);
    },
    /** Story drone placement. */
    setStoryDrone(p: THREE.Vector3 | null, heading: number, dt: number, flying: boolean) {
      drones.forEach((d, i) => (d.obj.visible = i === 0 && !!p));
      if (p) placeDrone(0, p, heading, 0, dt, flying, 0, true, 0);
    },
    dispose() {
      links.forEach((l) => l.tube.dispose());
      routeTube.dispose();
      prevTube.dispose();
      flightTube.dispose();
      msgGeo.dispose();
    },
  };
}

export type NetworkLayer = ReturnType<typeof createNetworkLayer>;
