import * as THREE from 'three';

export type EmphasisMode = 'normal' | 'highlight' | 'ghost' | 'glass';

/**
 * Swap a subtree's materials between normal / highlighted / ghosted variants.
 * Variants are cloned lazily per mesh so shared materials are never mutated.
 * Meshes flagged `userData.dynamic` manage their own materials and are skipped
 * except for ghosting visibility.
 */
export function setEmphasis(root: THREE.Object3D, mode: EmphasisMode, color = 0xff9e43): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.dynamic) {
      m.visible = mode !== 'ghost';
      return;
    }
    const orig = (m.userData.origMat ??= m.material) as THREE.Material;
    if (mode === 'normal') {
      m.material = orig;
      return;
    }
    if (mode === 'highlight') {
      if (!m.userData.hiMat) {
        const c = (orig as THREE.MeshStandardMaterial).clone();
        if ('emissive' in c) {
          c.emissive = new THREE.Color(color);
          c.emissiveIntensity = 0.55;
        }
        m.userData.hiMat = c;
      }
      m.material = m.userData.hiMat;
      return;
    }
    if (mode === 'ghost') {
      if (!m.userData.ghostMat) {
        const c = (orig as THREE.Material).clone();
        c.transparent = true;
        c.opacity = 0.07;
        c.depthWrite = false;
        m.userData.ghostMat = c;
      }
      m.material = m.userData.ghostMat;
      return;
    }
    if (!m.userData.glassMat) {
      m.userData.glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd9ff, transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    }
    m.material = m.userData.glassMat;
  });
}
