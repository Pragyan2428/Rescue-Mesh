/**
 * Every user action that changes the operational picture goes through here,
 * so the mesh, route planner, missions, 3D scenes and dashboard stay in sync.
 */
import { SYSTEM } from '../data/systemConstants';
import { MISSION_PRESETS } from '../data/demoMissions';
import { mutate, log, raiseAlert, clearAlert, resetSim } from './store';
import { linkId } from './networkGraph';
import { createMission, wakeMissions } from './missionEngine';
import { queueTrafficBurst, sendSOS } from './meshEngine';
import type { NodeId } from './types';

export function disableStation(id: NodeId): void {
  mutate((s) => {
    const st = s.stations[id];
    if (!st.online) return;
    st.online = false;
    st.faults = ['Station offline'];
    const dependent = s.links.filter((l) => l.a === id || l.b === id).map((l) => `${l.a}–${l.b}`);
    log(s, 'fail', `Station failure: ${id} offline. Dependent links disabled: ${dependent.join(', ')}`);
    log(s, 'route', 'Route-planning event: dock graph and mesh routes recomputed');
    raiseAlert(s, `station-${id}`, 'critical', `${id} offline`);
    wakeMissions(s);
  });
}

export function restoreStation(id: NodeId): void {
  mutate((s) => {
    const st = s.stations[id];
    if (st.online) return;
    st.online = true;
    st.faults = [];
    log(s, 'ok', `${id} restored. Links and dock available again`);
    clearAlert(s, `station-${id}`);
    wakeMissions(s);
  });
}

export function setLink(a: NodeId, b: NodeId, up: boolean, recoverAfter?: number): void {
  mutate((s) => {
    const l = s.links.find((x) => x.id === linkId(a, b));
    if (!l) return;
    l.up = up;
    l.recoverAt = !up && recoverAfter ? s.clock + recoverAfter : null;
    if (up) {
      log(s, 'ok', `Link ${a}–${b} restored`);
      clearAlert(s, `link-${l.id}`);
    } else {
      log(s, 'fail', `Link lost: ${a}–${b}${recoverAfter ? ` (recovery expected in ~${Math.round(recoverAfter / 60)} min)` : ''}`);
      raiseAlert(s, `link-${l.id}`, 'warning', `Link ${a}–${b} down`);
    }
    wakeMissions(s);
  });
}

/** Mesh demo: isolate S3 by cutting its radio links; one recovers after a delay. */
export function isolateS3WithDelayedRecovery(): void {
  mutate((s) => {
    for (const l of s.links) {
      if (l.a === 'S3' || l.b === 'S3') {
        l.up = false;
        l.recoverAt = l.id === linkId('S2b', 'S3') ? s.clock + SYSTEM.linkRecoverySeconds : null;
        raiseAlert(s, `link-${l.id}`, 'warning', `Link ${l.a}–${l.b} down`);
      }
    }
    log(s, 'fail', `S3 radio links down (S2–S3, S2b–S3). S2b–S3 recovery expected in ~${Math.round(SYSTEM.linkRecoverySeconds / 60)} min`);
  });
}

export function setHighWind(on: boolean): void {
  mutate((s) => {
    if (s.conditions.highWind === on) return;
    s.conditions.highWind = on;
    if (on) {
      log(s, 'warn', `High wind: gusts above 60 km/h across the corridor, over the ${SYSTEM.droneWindLimitKmh} km/h drone limit. Turbines furl, drones hold or divert`);
      raiseAlert(s, 'wind', 'warning', 'High wind across corridor');
    } else {
      log(s, 'ok', 'Wind back within limits. Weather window open');
      clearAlert(s, 'wind');
      clearAlert(s, 'weather-hold');
    }
    wakeMissions(s);
  });
}

