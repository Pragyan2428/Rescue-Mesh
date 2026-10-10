/**
 * Two-level route planning (deck slide 8).
 * Level 1: Dijkstra over the dock graph with a battery/reserve constraint.
 * Level 2: A* over the terrain grid; cost = distance + climb + risk.
 * Replanning from the drone's current position models D* Lite-style behaviour
 * conceptually; it is a simplified re-search, not a full D* Lite implementation.
 * All numbers come from the illustrative energy model in systemConstants.
 */
import { SYSTEM, WORLD } from '../data/systemConstants';
import { STATION_BY_ID, DOCK_IDS, LANDSLIDE_ZONE } from '../data/demoStations';
import { elevationM, slopeAt, elevToY } from '../utils/terrainField';
import { FLIGHT_EDGES } from './networkGraph';
import type { EdgeEval, HopPlan, Km2, NodeId, RoutePlan, SimState, Vec3 } from './types';

// ---------------- energy model ----------------
export function payloadFactor(kg: number): number {
  return SYSTEM.emptyPayloadFactor + ((1 - SYSTEM.emptyPayloadFactor) * kg) / SYSTEM.payloadTargetKg;
}
export function windFactor(kmh: number): number {
  return 1 + kmh / SYSTEM.headwindDivisor;
}
/** Battery % per km of cruise. */
export function pctPerKm(payloadKg: number, windKmh: number): number {
  return (100 / SYSTEM.calmFullPayloadRangeKm) * payloadFactor(payloadKg) * SYSTEM.altitudeFactor * windFactor(windKmh);
}
export function hopEnergyPct(distanceKm: number, climbM: number, payloadKg: number, windKmh: number): number {
  return pctPerKm(payloadKg, windKmh) * distanceKm + (SYSTEM.climbPctPer100m * climbM) / 100;
}
/**
 * Radius rule: a hop is feasible when the drone could fly it and still return
 * to its origin with the 20% reserve (deck A1: radius = out and back).
 */
export function hopBudgetPct(departBattery = 100): number {
  return (departBattery - SYSTEM.batteryReservePct) / 2;
}
/** Max hop distance in km for given conditions, ignoring climb. */
export function maxHopKm(payloadKg: number, windKmh: number, departBattery = 100): number {
  return hopBudgetPct(departBattery) / pctPerKm(payloadKg, windKmh);
}

// ---------------- terrain A* ----------------
const CELL = 0.25; // km
const HALF = WORLD.terrainHalfKm - 0.5;
const NG = Math.round((HALF * 2) / CELL) + 1;
export const CEILING_M = 3900; // assumed max flight altitude (configurable)
const CLEARANCE = SYSTEM.flightClearanceM;

let cellElev: Float32Array | null = null;
let cellSlope: Float32Array | null = null;
function ensureCells() {
  if (cellElev) return;
  cellElev = new Float32Array(NG * NG);
  cellSlope = new Float32Array(NG * NG);
  for (let j = 0; j < NG; j++)
    for (let i = 0; i < NG; i++) {
      const x = -HALF + i * CELL;
      const z = -HALF + j * CELL;
      cellElev[j * NG + i] = elevationM(x, z);
      cellSlope[j * NG + i] = slopeAt(x, z);
    }
}
const toCell = (v: number) => Math.max(0, Math.min(NG - 1, Math.round((v + HALF) / CELL)));
const cellX = (i: number) => -HALF + i * CELL;

export function inLandslide(x: number, z: number, pad = 0): boolean {
  return Math.hypot(x - LANDSLIDE_ZONE.x, z - LANDSLIDE_ZONE.z) <= LANDSLIDE_ZONE.r + pad;
}

function passable(i: number, j: number, blocked: boolean): boolean {
  const e = cellElev![j * NG + i];
  if (e + CLEARANCE > CEILING_M) return false;
  if (blocked && inLandslide(cellX(i), cellX(j))) return false;
  return true;
}

function riskAt(i: number, j: number, blocked: boolean): number {
  const sl = cellSlope![j * NG + i];
  let r = sl > 0.75 ? 0.6 : sl > 0.5 ? 0.25 : 0;
  if (!blocked && inLandslide(cellX(i), cellX(j), 0.3)) r += 0.35;
  return r;
}

