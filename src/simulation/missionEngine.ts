/**
 * Mission engine: drives drones, docks, charging, the 12-step medical workflow,
 * in-flight monitoring (divert / hold / emergency landing) and data-mule flights.
 * Deterministic: the same actions at the same sim times give the same result.
 */
import { SYSTEM, WORLD } from '../data/systemConstants';
import { INCIDENT, STATION_BY_ID, DOCK_IDS } from '../data/demoStations';
import type { MissionPreset } from '../data/demoMissions';
import { elevationM, elevToY, yToElev } from '../utils/terrainField';
import { buildProfile, dockCanCharge, dockWorld, evaluateHop, hopBudgetPct, hopEnergyPct, planRoute, terrainAStar } from './routePlanner';
import { commPath } from './networkGraph';
import { onMessageDelivered, processMesh, sendMessage, sendSOS } from './meshEngine';
import { DOCK_LIFT, clearAlert, log, raiseAlert } from './store';
import type { Drone, Flight, FlightPurpose, HopPlan, Km2, Mission, MissionStep, NodeId, SimState, Vec3 } from './types';

const U = WORLD.unitsPerKm;
const CRUISE_UPS = (SYSTEM.cruiseKmh / 3600) * U; // world units per sim second
const VERT_UPS = 0.05;
const HANDHELD_RANGE_KM = 3.5;
const RECHECK_S = 15;

// ---------------- flights ----------------
function makeFlight(purpose: FlightPurpose, from: NodeId | null, to: NodeId | null, pts: Vec3[], energyPct: number, startBattery: number): Flight {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
  return { purpose, from, to, pts, cum, total: cum[cum.length - 1], climbEnd: 1, descendStart: pts.length - 2, s: 0, energyPct, startBattery };
}

function flightFromHop(d: Drone, hop: HopPlan, purpose: FlightPurpose = 'hop'): Flight {
  const start = dockWorld(hop.from, DOCK_LIFT);
  const end = dockWorld(hop.to, DOCK_LIFT);
  const pts = [start, ...hop.profile, end];
  return makeFlight(purpose, hop.from, hop.to, pts, hop.energyPct, d.batteryPct);
}

export function posKm(p: Vec3): Km2 {
  return { x: p.x / U, z: p.z / U };
}

function flightFromHere(s: SimState, d: Drone, toKm: Km2, endPt: Vec3, purpose: FlightPurpose, to: NodeId | null, finalHoverAltM?: number): Flight | null {
  const here = posKm(d.pos);
  const tp = terrainAStar(here, toKm, s.conditions.corridorBlocked);
  if (!tp.ok) return null;
  const curAlt = yToElev(d.pos.y);
  const endAlt = finalHoverAltM ?? elevationM(toKm.x, toKm.z) + SYSTEM.flightClearanceM;
  const { profile, climbM } = buildProfile(tp.path, curAlt, endAlt);
  const wind = to ? (s.stations[to].windKmh + windNear(s, here)) / 2 : windNear(s, here);
  const energy = hopEnergyPct(tp.lengthKm, climbM, d.payloadKg, wind);
  const pts = [{ ...d.pos }, ...profile, endPt];
  return makeFlight(purpose, d.at, to, pts, energy, d.batteryPct);
}

function windNear(s: SimState, p: Km2): number {
  let best = Infinity;
  let w = 20;
  for (const id of DOCK_IDS) {
    const st = STATION_BY_ID[id];
    const dd = Math.hypot(st.x - p.x, st.z - p.z);
    if (dd < best) ((best = dd), (w = s.stations[id].windKmh));
  }
  return w;
}

function launch(s: SimState, d: Drone, f: Flight): void {
  if (d.at) {
    const st = s.stations[d.at];
    if (st.dockOccupiedBy === d.id) st.dockOccupiedBy = null;
  }
  d.flight = f;
  d.state = 'flying';
  d.chargeUntil = null;
  d.at = null;
}

function startCharge(s: SimState, d: Drone, id: NodeId): void {
  d.state = 'charging';
  const need = 100 - d.batteryPct;
  d.chargeUntil = s.clock + Math.max(60, SYSTEM.chargeMinutes * 60 * (need / 60));
  const wh = (SYSTEM.station.dronePackWh * need) / 100 / SYSTEM.station.chargeEfficiency;
  const st = s.stations[id];
  st.batteryPct = Math.max(0, st.batteryPct - (wh / (SYSTEM.station.batteryKWh * 1000)) * 100);
}

