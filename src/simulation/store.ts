/**
 * Single source of truth for the RescueMesh demo simulation.
 * State is a mutable object; every mutation goes through `mutate`, which bumps
 * the version and notifies subscribers. 3D scenes read state directly each
 * frame; React UI subscribes to a throttled notification (~12 Hz).
 */
import { useSyncExternalStore } from 'react';
import { STATIONS, COMM_LINKS } from '../data/demoStations';
import { SYSTEM, SIM_START_LABEL_SECONDS } from '../data/systemConstants';
import type { Alert, Drone, EventKind, NodeId, SimState, StationState } from './types';
import { dockWorld } from './routePlanner';
import { linkId } from './networkGraph';

export const DOCK_LIFT = 0.42; // world units: pad height of the symbolic station model

function makeDrone(id: string, label: string, at: NodeId, battery: number): Drone {
  const p = dockWorld(at, DOCK_LIFT);
  return { id, label, at, pos: p, heading: 0, bank: 0, batteryPct: battery, state: 'docked', payloadKg: 0, missionId: null, flight: null, chargeUntil: null, bundle: [], release: 0 };
}

export function createInitialState(): SimState {
  const stations = {} as Record<NodeId, StationState>;
  for (const s of STATIONS) {
    stations[s.id] = {
      id: s.id,
      name: s.name,
      kind: s.kind,
      online: true,
      batteryPct: s.initialBatteryPct,
      windKmh: s.windKmh,
      tempC: s.tempC,
      tiltOk: true,
      voltageOk: true,
      dockOccupiedBy: null,
      powerMode: s.initialBatteryPct > 25 ? 'normal' : 'shed',
      faults: [],
    };
  }
  const drones = [makeDrone('D1', 'D1 heavy-lift', 'G', 100), makeDrone('D2', 'D2 backup', 'S1', 96), makeDrone('D3', 'D3 forward', 'S3', 82)];
  for (const d of drones) if (d.at) stations[d.at].dockOccupiedBy = d.id;
  return {
    version: 0,
    clock: 0,
    paused: false,
    speed: 30,
    stations,
    links: COMM_LINKS.map((l) => ({ id: linkId(l.a, l.b), a: l.a, b: l.b, kind: l.kind, up: true, recoverAt: null })),
    conditions: { highWind: false, corridorBlocked: false, storeForward: true, dataMule: false },
    drones,
    missions: [],
    activeMissionId: null,
    messages: [],
    events: [{ id: 0, t: 0, kind: 'info', text: 'Demo simulation initialised. Mesh 6/6 nodes up.' }],
    alerts: [],
    plan: null,
    previousPlan: null,
    nodeNextSlot: { CC: 0, G: 0, S1: 0, S2: 0, S2b: 0, S3: 0 },
    selectedStation: null,
    highlight: null,
    seq: 1,
  };
}

let state: SimState = createInitialState();
const fastSubs = new Set<() => void>();
const uiSubs = new Set<() => void>();
let uiTimer: number | null = null;
let uiVersion = 0;

export function getSim(): SimState {
  return state;
}

function flushUI() {
  uiTimer = null;
  uiVersion++;
  uiSubs.forEach((f) => f());
}

/** Notify after a mutation. `immediate` skips UI throttling (user actions). */
export function emit(immediate = false): void {
  state.version++;
  fastSubs.forEach((f) => f());
  if (immediate) {
    if (uiTimer !== null) {
      clearTimeout(uiTimer);
      uiTimer = null;
    }
    flushUI();
  } else if (uiTimer === null) {
    uiTimer = window.setTimeout(flushUI, 80);
  }
}

export function mutate(fn: (s: SimState) => void, immediate = true): void {
  fn(state);
  emit(immediate);
}

export function resetSim(): void {
  const speed = state.speed;
  state = createInitialState();
  state.speed = speed;
  emit(true);
}

export function subscribeFast(f: () => void): () => void {
  fastSubs.add(f);
  return () => fastSubs.delete(f);
}

export function subscribeUI(f: () => void): () => void {
  uiSubs.add(f);
  return () => uiSubs.delete(f);
}

/** React hook: re-renders on throttled UI notifications and returns the live state. */
export function useSim(): SimState {
  useSyncExternalStore(subscribeUI, () => uiVersion, () => uiVersion);
  return state;
}

// ---------- helpers used by engine modules ----------
export function log(s: SimState, kind: EventKind, text: string): void {
  s.events.push({ id: s.seq++, t: s.clock, kind, text });
  if (s.events.length > 220) s.events.splice(0, s.events.length - 220);
}

export function raiseAlert(s: SimState, key: string, severity: Alert['severity'], text: string): void {
  if (s.alerts.some((a) => a.key === key && !a.acknowledged)) return;
  s.alerts.push({ id: s.seq++, t: s.clock, severity, text, acknowledged: false, key });
}

export function clearAlert(s: SimState, key: string): void {
  s.alerts = s.alerts.filter((a) => a.key !== key || a.acknowledged);
}

export function formatClock(t: number): string {
  const total = Math.floor(SIM_START_LABEL_SECONDS + t);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const SIM_SPEEDS = [15, 30, 60] as const;
export { SYSTEM };
