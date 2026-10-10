import * as THREE from 'three';
import { PALETTE, emissive, mesh, std } from './materials';

/** LiFePO4 module rack with a BMS board and per-module charge bars. */
export function createBatteryModules(cols = 4, rows = 2) {
  const group = new THREE.Group();
  const caseMat = std(PALETTE.battery, 0.55, 0.3);
  const term = std(PALETTE.copper, 0.35, 0.8);
  const bars: THREE.Mesh[] = [];
  const mw = 0.55;
  const md = 0.42;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * (mw + 0.06);
      const z = (r - (rows - 1) / 2) * (md + 0.08);
      group.add(mesh(new THREE.BoxGeometry(mw, 0.42, md), caseMat, [x, 0.21, z]));
      group.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8), term, [x - 0.15, 0.45, z]));
      group.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8), term, [x + 0.15, 0.45, z]));
      const bar = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.012), emissive(0x7bd88f, 1.6), [x, 0.26, z + md / 2 + 0.007]);
      bar.userData.dynamic = true;
      bars.push(bar);
      group.add(bar);
    }
  const bms = mesh(new THREE.BoxGeometry(0.7, 0.05, 0.4), std(0x1f5a3a, 0.6, 0.2), [0, 0.5, 0]);
  group.add(bms);
  return {
    group,
    bars,
    bms,
    setLevel(level: number, charging: boolean, t: number) {
      bars.forEach((b, i) => {
        const filled = (i + 1) / bars.length <= level + 0.001;
        const pulse = charging && !filled && (i / bars.length) <= level + 1 / bars.length ? 0.5 + 0.5 * Math.sin(t * 6) : 1;
        b.material = emissive(filled ? 0x7bd88f : level < 0.25 ? PALETTE.coral : 0x253240, filled ? 1.6 * pulse : charging ? 1.4 * pulse : 0.2);
      });
    },
  };
}