function landAt(s: SimState, d: Drone, id: NodeId): void {
  d.at = id;
  d.flight = null;
  d.pos = dockWorld(id, DOCK_LIFT);
  d.bank = 0;
  s.stations[id].dockOccupiedBy = d.id;
  if (dockCanCharge(s, id) && d.batteryPct < 99) {
    startCharge(s, d, id);
    log(s, 'drone', `${d.id} docked at ${id}, battery ${Math.round(d.batteryPct)}%. Charging / battery service`);
  } else {
    d.state = 'docked';
    log(s, 'drone', `${d.id} docked at ${id}, battery ${Math.round(d.batteryPct)}%${dockCanCharge(s, id) ? '' : ' (no charging: station offline or shedding load)'}`);
  }
}

function advanceFlight(_s: SimState, d: Drone, dt: number): boolean {
  const f = d.flight!;
  let remaining = dt;
  while (remaining > 0 && f.s < f.total) {
    let seg = 0;
    while (seg < f.cum.length - 2 && f.cum[seg + 1] <= f.s) seg++;
    const speed = seg < f.climbEnd || seg >= f.descendStart ? VERT_UPS : CRUISE_UPS;
    const segEnd = f.cum[seg + 1];
    const step = Math.min(remaining * speed, segEnd - f.s);
    f.s += step;
    remaining -= step / speed;
    if (step <= 1e-9) break;
  }
  // battery drain proportional to progress
  const progress = f.total > 0 ? f.s / f.total : 1;
  d.batteryPct = Math.max(0, f.startBattery - f.energyPct * progress);
  // position
  let seg = 0;
  while (seg < f.cum.length - 2 && f.cum[seg + 1] < f.s) seg++;
  const a = f.pts[seg];
  const b = f.pts[seg + 1] ?? a;
  const len = f.cum[seg + 1] - f.cum[seg] || 1;
  const t = Math.min(1, Math.max(0, (f.s - f.cum[seg]) / len));
  const np = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  const dx = np.x - d.pos.x;
  const dz = np.z - d.pos.z;
  if (Math.hypot(dx, dz) > 1e-4) {
    const h = Math.atan2(dx, dz);
    let dh = h - d.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    d.heading += dh * Math.min(1, dt * 0.25);
    d.bank = Math.max(-0.45, Math.min(0.45, dh * 1.4));
  } else d.bank *= 0.9;
  d.pos = np;
  return f.s >= f.total - 1e-6;
}

// ---------------- missions ----------------
export function activeMission(s: SimState): Mission | null {
  return s.missions.find((m) => m.id === s.activeMissionId) ?? null;
}

function markStep(m: Mission, step: MissionStep) {
  if (!m.stepsDone.includes(step)) m.stepsDone.push(step);
}

function entryNodeForIncident(s: SimState): NodeId | null {
  let best: NodeId | null = null;
  let bd = Infinity;
  for (const id of DOCK_IDS) {
    if (!s.stations[id].online) continue;
    const st = STATION_BY_ID[id];
    const d = Math.hypot(st.x - INCIDENT.x, st.z - INCIDENT.z);
    if (d < bd && d <= HANDHELD_RANGE_KM) ((bd = d), (best = id));
  }
  return best;
}

function nearestDockToIncident(s: SimState): NodeId | null {
  let best: NodeId | null = null;
  let bd = Infinity;
  for (const id of DOCK_IDS) {
    if (id === 'G' || !s.stations[id].online) continue;
    const st = STATION_BY_ID[id];
    const d = Math.hypot(st.x - INCIDENT.x, st.z - INCIDENT.z);
    if (d < bd) ((bd = d), (best = id));
  }
  return bd <= 7 ? best : null;
}

