import * as THREE from 'three';
import { PALETTE, mesh, std, strut } from './materials';

/**
 * Redundant anchor assembly: splayed legs from a base frame corner to a ground
 * plate with rock bolts / micropiles driven below grade.
 */
export function createAnchor(top: THREE.Vector3, foot: THREE.Vector3) {
  const group = new THREE.Group();
  const steel = std(PALETTE.darkSteel, 0.5, 0.6);
  const plate = std(0x6a737b, 0.55, 0.5);
  const bolt = std(PALETTE.safetyYellow, 0.5, 0.3);
  group.add(strut(top, foot, 0.06, steel, 8));
  const p = mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), plate, [foot.x, foot.y + 0.025, foot.z]);
  group.add(p);
  for (const [dx, dz] of [
    [0.14, 0.14],
    [-0.14, 0.14],
    [0.14, -0.14],
    [-0.14, -0.14],
  ]) {
    group.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 6), bolt, [foot.x + dx, foot.y + 0.07, foot.z + dz]));
    // below-grade micropile (visible in cutaway / exploded view)
    group.add(strut(new THREE.Vector3(foot.x + dx, foot.y, foot.z + dz), new THREE.Vector3(foot.x + dx * 1.6, foot.y - 1.2, foot.z + dz * 1.6), 0.018, std(0x8a8f93, 0.6, 0.5), 5));
  }
  return group;
}
