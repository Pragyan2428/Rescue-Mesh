import * as THREE from 'three';
import { PALETTE, mesh, std, strut } from './materials';

let cellTex: THREE.CanvasTexture | null = null;
function solarTexture(): THREE.CanvasTexture {
  if (cellTex) return cellTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c2238';
  g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 6; x++) {
      const px = 4 + x * 20.6;
      const py = 4 + y * 25;
      const grd = g.createLinearGradient(px, py, px + 18, py + 22);
      grd.addColorStop(0, '#173d63');
      grd.addColorStop(1, '#0e2a47');
      g.fillStyle = grd;
      g.fillRect(px, py, 18, 22);
      g.fillStyle = 'rgba(160,190,220,0.25)';
      g.fillRect(px + 8.5, py, 1, 22);
    }
  cellTex = new THREE.CanvasTexture(c);
  cellTex.colorSpace = THREE.SRGBColorSpace;
  return cellTex;
}

/** Low-profile tilted PV panels on short brackets. Returns panel meshes for glow. */
export function createSolarArray(count = 1, w = 1.0, h = 1.75, tilt = 0.45) {
  const group = new THREE.Group();
  const frame = std(PALETTE.panelFrame, 0.35, 0.7);
  const glassMat = new THREE.MeshStandardMaterial({ map: solarTexture(), roughness: 0.18, metalness: 0.4, emissive: new THREE.Color(0x0a2a40), emissiveIntensity: 0 });
  const panels: THREE.Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    g.position.x = (i - (count - 1) / 2) * (w + 0.12);
    const panel = mesh(new THREE.BoxGeometry(w, 0.04, h), glassMat, [0, 0, 0]);
    const rim = mesh(new THREE.BoxGeometry(w + 0.05, 0.035, h + 0.05), frame, [0, -0.012, 0]);
    const tiltG = new THREE.Group();
    tiltG.rotation.x = tilt;
    tiltG.position.y = 0.5;
    tiltG.add(rim, panel);
    g.add(tiltG);
    for (const z0 of [h * 0.3, -h * 0.3]) {
      for (const x0 of [-w / 2 + 0.06, w / 2 - 0.06]) {
        const top = new THREE.Vector3(x0, 0.5 - z0 * Math.sin(tilt), z0 * Math.cos(tilt));
        g.add(strut(new THREE.Vector3(x0, 0, top.z), top, 0.022, frame));
      }
    }
    panels.push(panel);
    group.add(g);
  }
  return {
    group,
    panels,
    setSun(level: number) {
      glassMat.emissiveIntensity = level * 0.6;
    },
  };
}