export function createMission(s: SimState, preset: MissionPreset): Mission | null {
  const busy = activeMission(s);
  if (busy && (busy.status === 'active' || busy.status === 'holding')) {
    log(s, 'warn', `Mission ${busy.id} still in progress. Pause, finish or reset before creating another.`);
    return null;
  }
  const m: Mission = {
    id: `M-${String(17 + s.missions.length).padStart(3, '0')}`,
    presetId: preset.id,
    label: preset.label,
    priority: preset.priority,
    payloadKg: preset.payloadKg,
    droneId: null,
    origin: 'G',
    target: null,
    step: 'request',
    stepsDone: [],
    status: 'active',
    statusText: 'Medical request created at the casualty site',
    createdAt: s.clock,
    sosMessageId: null,
    confirmMessageId: null,
    nextCheckAt: s.clock,
    delivered: false,
    confirmed: false,
    droneBackAtDock: false,
  };
  s.missions.push(m);
  s.activeMissionId = m.id;
  s.previousPlan = null;
  s.plan = null;
  log(s, 'info', `${m.id} created: ${preset.label}, ${preset.payloadKg} kg, ${preset.priority}`);
  sendRequest(s, m);
  return m;
}

function sendRequest(s: SimState, m: Mission) {
  const entry = entryNodeForIncident(s);
  if (!entry) {
    m.status = 'holding';
    m.statusText = 'No online station within handheld radio range of the casualty. Request cannot enter the mesh.';
    m.nextCheckAt = s.clock + RECHECK_S;
    raiseAlert(s, `nosos-${m.id}`, 'critical', `${m.id}: casualty out of mesh range`);
    return;
  }
  markStep(m, 'request');
  const msg = sendSOS(s, entry, m.id);
  m.sosMessageId = msg.id;
  m.step = 'received';
  m.status = 'active';
  m.statusText = `SOS travelling over the mesh from ${entry} to the command center`;
  log(s, 'msg', `SOS from casualty team reached ${entry} (handheld LoRa) and entered the mesh`);
}

onMessageDelivered((s, msg) => {
  const m = s.missions.find((x) => x.id === msg.missionId);
  if (!m) return;
  if (msg.kind === 'sos' && m.step === 'received') {
    markStep(m, 'received');
    log(s, 'ok', `SOS received at command center via ${msg.hops.join(' → ')} (${Math.round(msg.deliveredAt! - msg.createdAt)} s)`);
    m.step = 'identify';
    m.nextCheckAt = s.clock + 4;
  }
  if (msg.kind === 'confirm') {
    m.confirmed = true;
    markStep(m, 'confirm');
    log(s, 'ok', `Delivery confirmation received at command center via ${msg.hops.join(' → ')}`);
    maybeComplete(s, m);
  }
});

function maybeComplete(s: SimState, m: Mission) {
  if (m.delivered && m.confirmed && m.droneBackAtDock && m.status !== 'completed') {
    markStep(m, 'return');
    markStep(m, 'logged');
    m.step = 'logged';
    m.status = 'completed';
    m.statusText = 'Mission completed: payload delivered, confirmed and drone docked';
    log(s, 'ok', `${m.id} completed. Mission log closed.`);
  } else if (m.delivered && !m.confirmed && m.status !== 'completed') {
    const conf = s.messages.find((x) => x.id === m.confirmMessageId);
    if (conf?.state === 'stored') m.statusText = `Payload delivered. Confirmation held at ${conf.at} until a radio path returns`;
  }
}

const norm = (t: string) => t.replace(/[0-9.]+/g, '#');
function hold(s: SimState, m: Mission, text: string, alertKey?: string) {
  if (norm(m.statusText) !== norm(text) || m.status !== 'holding') log(s, 'warn', `${m.id} holding: ${text}`);
  m.status = 'holding';
  m.statusText = text;
  m.nextCheckAt = s.clock + RECHECK_S;
  if (alertKey) raiseAlert(s, alertKey, 'warning', `${m.id}: ${text}`);
}

function interrupt(s: SimState, m: Mission, text: string) {
  m.status = 'interrupted';
  m.statusText = text;
  log(s, 'fail', `${m.id} interrupted: ${text}`);
  raiseAlert(s, `int-${m.id}`, 'critical', `${m.id} interrupted`);
}

function droneOf(s: SimState, m: Mission): Drone | null {
  return s.drones.find((d) => d.id === m.droneId) ?? null;
}

