import type { NodeId } from '../simulation/types';

export interface StationSpec {
  id: NodeId;
  name: string;
  kind: 'command' | 'gateway' | 'station';
  /** km, x east, z south. Blackout centre is (0,0). */
  x: number;
  z: number;
  role: string;
  initialBatteryPct: number;
  windKmh: number;
  tempC: number;
}

/**
 * Illustrative corridor layout. Gateway sits at the road-head on the edge of
 * the 15 km blackout (assumption A3). S1-S3 are ~5 km apart (A2). S2b is a
 * configured alternate dock. Positions are conceptual, not surveyed sites.
 */
export const STATIONS: StationSpec[] = [
  { id: 'CC', name: 'Command Center', kind: 'command', x: -16.6, z: 1.3, role: 'Emergency command center outside the blackout', initialBatteryPct: 100, windKmh: 14, tempC: 9 },
  { id: 'G', name: 'Gateway', kind: 'gateway', x: -15, z: 0, role: 'Road-head gateway and relay, edge of the blackout', initialBatteryPct: 92, windKmh: 18, tempC: 7 },
  { id: 'S1', name: 'Station S1', kind: 'station', x: -10.2, z: 0.5, role: 'Corridor dock ~5 km in', initialBatteryPct: 88, windKmh: 22, tempC: 5 },
  { id: 'S2', name: 'Station S2', kind: 'station', x: -5.4, z: -0.2, role: 'Corridor dock ~10 km in', initialBatteryPct: 41, windKmh: 24, tempC: 3 },
  { id: 'S2b', name: 'Station S2b', kind: 'station', x: -5.3, z: 2.4, role: 'Alternate dock in the sheltered side valley', initialBatteryPct: 80, windKmh: 16, tempC: 3 },
  { id: 'S3', name: 'Station S3', kind: 'station', x: -0.6, z: 0.3, role: 'Forward dock at the incident zone ~15 km in', initialBatteryPct: 76, windKmh: 22, tempC: 1 },
];

export const STATION_BY_ID: Record<NodeId, StationSpec> = Object.fromEntries(STATIONS.map((s) => [s.id, s])) as Record<NodeId, StationSpec>;

/** Docks that drones can land on. */
export const DOCK_IDS: NodeId[] = ['G', 'S1', 'S2', 'S2b', 'S3'];

/** Mesh radio links (communication graph). CC–G is the wired/backhaul link at the road-head. */
export const COMM_LINKS: { a: NodeId; b: NodeId; kind: 'lora' | 'backhaul' }[] = [
  { a: 'CC', b: 'G', kind: 'backhaul' },
  { a: 'G', b: 'S1', kind: 'lora' },
  { a: 'S1', b: 'S2', kind: 'lora' },
  { a: 'S2', b: 'S3', kind: 'lora' },
  { a: 'S1', b: 'S2b', kind: 'lora' },
  { a: 'S2b', b: 'S3', kind: 'lora' },
  { a: 'S2', b: 'S2b', kind: 'lora' },
];

/** Casualty / drop point near S3 (km). */
export const INCIDENT = { x: 0.35, z: 1.05, label: 'Casualty zone' };

/** Road-washout and landslide zone used by the "block terrain corridor" scenario (km). */
export const LANDSLIDE_ZONE = { x: -3.0, z: 0.05, r: 1.3 };

/** Conceptual full-area layout: ~11 stations (707 km² / ~65 km² each). Illustrative only. */
export const FULL_AREA_STATIONS: { x: number; z: number }[] = (() => {
  const pts: { x: number; z: number }[] = [{ x: 0, z: 0 }];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    pts.push({ x: Math.cos(a) * 6.6, z: Math.sin(a) * 6.6 });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * 11.6, z: Math.sin(a) * 11.6 });
  }
  return pts;
})();
