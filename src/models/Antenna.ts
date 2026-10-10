import * as THREE from 'three';
import { PALETTE, emissive, mesh, std, strut } from './materials';

/**
 * Communication mast: LoRa whip, directional 5.8 GHz dish, GPS puck,
 * anemometer + vane on top, and a fault/status beacon.
 */
export function createAntennaMast(height = 3.6) {
  const group = new THREE.Group();
  const steel = std(PALETTE.steel, 0.45, 0.6);
  const white = std(PALETTE.white, 0.5, 0.1);
  const dark = std(PALETTE.darkSteel, 0.5, 0.4);
  group.add(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, height, 0), 0.055, steel, 10));
  // lattice rungs
  for (let y = 0.4; y < height - 0.3; y += 0.45) group.add(mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 12), steel, [0, y, 0], [Math.PI / 2, 0, 0]));
  // LoRa whip
  const whip = strut(new THREE.Vector3(0.12, height - 0.2, 0), new THREE.Vector3(0.12, height + 1.1, 0), 0.016, white);
  group.add(whip);
  group.add(strut(new THREE.Vector3(0, height - 0.2, 0), new THREE.Vector3(0.12, height - 0.2, 0), 0.015, steel));
  // directional dish
  const dish = new THREE.Group();
  dish.position.set(0, height * 0.72, 0.12);
  const bowl = mesh(new THREE.SphereGeometry(0.32, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), white, [0, 0, 0], [Math.PI / 2, 0, 0]);
  bowl.material = std(PALETTE.white, 0.45, 0.1, { side: THREE.DoubleSide });
  dish.add(bowl);
  dish.add(strut(new THREE.Vector3(0, 0, 0.0), new THREE.Vector3(0, 0, 0.32), 0.01, dark));
  dish.rotation.y = 0.9;
  group.add(dish);
  // sector panel
  group.add(mesh(new THREE.BoxGeometry(0.14, 0.6, 0.06), white, [-0.12, height * 0.52, 0.04]));
  // GPS puck
  const gps = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 16), white, [0, height + 0.03, 0]);
  group.add(gps);
  // anemometer
  const anemo = new THREE.Group();
  anemo.position.set(-0.22, height - 0.05, 0);
  group.add(strut(new THREE.Vector3(0, height - 0.15, 0), new THREE.Vector3(-0.22, height - 0.15, 0), 0.012, steel));
  anemo.add(strut(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0, 0.1, 0), 0.01, steel));
  const cups = new THREE.Group();
  cups.position.y = 0.12;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    cups.add(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12), 0.006, steel));
    cups.add(mesh(new THREE.SphereGeometry(0.03, 8, 6, 0, Math.PI), white, [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], [0, -a, 0]));
  }
  anemo.add(cups);
  group.add(anemo);
  // beacon
  const beaconMat = emissive(0x7bd88f, 2.2);
  const beacon = mesh(new THREE.SphereGeometry(0.06, 12, 8), beaconMat, [0, height + 0.14, 0]);
  beacon.userData.dynamic = true;
  group.add(beacon);
  return {
    group,
    beacon,
    gps,
    cups,
    dish,
    setStatus(state: 'ok' | 'warn' | 'fault' | 'off') {
      const c = state === 'ok' ? 0x7bd88f : state === 'warn' ? PALETTE.amber : state === 'fault' ? PALETTE.coral : 0x222222;
      beacon.material = emissive(c, state === 'off' ? 0 : 2.2);
    },
    update(dt: number, windKmh: number) {
      cups.rotation.y += dt * windKmh * 0.3;
    },
  };
}