function stepMission(s: SimState, m: Mission) {
  if (m.status === 'completed' || m.status === 'interrupted') return;
  if (s.clock < m.nextCheckAt) return;
  const d = droneOf(s, m);
  switch (m.step) {
    case 'request':
      sendRequest(s, m);
      return;
    case 'received':
      return; // waiting for the SOS to reach the command center
    case 'identify': {
      const t = nearestDockToIncident(s);
      if (!t) return hold(s, m, 'No online dock near the incident');
      m.target = t;
      markStep(m, 'identify');
      log(s, 'route', `Nearest feasible station to the casualty: ${t}`);
      m.step = 'assign';
      m.nextCheckAt = s.clock + 3;
      return;
    }
    case 'assign': {
      const drone = s.drones.find((x) => x.at === 'G' && !x.missionId && (x.state === 'docked' || x.state === 'charging'));
      if (!drone) return hold(s, m, 'No drone available at the gateway');
      drone.missionId = m.id;
      drone.payloadKg = m.payloadKg;
      m.droneId = drone.id;
      markStep(m, 'assign');
      log(s, 'drone', `${drone.id} assigned at gateway, ${m.payloadKg} kg ${m.label.toLowerCase()} loaded`);
      m.step = 'plan';
      m.nextCheckAt = s.clock + 3;
      return;
    }
    case 'plan':
    case 'checks':
    case 'transit': {
      if (!d || d.state === 'flying' || d.state === 'grounded') return;
      if (d.state === 'charging') return; // wait for charge
      if (!d.at) return;
      if (!m.target || !s.stations[m.target].online) {
        const t = nearestDockToIncident(s);
        if (!t) return hold(s, m, 'Target dock offline and no alternate dock near the incident');
        if (t !== m.target) log(s, 'route', `Target dock changed to ${t}`);
        m.target = t;
      }
      if (d.at === m.target) {
        m.step = 'deliver';
        m.nextCheckAt = s.clock;
        return;
      }
      if (d.batteryPct < 95 && dockCanCharge(s, d.at)) {
        startCharge(s, d, d.at);
        m.statusText = `${d.id} topping up at ${d.at} before departure`;
        return;
      }
      const plan = planRoute(s, d.at, m.target, m.payloadKg, d.batteryPct);
      const prevRemaining = s.plan && s.plan.feasible && s.plan.route.includes(d.at) ? s.plan.route.slice(s.plan.route.indexOf(d.at)).join('>') : null;
      if (!plan.feasible) {
        s.plan = plan;
        const weather = plan.reason.startsWith('Weather');
        return hold(s, m, plan.reason, weather ? 'weather-hold' : `noroute-${m.id}`);
      }
      // feasible
      clearAlert(s, `noroute-${m.id}`);
      clearAlert(s, 'weather-hold');
      if (m.step === 'plan') {
        markStep(m, 'plan');
        log(s, 'route', `Route calculated (Dijkstra over docks): ${plan.route.join(' → ')}, ${plan.totalKm.toFixed(1)} km in ${plan.hops.length} hops, max ${Math.max(...plan.hops.map((h) => h.energyPct)).toFixed(0)}% battery per hop, recharge at each dock`);
      } else if (prevRemaining !== plan.route.join('>')) {
        if (s.plan?.feasible) s.previousPlan = s.plan;
        log(s, 'route', `Replanned from ${d.at}: ${plan.route.join(' → ')}`);
      }
      s.plan = plan;
      const hop = plan.hops[0];
      // checks
      markStep(m, 'checks');
      const windMax = Math.max(s.stations[hop.from].windKmh, s.stations[hop.to].windKmh);
      if (windMax > SYSTEM.droneWindLimitKmh) return hold(s, m, `Weather hold at ${d.at}: wind ${Math.round(windMax)} km/h`, 'weather-hold');
      if (d.batteryPct - hop.energyPct < SYSTEM.batteryReservePct) return hold(s, m, `Battery ${Math.round(d.batteryPct)}% too low for ${hop.from}→${hop.to}; waiting to charge`);
      m.status = 'active';
      m.statusText = `${d.id} flying ${hop.from} → ${hop.to} (${hop.distanceKm.toFixed(1)} km)`;
      if (!m.stepsDone.includes('depart')) {
        markStep(m, 'depart');
        log(s, 'drone', `${d.id} launched from ${hop.from}. Battery and weather checks passed`);
      } else log(s, 'drone', `${d.id} departing ${hop.from} → ${hop.to}`);
      m.step = 'transit';
      launch(s, d, flightFromHop(d, hop));
      return;
    }
    case 'deliver': {
      if (!d || d.state === 'flying' || d.state === 'delivering') return;
      if (d.state === 'charging') return;
      if (!d.at) return;
      const windMax = s.stations[d.at].windKmh;
      if (windMax > SYSTEM.droneWindLimitKmh) return hold(s, m, `Weather hold at ${d.at} before the drop`, 'weather-hold');
      markStep(m, 'transit');
      const groundM = elevationM(INCIDENT.x, INCIDENT.z);
      const hoverAlt = groundM + 35;
      const end = { x: INCIDENT.x * U, y: elevToY(hoverAlt), z: INCIDENT.z * U };
      const f = flightFromHere(s, d, { x: INCIDENT.x, z: INCIDENT.z }, end, 'drop', null, hoverAlt + 60);
      if (!f) return hold(s, m, 'No terrain path to the drop point');
      if (d.batteryPct - f.energyPct * 2 < SYSTEM.batteryReservePct) return hold(s, m, `Waiting to charge before the drop (battery ${Math.round(d.batteryPct)}%)`);
      m.status = 'active';
      m.statusText = `${d.id} flying to the drop point`;
      log(s, 'drone', `${d.id} departing ${d.at} for the casualty drop point`);
      launch(s, d, f);
      return;
    }
    default:
      return;
  }
}

