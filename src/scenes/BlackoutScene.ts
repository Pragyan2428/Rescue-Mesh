/**
 * Blackout layer: the expanding 15 km boundary, conventional cell towers that
 * fail, and the conventional links between the command center and the zone.
 */
import * as THREE from 'three';
import { SYSTEM, WORLD } from '../data/systemConstants';
import { createCellTower } from '../models/Markers';
import { createFlowTube, arcPoints } from '../models/FlightRibbon';
import { PALETTE } from '../models/materials';
import { groundY } from '../utils/terrainField';
import { nodeWorld } from './NetworkScene';

const U = WORLD.unitsPerKm;
export const TOWERS_KM = [
  { x: -9.5, z: -3.4 },
  { x: -3.8, z: 4.2 },
  { x: 2.6, z: -3.0 },
];

export function createBlackoutLayer() {
  const group = new THREE.Group();
  const R = SYSTEM.blackoutRadiusKm * U;
  const uniforms = { uTime: { value: 0 }, uAlpha: { value: 0 } };
  const wallMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform float uTime; uniform float uAlpha;
      void main(){
        float fade = pow(1.0 - vUv.y, 2.2);
        float bands = 0.55 + 0.45 * smoothstep(0.4, 1.0, sin((vUv.y * 18.0 - uTime * 1.2)));
        float a = fade * bands * 0.42 * uAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.42, 0.37) * 1.3, a);
      }`,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 60, 128, 1, true), wallMat);
  wall.position.y = 30;
  wall.renderOrder = 3;
  group.add(wall);

  const towers = TOWERS_KM.map((p) => {
    const t = createCellTower();
    t.group.scale.setScalar(0.55);
    t.group.position.set(p.x * U, groundY(p.x, p.z), p.z * U);
    group.add(t.group);
    return t;
  });
  const cc = nodeWorld('CC', 1);
  const conv = TOWERS_KM.map((p) => {
    const b = new THREE.Vector3(p.x * U, groundY(p.x, p.z) + 5.3, p.z * U);
    const tube = createFlowTube(arcPoints(cc, b, 6, 24), { color: 0x7bd88f, radius: 0.07, dash: 0.05, speed: 1, opacity: 0.7 });
    group.add(tube.mesh);
    return tube;
  });

  return {
    group,
    towerAnchor: (i: number) => new THREE.Vector3(TOWERS_KM[i].x * U, groundY(TOWERS_KM[i].x, TOWERS_KM[i].z) + 7, TOWERS_KM[i].z * U),
    update(t: number, blackout: number, fail: number) {
      uniforms.uTime.value = t;
      const k = Math.max(0.001, blackout);
      wall.scale.set(k, 1, k);
      uniforms.uAlpha.value = blackout > 0.01 ? Math.min(1, blackout * 1.4) * (blackout < 1 ? 1 : 0.65) : 0;
      wall.visible = blackout > 0.01;
      towers.forEach((tw, i) => tw.setFailed(fail > 0.3 + i * 0.15 ? 1 : 0));
      conv.forEach((c, i) => {
        const broken = fail > 0.3 + i * 0.15;
        c.setColor(broken ? PALETTE.coral : 0x7bd88f);
        c.uniforms.uSpeed.value = broken ? 0 : 1;
        c.uniforms.uOpacity.value = broken ? 0.35 : 0.7;
        c.uniforms.uDash.value = broken ? 0.025 : 0.05;
        c.mesh.visible = fail < 0.999 || t % 1 < 0.85; // failing links flicker out
        c.update(t);
      });
    },
    dispose() {
      conv.forEach((c) => c.dispose());
      wallMat.dispose();
    },
  };
}
