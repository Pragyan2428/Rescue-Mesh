import * as THREE from 'three';

/**
 * Flowing dashed ribbon/tube along a 3D path. Used for drone routes (amber),
 * mesh links (cyan) and failed links (coral). `progress` reveals the path.
 */
export function createFlowTube(points: THREE.Vector3[], o: { color: number; radius: number; dash?: number; speed?: number; opacity?: number; segments?: number }) {
  const uniforms = {
    uColor: { value: new THREE.Color(o.color) },
    uTime: { value: 0 },
    uDash: { value: o.dash ?? 0.08 },
    uSpeed: { value: o.speed ?? 1 },
    uProgress: { value: 1 },
    uOpacity: { value: o.opacity ?? 0.95 },
    uSolid: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform vec3 uColor; uniform float uTime; uniform float uDash; uniform float uSpeed; uniform float uProgress; uniform float uOpacity; uniform float uSolid;
      void main(){
        if (vUv.x > uProgress) discard;
        float d = fract((vUv.x - uTime * uSpeed * 0.05) / uDash);
        float dash = mix(smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.55, 0.62, d)), 1.0, uSolid);
        float a = mix(0.25, 1.0, dash) * uOpacity;
        float head = smoothstep(uProgress - 0.03, uProgress, vUv.x) * step(uProgress, 0.999);
        gl_FragColor = vec4(uColor * (1.2 + head * 1.5), a);
      }`,
  });
  let geo: THREE.TubeGeometry;
  const build = (pts: THREE.Vector3[]) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    return new THREE.TubeGeometry(curve, o.segments ?? Math.max(16, pts.length * 3), o.radius, 6, false);
  };
  geo = build(points.length > 1 ? points : [new THREE.Vector3(), new THREE.Vector3(0, 0.01, 0)]);
  const meshObj = new THREE.Mesh(geo, mat);
  meshObj.frustumCulled = false;
  meshObj.renderOrder = 2;
  return {
    mesh: meshObj,
    uniforms,
    setPoints(pts: THREE.Vector3[]) {
      geo.dispose();
      geo = build(pts.length > 1 ? pts : [new THREE.Vector3(), new THREE.Vector3(0, 0.01, 0)]);
      meshObj.geometry = geo;
    },
    setColor(c: number) {
      uniforms.uColor.value.set(c);
    },
    update(t: number) {
      uniforms.uTime.value = t;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export type FlowTube = ReturnType<typeof createFlowTube>;

/** Arc between two points lifted above both (for radio links). */
export function arcPoints(a: THREE.Vector3, b: THREE.Vector3, lift: number, n = 24): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y += Math.sin(t * Math.PI) * lift;
    pts.push(p);
  }
  return pts;
}
