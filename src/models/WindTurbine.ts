import * as THREE from 'three';
import { PALETTE, mesh, std, strut } from './materials';

/**
 * Compact horizontal-axis turbine with tail vane and a brake disc.
 * `update(dt, windKmh, braked)` spins the rotor; above cut-out it furls and brakes.
 */
export function createWindTurbine(height = 3.2, rotorR = 1.0) {
  const group = new THREE.Group();
  const steel = std(PALETTE.steel, 0.45, 0.6);
  const dark = std(PALETTE.darkSteel, 0.5, 0.5);
  const blade = std(0xe9edf0, 0.5, 0.05);
  const brakeMat = std(0x555555, 0.5, 0.4);
  group.add(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, height, 0), 0.07, steel, 10));
  // guy collar
  group.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 12), dark, [0, height * 0.55, 0]));
  const yaw = new THREE.Group();
  yaw.position.y = height;
  group.add(yaw);
  const nacelle = mesh(new THREE.CapsuleGeometry(0.13, 0.42, 4, 10), std(0xd9dde0, 0.4, 0.2), [0, 0.05, 0], [Math.PI / 2, 0, 0]);
  yaw.add(nacelle);
  // tail vane
  yaw.add(strut(new THREE.Vector3(0, 0.05, -0.2), new THREE.Vector3(0, 0.12, -0.95), 0.02, steel));
  const vane = mesh(new THREE.BoxGeometry(0.02, 0.34, 0.42), std(0xd9dde0, 0.5, 0.1), [0, 0.18, -1.05]);
  yaw.add(vane);
  // brake disc
  const brake = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16), brakeMat, [0, 0.05, 0.3], [Math.PI / 2, 0, 0]);
  brake.userData.dynamic = true;
  yaw.add(brake);
  const rotor = new THREE.Group();
  rotor.position.set(0, 0.05, 0.36);
  yaw.add(rotor);
  rotor.add(mesh(new THREE.ConeGeometry(0.1, 0.22, 12), std(0xd9dde0, 0.4, 0.2), [0, 0, 0.08], [Math.PI / 2, 0, 0]));
  const bladeGeo = new THREE.BoxGeometry(0.11, rotorR, 0.025);
  bladeGeo.translate(0, rotorR / 2 + 0.06, 0);
  for (let i = 0; i < 3; i++) {
    const b = mesh(bladeGeo, blade);
    b.rotation.z = (i / 3) * Math.PI * 2;
    b.rotation.y = 0.18;
    rotor.add(b);
  }
  let rpm = 0;
  let furl = 0;
  return {
    group,
    rotor,
    brake,
    yaw,
    update(dt: number, windKmh: number, braked: boolean) {
      const cutOut = windKmh > 55;
      const target = braked || cutOut ? 0 : Math.min(1, windKmh / 43) * 6;
      rpm += (target - rpm) * Math.min(1, dt * (braked ? 2.2 : 0.8));
      rotor.rotation.z += rpm * dt;
      furl += ((cutOut ? 0.9 : 0) - furl) * Math.min(1, dt * 0.8);
      yaw.rotation.y = furl + Math.sin(performance.now() / 4000) * 0.05;
      const on = braked || cutOut;
      if (brake.userData.on !== on) {
        brake.userData.on = on;
        brake.material = on ? std(PALETTE.coral, 0.4, 0.3, { emissive: new THREE.Color(PALETTE.coral), emissiveIntensity: 0.6 }) : brakeMat;
      }
      return rpm;
    },
  };
}
