import type * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Thin typed wrapper: three r169 ships OrbitControls as JS, and the available
 * type package targets a newer release whose Controls base type does not line
 * up. The wrapper exposes exactly what the scenes use.
 */
export interface Orbit {
  target: THREE.Vector3;
  enableDamping: boolean;
  dampingFactor: number;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  enablePan: boolean;
  screenSpacePanning: boolean;
  enabled: boolean;
  update(): void;
  dispose(): void;
  addEventListener(type: 'start' | 'end' | 'change', fn: () => void): void;
  removeEventListener(type: 'start' | 'end' | 'change', fn: () => void): void;
}

export function createOrbit(camera: THREE.PerspectiveCamera, el: HTMLElement): Orbit {
  return new OrbitControls(camera, el) as unknown as Orbit;
}
