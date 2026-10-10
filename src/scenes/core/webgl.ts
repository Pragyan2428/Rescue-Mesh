let cached: boolean | null = null;

export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2'); // three r169 requires WebGL 2
    cached = !!gl;
    const lose = gl?.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}

export function isMobileDevice(): boolean {
  return window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