class MinHeap {
  private a: { k: number; v: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(v: number, k: number) {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.v;
  }
}

export interface TerrainPath {
  ok: boolean;
  path: Km2[];
  lengthKm: number;
  maxRisk: number;
  expanded: number;
}

const pathCache = new Map<string, TerrainPath>();

/** A* over the terrain grid between two km points. */
export function terrainAStar(a: Km2, b: Km2, blocked: boolean): TerrainPath {
  const key = `${a.x.toFixed(2)},${a.z.toFixed(2)}>${b.x.toFixed(2)},${b.z.toFixed(2)}|${blocked}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  ensureCells();
  const si = toCell(a.x),
    sj = toCell(a.z),
    ti = toCell(b.x),
    tj = toCell(b.z);
  const pad = 5 / CELL;
  const i0 = Math.max(0, Math.min(si, ti) - pad),
    i1 = Math.min(NG - 1, Math.max(si, ti) + pad);
  const j0 = Math.max(0, Math.min(sj, tj) - pad),
    j1 = Math.min(NG - 1, Math.max(sj, tj) + pad);
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const open = new MinHeap();
  const start = sj * NG + si;
  const goal = tj * NG + ti;
  g.set(start, 0);
  open.push(start, 0);
  const closed = new Set<number>();
  let expanded = 0;
  const h = (i: number, j: number) => Math.hypot(i - ti, j - tj) * CELL;
  while (open.size) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    expanded++;
    if (cur === goal) break;
    const ci = cur % NG;
    const cj = (cur - ci) / NG;
    const ce = cellElev![cur];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di,
          nj = cj + dj;
        if (ni < i0 || ni > i1 || nj < j0 || nj > j1) continue;
        const n = nj * NG + ni;
        if (closed.has(n)) continue;
        const isEnd = n === goal;
        if (!isEnd && !passable(ni, nj, blocked)) continue;
        const d = (di && dj ? Math.SQRT2 : 1) * CELL;
        const climb = Math.max(0, cellElev![n] - ce);
        const cost = (g.get(cur) ?? 0) + d * (1 + riskAt(ni, nj, blocked)) + (climb / 100) * 0.12;
        if (cost < (g.get(n) ?? Infinity)) {
          g.set(n, cost);
          came.set(n, cur);
          open.push(n, cost + h(ni, nj));
        }
      }
  }
  if (!came.has(goal) && start !== goal) {
    const res: TerrainPath = { ok: false, path: [], lengthKm: 0, maxRisk: 1, expanded };
    pathCache.set(key, res);
    return res;
  }
  const cells: number[] = [goal];
  let c = goal;
  while (came.has(c)) {
    c = came.get(c)!;
    cells.unshift(c);
  }
  let pts: Km2[] = cells.map((n) => ({ x: cellX(n % NG), z: cellX(Math.floor(n / NG)) }));
  pts[0] = { ...a };
  pts[pts.length - 1] = { ...b };
  pts = shortcut(pts, blocked);
  pts = chaikin(pts, 2);
  let len = 0;
  let maxRisk = 0;
  for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
  for (const p of pts) maxRisk = Math.max(maxRisk, riskAt(toCell(p.x), toCell(p.z), blocked));
  const res: TerrainPath = { ok: true, path: pts, lengthKm: len, maxRisk, expanded };
  pathCache.set(key, res);
  return res;
}

function segmentClear(p: Km2, q: Km2, blocked: boolean): boolean {
  const d = Math.hypot(q.x - p.x, q.z - p.z);
  const n = Math.max(2, Math.ceil(d / 0.1));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = p.x + (q.x - p.x) * t;
    const z = p.z + (q.z - p.z) * t;
    if (elevationM(x, z) + CLEARANCE > CEILING_M) return false;
    if (blocked && inLandslide(x, z, 0.15)) return false;
  }
  return true;
}

function shortcut(pts: Km2[], blocked: boolean): Km2[] {
  const out: Km2[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !segmentClear(pts[i], pts[j], blocked)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function chaikin(pts: Km2[], it: number): Km2[] {
  let p = pts;
  for (let k = 0; k < it; k++) {
    if (p.length < 3) return p;
    const o: Km2[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i],
        b = p[i + 1];
      o.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      o.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    o.push(p[p.length - 1]);
    p = o;
  }
  return p;
}

/** Build a cruise profile (world coords) that never dips below terrain + clearance. */
export function buildProfile(path: Km2[], startAltM?: number, endAltM?: number): { profile: Vec3[]; climbM: number } {
  const samples: Km2[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i],
      b = path[i + 1];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / 0.08));
    for (let k = 0; k < n; k++) samples.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  samples.push(path[path.length - 1]);
  const ground = samples.map((p) => elevationM(p.x, p.z));
  const W = 7;
  let alt = ground.map((_, i) => {
    let m = -Infinity;
    for (let k = Math.max(0, i - W); k <= Math.min(ground.length - 1, i + W); k++) m = Math.max(m, ground[k] + CLEARANCE);
    return m;
  });
  if (startAltM !== undefined) alt[0] = Math.max(alt[0], startAltM);
  if (endAltM !== undefined) alt[alt.length - 1] = Math.max(alt[alt.length - 1], endAltM);
  // smooth, then re-enforce clearance
  for (let pass = 0; pass < 3; pass++) {
    alt = alt.map((v, i) => {
      if (i === 0 || i === alt.length - 1) return v;
      return (alt[i - 1] + v * 2 + alt[i + 1]) / 4;
    });
    alt = alt.map((v, i) => Math.max(v, ground[i] + CLEARANCE * 0.8));
  }
  let climb = 0;
  for (let i = 1; i < alt.length; i++) climb += Math.max(0, alt[i] - alt[i - 1]);
  const U = WORLD.unitsPerKm;
  const profile = samples.map((p, i) => ({ x: p.x * U, y: elevToY(alt[i]), z: p.z * U }));
  return { profile, climbM: climb };
}

// ---------------- Level 1: dock graph ----------------
export function nodeKm(id: NodeId): Km2 {
  const s = STATION_BY_ID[id];
  return { x: s.x, z: s.z };
}

export interface HopEvalOptions {
  payloadKg: number;
  departBattery: number;
}

export function hopWind(s: SimState, a: NodeId, b: NodeId): number {
  return (s.stations[a].windKmh + s.stations[b].windKmh) / 2;
}

export function evaluateHop(s: SimState, a: NodeId, b: NodeId, opt: HopEvalOptions): { hop: HopPlan | null; ev: EdgeEval } {
  const A = nodeKm(a),
    B = nodeKm(b);
  const straight = Math.hypot(A.x - B.x, A.z - B.z);
  const base: EdgeEval = { from: a, to: b, distanceKm: straight, energyPct: 0, verdict: 'ok', detail: '' };
  if (!s.stations[a].online || !s.stations[b].online) {
    return { hop: null, ev: { ...base, verdict: 'offline', detail: `${!s.stations[a].online ? a : b} is offline` } };
  }
  const tp = terrainAStar(A, B, s.conditions.corridorBlocked);
  if (!tp.ok) return { hop: null, ev: { ...base, verdict: 'no-path', detail: 'No terrain path under the flight ceiling' } };
  const padA = elevationM(A.x, A.z) + CLEARANCE;
  const padB = elevationM(B.x, B.z) + CLEARANCE;
  const { profile, climbM } = buildProfile(tp.path, padA, padB);
  const wind = hopWind(s, a, b);
  const energy = hopEnergyPct(tp.lengthKm, climbM, opt.payloadKg, wind);
  const hop: HopPlan = {
    from: a,
    to: b,
    distanceKm: tp.lengthKm,
    climbM,
    windKmh: wind,
    energyPct: energy,
    departBattery: opt.departBattery,
    arriveBattery: opt.departBattery - energy,
    path: tp.path,
    profile,
    maxRisk: tp.maxRisk,
  };
  const ev: EdgeEval = { ...base, distanceKm: tp.lengthKm, energyPct: energy };
  const windMax = Math.max(s.stations[a].windKmh, s.stations[b].windKmh);
  if (windMax > SYSTEM.droneWindLimitKmh) return { hop, ev: { ...ev, verdict: 'weather', detail: `Wind ${Math.round(windMax)} km/h exceeds the ${SYSTEM.droneWindLimitKmh} km/h drone limit` } };
  if (energy > hopBudgetPct(opt.departBattery)) {
    return {
      hop,
      ev: { ...ev, verdict: 'energy', detail: `Needs ${energy.toFixed(0)}% one way; budget ${hopBudgetPct(opt.departBattery).toFixed(0)}% (return + ${SYSTEM.batteryReservePct}% reserve)` },
    };
  }
  return { hop, ev: { ...ev, verdict: 'ok', detail: `${energy.toFixed(0)}% of battery` } };
}

/** Docks recharge drones only when online and above the station's charging threshold. */
export function dockCanCharge(s: SimState, id: NodeId): boolean {
  const st = s.stations[id];
  return st.online && st.powerMode === 'normal';
}

/**
 * Dijkstra over docks. Label = (node, energy cost). Departure battery is 100%
 * at a charging dock, otherwise the battery left on arrival.
 */
export function planRoute(s: SimState, origin: NodeId, target: NodeId, payloadKg: number, startBattery: number): RoutePlan {
  const evaluated: EdgeEval[] = [];
  const dist = new Map<NodeId, number>();
  const battAt = new Map<NodeId, number>();
  const prev = new Map<NodeId, { from: NodeId; hop: HopPlan }>();
  const done = new Set<NodeId>();
  dist.set(origin, 0);
  battAt.set(origin, startBattery);
  const evalSeen = new Set<string>();
  for (;;) {
    let u: NodeId | null = null;
    let best = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < best) ((best = d), (u = n));
    if (!u) break;
    done.add(u);
    if (u === target) break;
    const depart = u === origin ? startBattery : dockCanCharge(s, u) ? 100 : battAt.get(u)!;
    for (const [a, b] of FLIGHT_EDGES) {
      if (a !== u && b !== u) continue;
      const v = a === u ? b : a;
      if (done.has(v)) continue;
      const { hop, ev } = evaluateHop(s, u, v, { payloadKg, departBattery: depart });
      const k = `${u}>${v}`;
      if (!evalSeen.has(k)) {
        evalSeen.add(k);
        evaluated.push(ev);
      }
      if (ev.verdict !== 'ok' || !hop) continue;
      const nd = best + hop.energyPct;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        battAt.set(v, depart - hop.energyPct);
        prev.set(v, { from: u, hop });
      }
    }
  }
  const base = { origin, target, payloadKg, evaluated, createdAt: s.clock };
  if (!prev.has(target) && origin !== target) {
    return { ...base, feasible: false, route: [origin], hops: [], totalKm: 0, totalEnergyPct: 0, reason: explainInfeasible(evaluated, s, payloadKg) };
  }
  const hops: HopPlan[] = [];
  let c: NodeId = target;
  while (prev.has(c)) {
    const p = prev.get(c)!;
    hops.unshift(p.hop);
    c = p.from;
  }
  const route: NodeId[] = [origin, ...hops.map((h) => h.to)];
  return {
    ...base,
    feasible: true,
    route,
    hops,
    totalKm: hops.reduce((a, h) => a + h.distanceKm, 0),
    totalEnergyPct: hops.reduce((a, h) => a + h.energyPct, 0),
    reason: `Feasible: ${route.join(' → ')}`,
  };
}

function explainInfeasible(ev: EdgeEval[], s: SimState, payloadKg: number): string {
  if (ev.some((e) => e.verdict === 'weather')) return `Weather hold: wind above the ${SYSTEM.droneWindLimitKmh} km/h drone limit. Waiting at a sheltered dock for a weather window.`;
  const energy = ev.filter((e) => e.verdict === 'energy');
  if (energy.length) {
    const e = energy.sort((x, y) => x.energyPct - y.energyPct)[0];
    return `No feasible route at ${payloadKg} kg: shortest open hop ${e.from}→${e.to} (${e.distanceKm.toFixed(1)} km) needs ${e.energyPct.toFixed(0)}%, above the ${hopBudgetPct(100).toFixed(0)}% hop budget with ${SYSTEM.batteryReservePct}% reserve.`;
  }
  const off = DOCK_IDS.filter((d) => !s.stations[d].online);
  if (off.length) return `No feasible route: ${off.join(', ')} offline and no alternate dock in range.`;
  return 'No feasible route under current constraints.';
}

/** World position helpers */
export function dockWorld(id: NodeId, lift = 0): Vec3 {
  const p = nodeKm(id);
  return { x: p.x * WORLD.unitsPerKm, y: elevToY(elevationM(p.x, p.z)) + lift, z: p.z * WORLD.unitsPerKm };
}

export function clearPathCache(): void {
  pathCache.clear();
}
