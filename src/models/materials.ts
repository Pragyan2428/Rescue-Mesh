import * as THREE from 'three';

/** Shared material palette. Models clone what they need to highlight per part. */
export const PALETTE = {
  steel: 0x8d98a3,
  darkSteel: 0x3b4650,
  enclosure: 0xc9ced2,
  enclosureDark: 0x58636d,
  insulation: 0xb7ab92,
  concrete: 0x6d6e6a,
  copper: 0xd08a4c,
  solar: 0x0f2740,
  panelFrame: 0xa9b3bb,
  safetyYellow: 0xe6b422,
  amber: 0xff9e43,
  cyan: 0x61e6e0,
  coral: 0xff6b5e,
  white: 0xeef2f4,
  rubber: 0x1b1e21,
  medicalGreen: 0x2fae6b,
  battery: 0x2f6f8f,
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function std(color: number, roughness = 0.6, metalness = 0.2, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    cache.set(key, m);
  }
  return m;
}

export function emissive(color: number, intensity = 1.5): THREE.MeshStandardMaterial {
  return std(color, 0.4, 0, { emissive: new THREE.Color(color), emissiveIntensity: intensity });
}

export function glowBasic(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });
}

/** Mesh helper with shadows. */
export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, pos?: [number, number, number], rot?: [number, number, number], shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

/** Cylinder between two points (struts, cables, braces). */
export function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, radial = 6): THREE.Mesh {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, radial);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

/** Rounded box via extruded rounded rectangle with bevel. */
export function roundedBox(w: number, h: number, d: number, r: number, segs = 4): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const x = -w / 2 + r;
  const y = -h / 2 + r;
  const iw = w - 2 * r;
  const ih = h - 2 * r;
  shape.moveTo(x, y - r);
  shape.lineTo(x + iw, y - r);
  shape.quadraticCurveTo(x + iw + r, y - r, x + iw + r, y);
  shape.lineTo(x + iw + r, y + ih);
  shape.quadraticCurveTo(x + iw + r, y + ih + r, x + iw, y + ih + r);
  shape.lineTo(x, y + ih + r);
  shape.quadraticCurveTo(x - r, y + ih + r, x - r, y + ih);
  shape.lineTo(x - r, y);
  shape.quadraticCurveTo(x - r, y - r, x, y - r);
  const depth = Math.max(0.001, d - 2 * r * 0.6);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: r * 0.6, bevelThickness: r * 0.6, bevelSegments: segs, curveSegments: segs * 2 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