export function setCorridorBlocked(on: boolean): void {
  mutate((s) => {
    if (s.conditions.corridorBlocked === on) return;
    s.conditions.corridorBlocked = on;
    if (on) {
      s.stations.S2.tiltOk = false;
      log(s, 'fail', 'Landslide: tilt alert marks the S2–S3 valley corridor unsafe. Terrain cells blocked for routing');
      raiseAlert(s, 'corridor', 'critical', 'Terrain corridor S2–S3 blocked');
    } else {
      s.stations.S2.tiltOk = true;
      log(s, 'ok', 'Terrain corridor cleared');
      clearAlert(s, 'corridor');
    }
    wakeMissions(s);
  });
}

export function reduceDroneBattery(droneId?: string): void {
  mutate((s) => {
    const m = s.missions.find((x) => x.id === s.activeMissionId);
    const d = s.drones.find((x) => x.id === (droneId ?? m?.droneId ?? 'D1'));
    if (!d) return;
    const before = Math.round(d.batteryPct);
    d.batteryPct = Math.min(d.batteryPct, 32);
    if (d.flight) d.flight.startBattery = d.batteryPct + d.flight.energyPct * (d.flight.s / d.flight.total);
    if (d.state === 'charging') d.state = 'docked';
    log(s, 'warn', `${d.id} battery fault injected: ${before}% → ${Math.round(d.batteryPct)}%`);
    raiseAlert(s, `batt-${d.id}`, 'warning', `${d.id} low battery`);
    wakeMissions(s);
  });
}

export function setStoreForward(on: boolean): void {
  mutate((s) => {
    s.conditions.storeForward = on;
    log(s, 'info', `Store-and-forward ${on ? 'enabled' : 'disabled'}`);
  });
}

export function setDataMule(on: boolean): void {
  mutate((s) => {
    s.conditions.dataMule = on;
    log(s, 'info', `Drone data-mule ${on ? 'enabled' : 'disabled'}`);
  });
}

export function restoreNormal(): void {
  mutate((s) => {
    for (const id of Object.keys(s.stations) as NodeId[]) {
      s.stations[id].online = true;
      s.stations[id].faults = [];
      s.stations[id].tiltOk = true;
    }
    for (const l of s.links) {
      l.up = true;
      l.recoverAt = null;
    }
    s.conditions.highWind = false;
    s.conditions.corridorBlocked = false;
    s.alerts = s.alerts.filter((a) => a.acknowledged || a.key.startsWith('int-'));
    log(s, 'ok', 'Normal conditions restored: all stations and links up, wind within limits, corridor clear');
    wakeMissions(s);
  });
}

export function resetDemo(): void {
  resetSim();
}

export function startMission(presetId: string): void {
  const p = MISSION_PRESETS.find((x) => x.id === presetId) ?? MISSION_PRESETS[0];
  mutate((s) => {
    const busy = s.missions.find((m) => m.id === s.activeMissionId);
    if (busy && (busy.status === 'completed' || busy.status === 'interrupted')) s.activeMissionId = null;
    s.paused = false;
    createMission(s, p);
  });
}

export function sendSOSAction(origin: NodeId = 'S3'): void {
  mutate((s) => {
    sendSOS(s, origin, null);
  });
}

export function trafficBurst(): void {
  mutate((s) => queueTrafficBurst(s));
}

export function setPaused(p: boolean): void {
  mutate((s) => {
    s.paused = p;
  });
}

export function setSpeed(v: number): void {
  mutate((s) => {
    s.speed = v;
  });
}

export function selectStation(id: NodeId | null): void {
  mutate((s) => {
    s.selectedStation = id;
  });
}

export function setHighlight(key: string | null): void {
  mutate((s) => {
    s.highlight = key;
  });
}

export function acknowledgeAlert(id: number): void {
  mutate((s) => {
    const a = s.alerts.find((x) => x.id === id);
    if (a) a.acknowledged = true;
  });
}

export function acknowledgeAll(): void {
  mutate((s) => s.alerts.forEach((a) => (a.acknowledged = true)));
}
