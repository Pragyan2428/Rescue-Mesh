import * as THREE from 'three';
import { PALETTE, mesh, std } from './materials';

/** Medical supply crate (generic green-cross marking) with latch and handle. */
export function createMedicalPayload(w = 0.45, h = 0.3, d = 0.36) {
  const group = new THREE.Group();
  const shell = std(PALETTE.white, 0.55, 0.05);
  const band = std(PALETTE.medicalGreen, 0.5, 0.05);
  group.add(mesh(new THREE.BoxGeometry(w, h, d), shell, [0, 0, 0]));
  group.add(mesh(new THREE.BoxGeometry(w + 0.01, h * 0.16, d + 0.01), band, [0, h * 0.18, 0]));
  // crosses on both long sides
  for (const s of [1, -1]) {
    group.add(mesh(new THREE.BoxGeometry(0.12, 0.035, 0.005), band, [0, -0.02, (s * (d + 0.006)) / 2]));
    group.add(mesh(new THREE.BoxGeometry(0.035, 0.12, 0.005), band, [0, -0.02, (s * (d + 0.006)) / 2]));
  }
  group.add(mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), std(PALETTE.darkSteel, 0.5, 0.6), [0, h / 2, 0]));
  return group;
}
