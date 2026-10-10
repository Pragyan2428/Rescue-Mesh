/**
 * Heavy-lift emergency quadcopter (metres): frame, arms, motors, rotors,
 * battery, landing gear, payload winch + medical crate, LiDAR and GPS.
 * Origin at the bottom of the landing skids.
 */
import * as THREE from 'three';
import { PALETTE, emissive, mesh, roundedBox, std, strut } from './materials';
import { createMedicalPayload } from './MedicalPayload';

export function createDrone(opts: { detail?: 'high' | 'low' } = {}) {
  const high = opts.detail !== 'low';
  const group = new THREE.Group();
  group.name = 'Drone';
  const body = new THREE.Group();
  group.add(body);
  const carbon = std(0x22272d, 0.45, 0.4);
  const shellMat = std(0xe8ecef, 0.38, 0.2);
  const motorMat = std(0x30363d, 0.35, 0.8);
  const accent = std(PALETTE.amber, 0.5, 0.1);
  const H = 0.42; // body height above skids
  // hub
  body.add(mesh(roundedBox(0.56, 0.16, 0.56, 0.06, high ? 3 : 1), shellMat, [0, H, 0]));
  body.add(mesh(new THREE.BoxGeometry(0.34, 0.08, 0.22), std(PALETTE.battery, 0.5, 0.3), [0, H + 0.12, 0])); // battery
  body.add(mesh(new THREE.BoxGeometry(0.58, 0.02, 0.06), accent, [0, H + 0.085, 0.2]));
  // arms + motors + rotors
  const rotors: THREE.Group[] = [];
  const armR = 0.78;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const end = new THREE.Vector3(Math.cos(a) * armR, H + 0.03, Math.sin(a) * armR);
    body.add(strut(new THREE.Vector3(0, H, 0), end, 0.028, carbon, 8));
    body.add(mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.09, 14), motorMat, [end.x, end.y + 0.05, end.z]));
    const rotor = new THREE.Group();
    rotor.position.set(end.x, end.y + 0.11, end.z);
    const bladeMat = std(0x101215, 0.4, 0.2);
    for (let b = 0; b < 2; b++) {
      const blade = mesh(new THREE.BoxGeometry(0.62, 0.006, 0.05), bladeMat, [0, 0, 0], [0.08, (b * Math.PI) / 2 + 0.3, 0]);
      rotor.add(blade);
    }
    // motion disc (visible when spinning)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshBasicMaterial({ color: 0xc8d4dc, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    disc.userData.dynamic = true;
    rotor.add(disc);
    rotor.userData.disc = disc;
    rotor.userData.dir = i % 2 ? 1 : -1;
    rotors.push(rotor);
    body.add(rotor);
    // nav lights: red port, green starboard
    const nav = mesh(new THREE.SphereGeometry(0.025, 8, 6), emissive(end.x < 0 ? 0xff4d4d : 0x5dff8a, 2.5), [end.x * 1.06, end.y - 0.02, end.z * 1.06]);
    nav.userData.dynamic = true;
    body.add(nav);
  }
  // landing gear skids
  for (const x of [-0.24, 0.24]) {
    body.add(strut(new THREE.Vector3(x, 0.02, -0.28), new THREE.Vector3(x, 0.02, 0.28), 0.018, carbon));
    body.add(strut(new THREE.Vector3(x, 0.02, 0.18), new THREE.Vector3(x * 0.6, H - 0.06, 0.12), 0.015, carbon));
    body.add(strut(new THREE.Vector3(x, 0.02, -0.18), new THREE.Vector3(x * 0.6, H - 0.06, -0.12), 0.015, carbon));
  }
  // sensors: LiDAR puck front, GPS mast
  body.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 14), std(0x0f1113, 0.3, 0.6), [0, H - 0.03, 0.3]));
  body.add(strut(new THREE.Vector3(-0.15, H + 0.1, -0.15), new THREE.Vector3(-0.15, H + 0.3, -0.15), 0.008, carbon));
  body.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.025, 12), shellMat, [-0.15, H + 0.31, -0.15]));
  // winch + payload
  body.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), motorMat, [0, H - 0.1, 0], [0, 0, Math.PI / 2]));
  const payload = createMedicalPayload(0.36, 0.22, 0.3);
  payload.position.set(0, H - 0.27, 0);
  body.add(payload);
  const tetherGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, H - 0.12, 0), new THREE.Vector3(0, H - 0.16, 0)]);
  const tether = new THREE.Line(tetherGeo, new THREE.LineBasicMaterial({ color: 0xffd9a8 }));
  body.add(tether);
  const payloadHome = payload.position.y;

  let spin = 0;
  return {
    group,
    body,
    payload,
    /** throttle 0..1 sets rotor speed; bank/pitch in radians */
    update(dt: number, o: { throttle: number; bank: number; pitch: number; release: number; hasPayload: boolean }) {
      spin += (o.throttle - spin) * Math.min(1, dt * 3);
      for (const r of rotors) {
        r.rotation.y += r.userData.dir * spin * 60 * dt;
        const disc = r.userData.disc as THREE.Mesh;
        (disc.material as THREE.MeshBasicMaterial).opacity = spin * 0.22;
        for (const c of r.children) if (c !== disc) c.visible = spin < 0.6;
      }
      body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, -o.bank, Math.min(1, dt * 3));
      body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, o.pitch, Math.min(1, dt * 3));
      // payload lowered on tether during release, detached at the end
      payload.visible = o.hasPayload || (o.release > 0 && o.release < 0.98);
      const drop = o.release > 0 ? Math.min(1, o.release / 0.8) * 3.2 : 0;
      payload.position.y = payloadHome - drop;
      tether.visible = o.release > 0 && o.release < 0.98;
      (tetherGeo.attributes.position as THREE.BufferAttribute).setY(1, payloadHome - drop + 0.12);
      tetherGeo.attributes.position.needsUpdate = true;
    },
  };
}

export type DroneApi = ReturnType<typeof createDrone>;
