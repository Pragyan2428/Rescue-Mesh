import * as THREE from 'three';
import { PALETTE, emissive, mesh, std } from './materials';

/** Compact relay node / beacon used for the conceptual full-area layout. */
export function createNetworkNode(scale = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.4, 8), std(PALETTE.enclosureDark, 0.6, 0.3), [0, 0.2, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), std(PALETTE.steel, 0.4, 0.6), [0, 1.2, 0]));
  const tip = mesh(new THREE.SphereGeometry(0.16, 10, 8), emissive(PALETTE.cyan, 2.2), [0, 2.15, 0]);
  tip.userData.dynamic = true;
  g.add(tip);
  g.scale.setScalar(scale);
  return { group: g, tip };
}

/** Expanding ring pulse for signal transmission / SOS propagation. */
export function createPulseRing(color: number) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 48), mat);
  ring.rotation.x = -Math.PI / 2;
  return {
    mesh: ring,
    /** phase 0..1 */
    set(phase: number, maxR: number) {
      ring.scale.setScalar(0.2 + phase * maxR);
      mat.opacity = (1 - phase) * 0.8;
    },
  };
}