// ---------------- in-flight monitoring ----------------
function monitorFlight(s: SimState, d: Drone) {
  const f = d.flight!;
  if (f.purpose === 'divert' && (!f.to || s.stations[f.to].online)) return;
  if (f.purpose === 'drop' && f.s / f.total > 0.97) return;
  const remainingEnergy = f.energyPct * (1 - f.s / f.total);
  const destOffline = f.to !== null && !s.stations[f.to].online;
  const windy = s.conditions.highWind;
  const lowBatt = d.batteryPct - remainingEnergy < SYSTEM.batteryReservePct;
  if (!destOffline && !windy && !lowBatt) return;
  const reason = destOffline ? `${f.to} went offline` : windy ? 'wind above the drone limit' : `battery ${Math.round(d.batteryPct)}% cannot cover the remaining ${remainingEnergy.toFixed(0)}% with reserve`;
  divert(s, d, reason);
}

function divert(s: SimState, d: Drone, reason: string) {
  const m = s.missions.find((x) => x.id === d.missionId) ?? null;
  const here = posKm(d.pos);
  const nearestOnly = s.conditions.highWind || reason.startsWith('battery');
  const cands: { id: NodeId; f: Flight; score: number; normal: boolean }[] = [];
  for (const id of DOCK_IDS) {
    if (!s.stations[id].online) continue;
    const st = STATION_BY_ID[id];
    if (Math.hypot(st.x - here.x, st.z - here.z) > 9) continue;
    const f = flightFromHere(s, d, { x: st.x, z: st.z }, dockWorld(id, DOCK_LIFT), 'divert', id);
    if (!f || f.energyPct > d.batteryPct - 2) continue;
    const normal = f.energyPct <= hopBudgetPct(d.batteryPct);
    let score = f.energyPct;
    if (!nearestOnly && m?.target && id !== m.target) {
      const onward = planRoute(s, id, m.target, d.payloadKg, dockCanCharge(s, id) ? 100 : d.batteryPct - f.energyPct);
      score += onward.feasible ? onward.totalEnergyPct : 200;
    }
    cands.push({ id, f, score, normal });
  }
  const pool = cands.some((c) => c.normal) ? cands.filter((c) => c.normal) : cands;
  const best = pool.sort((a, b) => a.score - b.score)[0] ?? null;
  log(s, 'route', `${d.id} replanning in flight (D* Lite-style): ${reason}`);
  if (best) {
    const same = d.flight?.to === best.id;
    log(s, 'route', same ? `${d.id}: ${best.id} is still the best reachable dock (${best.f.energyPct.toFixed(0)}% needed, ${Math.round(d.batteryPct)}% on board). Continuing${best.normal ? '' : ' on reserve'}` : `${d.id} diverting to ${best.id} (${best.f.energyPct.toFixed(0)}% needed, ${Math.round(d.batteryPct)}% on board${best.normal ? '' : ', using reserve'})`);
    if (m) {
      m.statusText = `${d.id} diverting to ${best.id}: ${reason}`;
      if (s.plan) s.previousPlan = s.plan;
    }
    d.flight = best.f;
    return;
  }
  // controlled emergency landing
  const gy = elevToY(elevationM(here.x, here.z)) + 0.12;
  const f = makeFlight('divert', null, null, [{ ...d.pos }, { ...d.pos, y: (d.pos.y + gy) / 2 }, { ...d.pos, y: gy }], 0.5, d.batteryPct);
  f.climbEnd = 0;
  f.descendStart = 0;
  d.flight = f;
  log(s, 'fail', `${d.id}: no dock reachable with remaining battery. Controlled emergency landing`);
  if (m) interrupt(s, m, `${d.id} made a controlled emergency landing (${reason}). Payload not delivered; ground recovery required.`);
}

