/**
 * Failure overlay: landslide warning markers, failed-station markers and the
 * blocked flight segment. Reads the shared simulation state.
 */
import * as THREE from 'three';
import { WORLD } from '../data/systemConstants';
import { LANDSLIDE_ZONE } from '../data/demoStations';
import { createWarningMarker } from '../models/Markers';
import { createFlowTube } from '../models/FlightRibbon';
import { PALETTE } from '../models/materials';
import { groundY } from '../utils/terrainField';
import { nodeWorld } from './NetworkScene';
import type { NodeId, SimState } from '../simulation/types';

const U = WORLD.unitsPerKm;

export function createFailureOverlay() {
  const group = new THREE.Group();
  const signs: THREE.Group[] = [];
  for (const [dx, dz] of [
    [-0.8, -0.5],
    [0.9, 0.4],
  ]) {
    const w = createWarningMarker();
    const x = LANDSLIDE_ZONE.x + dx;
    const z = LANDSLIDE_ZONE.z + dz;
    w.position.set(x * U, groundY(x, z), z * U);
    w.scale.setScalar(0.9);
    group.add(w);
    signs.push(w);
  }
  const xMat = new THREE.MeshBasicMaterial({ color: PALETTE.coral, toneMapped: false });
  const markers = new Map<NodeId, THREE.Group>();
  for (const id of ['G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(3, 0.35, 0.35), xMat);
    const b = a.clone();
    a.rotation.z = Math.PI / 4;
    b.rotation.z = -Math.PI / 4;
    g.add(a, b);
    g.position.copy(nodeWorld(id, 4.2));
    g.visible = false;
    group.add(g);
    markers.set(id, g);
  }
  const blocked = createFlowTube([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)], { color: PALETTE.coral, radius: 0.14, dash: 0.03, speed: 0, opacity: 0.85 });
  blocked.mesh.visible = false;
  group.add(blocked.mesh);
  let blockedKey = '';

  return {
    group,
    update(s: SimState, t: number, terrainUniform?: { value: number }) {
      const on = s.conditions.corridorBlocked;
      signs.forEach((g) => (g.visible = on));
      if (terrainUniform) terrainUniform.value += ((on ? 1 : 0) - terrainUniform.value) * 0.1;
      for (const [id, g] of markers) {
        g.visible = !s.stations[id].online;
        g.rotation.y = t * 0.8;
      }
      // blocked segment: hops of the previous plan that the current plan no longer uses
      const prev = s.previousPlan;
      const cur = s.plan;
      let key = '';
      let pts: THREE.Vector3[] = [];
      if (prev && prev.feasible) {
        for (const h of prev.hops) {
          const usedNow = cur?.hops.some((c) => c.from === h.from && c.to === h.to);
          const bad = !s.stations[h.to].online || !s.stations[h.from].online || (on && h.path.some((p) => Math.hypot(p.x - LANDSLIDE_ZONE.x, p.z - LANDSLIDE_ZONE.z) < LANDSLIDE_ZONE.r));
          if (!usedNow && bad) {
            key += `${h.from}>${h.to};`;
            pts = h.profile.map((p) => new THREE.Vector3(p.x, p.y + 0.1, p.z));
          }
        }
      }
      if (key !== blockedKey) {
        blockedKey = key;
        if (pts.length > 1) blocked.setPoints(pts);
        blocked.mesh.visible = pts.length > 1;
      }
      blocked.update(t);
    },
    dispose() {
      blocked.dispose();
      xMat.dispose();
    },
  };
}
