import type { CommLink, NodeId, SimState } from './types';
import { STATION_BY_ID, DOCK_IDS } from '../data/demoStations';

export const ALL_NODES: NodeId[] = ['CC', 'G', 'S1', 'S2', 'S2b', 'S3'];

export function linkId(a: NodeId, b: NodeId): string {
  return [a, b].sort().join('~');
}

export function linkUsable(s: SimState, l: CommLink): boolean {
  return l.up && s.stations[l.a].online && s.stations[l.b].online;
}

export function commNeighbors(s: SimState, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  for (const l of s.links) {
    if (!linkUsable(s, l)) continue;
    if (l.a === id) out.push(l.b);
    else if (l.b === id) out.push(l.a);
  }
  return out;
}

/** Shortest hop-count path over usable radio links, or null when unreachable. */
export function commPath(s: SimState, from: NodeId, to: NodeId): NodeId[] | null {
  if (!s.stations[from].online || !s.stations[to].online) return null;
  if (from === to) return [from];
  const prev = new Map<NodeId, NodeId>();
  const seen = new Set<NodeId>([from]);
  const q: NodeId[] = [from];
  while (q.length) {
    const n = q.shift()!;
    // deterministic order
    const nbrs = commNeighbors(s, n).sort();
    for (const m of nbrs) {
      if (seen.has(m)) continue;
      seen.add(m);
      prev.set(m, n);
      if (m === to) {
        const path: NodeId[] = [to];
        let c: NodeId = to;
        while (prev.has(c)) {
          c = prev.get(c)!;
          path.unshift(c);
        }
        return path;
      }
      q.push(m);
    }
  }
  return null;
}

export function reachableSet(s: SimState, from: NodeId): Set<NodeId> {
  const seen = new Set<NodeId>();
  if (!s.stations[from].online) return seen;
  seen.add(from);
  const q: NodeId[] = [from];
  while (q.length) {
    const n = q.shift()!;
    for (const m of commNeighbors(s, n)) {
      if (!seen.has(m)) {
        seen.add(m);
        q.push(m);
      }
    }
  }
  return seen;
}

export function straightKm(a: NodeId, b: NodeId): number {
  const A = STATION_BY_ID[a];
  const B = STATION_BY_ID[b];
  return Math.hypot(A.x - B.x, A.z - B.z);
}

/** Candidate physical flight edges between docks (pairs within 11 km). */
export const FLIGHT_EDGES: [NodeId, NodeId][] = (() => {
  const out: [NodeId, NodeId][] = [];
  for (let i = 0; i < DOCK_IDS.length; i++)
    for (let j = i + 1; j < DOCK_IDS.length; j++) {
      const a = DOCK_IDS[i];
      const b = DOCK_IDS[j];
      if (straightKm(a, b) <= 11) out.push([a, b]);
    }
  return out;
})();