function onFlightComplete(s: SimState, d: Drone) {
  const f = d.flight!;
  const m = s.missions.find((x) => x.id === d.missionId) ?? null;
  if (f.purpose === 'drop') {
    d.state = 'delivering';
    d.flight = null;
    d.release = 0;
    log(s, 'drone', `${d.id} hovering 35 m above the drop point, releasing payload`);
    return;
  }
  if (!f.to) {
    d.state = 'grounded';
    d.flight = null;
    return;
  }
  landAt(s, d, f.to);
  if (f.purpose === 'mule') {
    for (const id of d.bundle) {
      const msg = s.messages.find((x) => x.id === id);
      if (msg) {
        msg.at = f.to;
        msg.hops.push(f.to);
        msg.state = 'queued';
        msg.storedLogged = false;
      }
    }
    log(s, 'msg', `Data-mule bundle (${d.bundle.length} msg) handed to ${f.to} and re-entered the mesh`);
    d.bundle = [];
    return;
  }
  if (!m) return;
  if (f.purpose === 'return' || (f.purpose === 'divert' && m.delivered)) {
    m.droneBackAtDock = true;
    log(s, 'drone', `${d.id} returned to ${f.to} (safe dock)`);
    d.missionId = null;
    d.payloadKg = 0;
    maybeComplete(s, m);
    return;
  }
  m.nextCheckAt = s.clock + 2;
  if (m.step === 'transit' && f.to === m.target) {
    markStep(m, 'transit');
    m.step = 'deliver';
  }
}

function updateRelease(s: SimState, d: Drone, dt: number) {
  d.release = Math.min(1, d.release + dt / 25);
  if (d.release < 1) return;
  const m = s.missions.find((x) => x.id === d.missionId);
  d.payloadKg = 0;
  if (m) {
    m.delivered = true;
    markStep(m, 'deliver');
    m.status = 'delivered';
    m.statusText = 'Payload delivered. Confirmation travelling to the command center';
    log(s, 'ok', `Payload delivered at drop point (${m.payloadKg} kg). Latch, weight and ID verified`);
    const from = m.target && s.stations[m.target].online ? m.target : entryNodeForIncident(s);
    if (from) {
      const msg = sendMessage(s, { kind: 'confirm', priority: 0, origin: from, dest: 'CC', label: 'P0 delivery confirmation', missionId: m.id });
      m.confirmMessageId = msg.id;
    }
    m.step = 'confirm';
  }
  // return to the safe dock
  const target = (m?.target && s.stations[m.target].online ? m.target : null) ?? nearestDockToIncident(s);
  if (!target) {
    d.state = 'holding';
    return;
  }
  const st = STATION_BY_ID[target];
  const f = flightFromHere(s, d, { x: st.x, z: st.z }, dockWorld(target, DOCK_LIFT), 'return', target);
  if (f) {
    d.state = 'flying';
    d.flight = f;
    log(s, 'drone', `${d.id} returning to ${target}`);
  }
}

