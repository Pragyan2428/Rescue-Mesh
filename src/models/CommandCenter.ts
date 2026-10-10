import * as THREE from 'three';
import { PALETTE, emissive, mesh, std, strut } from './materials';

/** Emergency command center at the road-head: cabins, vehicle, tent, dish. */
export function createCommandCenter() {
  const g = new THREE.Group();
  const cabin = std(0xd7d2c4, 0.6, 0.1);
  const roof = std(0x6b6f72, 0.5, 0.4);
  g.add(mesh(new THREE.BoxGeometry(6, 2.6, 2.4), cabin, [0, 1.3, 0]));
  g.add(mesh(new THREE.BoxGeometry(6.2, 0.15, 2.6), roof, [0, 2.65, 0]));
  g.add(mesh(new THREE.BoxGeometry(6, 2.6, 2.4), cabin, [0.5, 1.3, 3.2]));
  g.add(mesh(new THREE.BoxGeometry(6.2, 0.15, 2.6), roof, [0.5, 2.65, 3.2]));
  for (let i = 0; i < 4; i++) {
    const w = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.02), emissive(0xffd08a, 1.4), [-2.2 + i * 1.4, 1.7, 1.21]);
    w.userData.dynamic = true;
    g.add(w);
  }
  // tent
  const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 2.2, 2.2, 4, 1), std(0x5a7a5a, 0.85, 0));
  tent.position.set(-5, 1.1, 2);
  tent.rotation.y = Math.PI / 4;
  tent.castShadow = true;
  g.add(tent);
  // vehicle
  g.add(mesh(new THREE.BoxGeometry(2, 1.6, 4.6), std(0xe9e6df, 0.5, 0.2), [5, 1.2, 1.5]));
  g.add(mesh(new THREE.BoxGeometry(2.02, 0.25, 4.62), std(PALETTE.coral, 0.6, 0.1), [5, 1.3, 1.5]));
  for (const z of [0.2, 2.8]) for (const x of [4.1, 5.9]) g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), std(0x151515, 0.8, 0), [x, 0.4, z], [0, 0, Math.PI / 2]));
  // backhaul dish + mast
  g.add(strut(new THREE.Vector3(-2.6, 2.7, -0.6), new THREE.Vector3(-2.6, 7.5, -0.6), 0.08, std(PALETTE.steel, 0.4, 0.6)));
  const dish = mesh(new THREE.SphereGeometry(0.9, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), std(PALETTE.white, 0.4, 0.1, { side: THREE.DoubleSide }), [-2.6, 6.8, -0.2], [1.2, 0, 0.3]);
  g.add(dish);
  const beacon = mesh(new THREE.SphereGeometry(0.2, 10, 8), emissive(PALETTE.cyan, 2), [-2.6, 7.7, -0.6]);
  beacon.userData.dynamic = true;
  g.add(beacon);
  return { group: g, beacon };
}
