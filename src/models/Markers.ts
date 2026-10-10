import * as THREE from 'three';
import { PALETTE, emissive, mesh, std, strut } from './materials';

/** Incident / casualty marker: beacon column, ground ring, small tents. */
export function createIncidentMarker() {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.coral, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.85, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  const pulseMat = ringMat.clone();
  const pulse = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.75, 48), pulseMat);
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 0.06;
  g.add(pulse);
  const colMat = new THREE.MeshBasicMaterial({ color: PALETTE.coral, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 8, 1, true), colMat);
  column.position.y = 3;
  g.add(column);
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.6, 4), std(i === 1 ? 0xe5a33b : 0x3f6e8c, 0.8, 0));
    t.position.set(Math.cos(i * 2.1) * 0.9, 0.3, Math.sin(i * 2.1) * 0.9);
    t.rotation.y = i;
    t.castShadow = true;
    g.add(t);
  }
  const head = mesh(new THREE.OctahedronGeometry(0.35), emissive(PALETTE.coral, 2), [0, 6.3, 0]);
  head.userData.dynamic = true;
  g.add(head);
  return {
    group: g,
    update(t: number, active: number) {
      g.visible = active > 0.01;
      const ph = (t * 0.6) % 1;
      pulse.scale.setScalar(1 + ph * 2.5);
      pulseMat.opacity = (1 - ph) * 0.6 * active;
      ringMat.opacity = 0.6 * active;
      colMat.opacity = 0.35 * active;
      head.rotation.y = t;
      head.position.y = 6.3 + Math.sin(t * 2) * 0.2;
    },
  };
}

/** Terrain / landslide warning marker: triangular sign on a post. */
export function createWarningMarker() {
  const g = new THREE.Group();
  g.add(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.2, 0), 0.06, std(PALETTE.steel, 0.4, 0.6)));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.9);
  shape.lineTo(0.8, -0.45);
  shape.lineTo(-0.8, -0.45);
  shape.closePath();
  const sign = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }), std(PALETTE.safetyYellow, 0.5, 0.1, { emissive: new THREE.Color(PALETTE.safetyYellow), emissiveIntensity: 0.25 }));
  sign.position.y = 2.6;
  g.add(sign);
  const bar = mesh(new THREE.BoxGeometry(0.12, 0.5, 0.06), std(0x111111, 0.6, 0), [0, 2.7, 0.03]);
  g.add(bar);
  return g;
}

/** Cellular tower (conventional infrastructure) that can fail. */
export function createCellTower() {
  const g = new THREE.Group();
  const steel = std(0x9aa3ab, 0.45, 0.6);
  const H = 9;
  const legs = [
    [0.9, 0.9],
    [-0.9, 0.9],
    [0, -1.1],
  ];
  for (const [x, z] of legs) g.add(strut(new THREE.Vector3(x, 0, z), new THREE.Vector3(x * 0.2, H, z * 0.2), 0.07, steel));
  for (let y = 1.5; y < H; y += 1.6) {
    const s = 1 - (y / H) * 0.8;
    for (let i = 0; i < 3; i++) {
      const a = legs[i];
      const b = legs[(i + 1) % 3];
      g.add(strut(new THREE.Vector3(a[0] * s, y, a[1] * s), new THREE.Vector3(b[0] * s, y, b[1] * s), 0.035, steel));
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(mesh(new THREE.BoxGeometry(0.3, 1.1, 0.12), std(0xe7ebee, 0.5, 0.1), [Math.cos(a) * 0.45, H - 0.6, Math.sin(a) * 0.45], [0, -a, 0]));
  }
  const lamp = mesh(new THREE.SphereGeometry(0.18, 8, 6), emissive(0x7bd88f, 2), [0, H + 0.2, 0]);
  lamp.userData.dynamic = true;
  g.add(lamp);
  return {
    group: g,
    setFailed(f: number) {
      lamp.material = emissive(f > 0.5 ? PALETTE.coral : 0x7bd88f, f > 0.5 ? 1.2 + Math.random() * 0.8 : 2);
      g.rotation.z = f * 0.22;
    },
  };
}