// ---------------- data mule ----------------
function processDataMule(s: SimState) {
  if (!s.conditions.dataMule) return;
  const storedByNode = new Map<NodeId, string[]>();
  for (const m of s.messages) if (m.state === 'stored' && m.at !== 'CC') storedByNode.set(m.at, [...(storedByNode.get(m.at) ?? []), m.id]);
  for (const [node, ids] of storedByNode) {
    const drone = s.drones.find((d) => d.at === node && !d.missionId && (d.state === 'docked' || d.state === 'charging') && d.batteryPct >= 45);
    if (!drone) continue;
    let best: { to: NodeId; hop: HopPlan } | null = null;
    for (const to of DOCK_IDS) {
      if (to === node || !s.stations[to].online) continue;
      if (!commPath(s, to, 'CC')) continue;
      const { hop, ev } = evaluateHop(s, node, to, { payloadKg: 0.2, departBattery: drone.batteryPct });
      if (ev.verdict !== 'ok' || !hop) continue;
      if (!best || hop.energyPct < best.hop.energyPct) best = { to, hop };
    }
    if (!best) continue;
    drone.bundle = ids;
    for (const id of ids) {
      const msg = s.messages.find((x) => x.id === id);
      if (msg) msg.state = 'mule';
    }
    log(s, 'drone', `Data mule: ${drone.id} carrying ${ids.length} stored message(s) from ${node} to ${best.to}`);
    launch(s, drone, flightFromHop(drone, best.hop, 'mule'));
  }
}

// ---------------- station dynamics ----------------
function updateStations(s: SimState, dt: number) {
  for (const id of Object.keys(s.stations) as NodeId[]) {
    const st = s.stations[id];
    const spec = STATION_BY_ID[id];
    const base = s.conditions.highWind && id !== 'CC' ? 62 + (spec.windKmh - 18) * 0.8 : spec.windKmh;
    st.windKmh = base + Math.sin(s.clock / 47 + spec.x) * 2.5;
    if (!st.online) continue;
    st.batteryPct = Math.min(100, st.batteryPct + dt * 0.00035);
    if (st.powerMode === 'normal' && st.batteryPct < 22) {
      st.powerMode = 'shed';
      log(s, 'warn', `${id} battery ${Math.round(st.batteryPct)}%: drone charging shed, comms reserve protected`);
      raiseAlert(s, `shed-${id}`, 'warning', `${id} load shedding`);
    } else if (st.powerMode === 'shed' && st.batteryPct > 30) {
      st.powerMode = 'normal';
      clearAlert(s, `shed-${id}`);
    }
  }
}

// ---------------- main tick ----------------
let monitorAcc = 0;
export function tick(s: SimState, dt: number): void {
  s.clock += dt;
  // scheduled link recoveries
  for (const l of s.links) {
    if (l.recoverAt !== null && s.clock >= l.recoverAt) {
      l.up = true;
      l.recoverAt = null;
      log(s, 'ok', `Link ${l.a}–${l.b} recovered`);
      clearAlert(s, `link-${l.id}`);
      for (const m of s.missions) if (m.status === 'holding') m.nextCheckAt = s.clock;
    }
  }
  updateStations(s, dt);
  processMesh(s);
  monitorAcc += dt;
  const doMonitor = monitorAcc >= 2;
  if (doMonitor) monitorAcc = 0;
  for (const d of s.drones) {
    if (d.state === 'flying' && d.flight) {
      if (doMonitor) monitorFlight(s, d);
      if (advanceFlight(s, d, dt)) onFlightComplete(s, d);
    } else if (d.state === 'charging' && d.chargeUntil !== null) {
      const total = d.chargeUntil - s.clock;
      if (total <= 0) {
        d.batteryPct = 100;
        d.state = 'docked';
        d.chargeUntil = null;
        log(s, 'drone', `${d.id} charged to 100% at ${d.at}`);
        const m = s.missions.find((x) => x.id === d.missionId);
        if (m) m.nextCheckAt = s.clock + 1;
      } else {
        d.batteryPct = Math.min(100, d.batteryPct + ((100 - d.batteryPct) * dt) / Math.max(dt, total));
      }
    } else if (d.state === 'delivering') {
      updateRelease(s, d, dt);
    }
  }
  processDataMule(s);
  for (const m of s.missions) stepMission(s, m);
  for (const m of s.missions) if (m.delivered && !m.confirmed) maybeComplete(s, m);
}

export function wakeMissions(s: SimState): void {
  for (const m of s.missions) if (m.status === 'holding' || m.status === 'active') m.nextCheckAt = Math.min(m.nextCheckAt, s.clock);
}

export { hopBudgetPct };
