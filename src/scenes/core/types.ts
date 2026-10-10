import type * as THREE from 'three';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  mobile: boolean;
  reducedMotion: boolean;
}

export interface SceneController {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number, elapsed: number): void;
  resize?(w: number, h: number): void;
  dispose(): void;
  /** Called once after the first frame is drawn. */
  onFirstFrame?(): void;
}

export type SceneFactory = (ctx: SceneContext) => SceneController;
