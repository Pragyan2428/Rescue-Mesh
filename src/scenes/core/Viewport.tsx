import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { SceneController, SceneFactory } from './types';
import { hasWebGL, isMobileDevice, prefersReducedMotion } from './webgl';

interface Props {
  factory: SceneFactory;
  className?: string;
  label: string;
  fallback: ReactNode;
  /** Render even when off-screen detection says otherwise (e.g. fixed background). */
  activeOverride?: boolean;
  /** Mount the renderer only when within this distance of the viewport. */
  lazyMargin?: string;
  onReady?: (c: SceneController) => void;
  children?: ReactNode;
  loadingLabel?: string;
  /** Capture touch gestures (orbit controls). Off for scroll-driven scenes. */
  interactive?: boolean;
}

/**
 * Owns one WebGL renderer + scene controller. Renders only while visible,
 * adapts device-pixel ratio to frame time, cleans everything up on unmount.
 */
export function Viewport({ factory, className, label, fallback, activeOverride, lazyMargin = '400px', onReady, children, loadingLabel = 'Loading 3D scene', interactive = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported] = useState(() => hasWebGL());
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const visibleRef = useRef(false);
  const overrideRef = useRef<boolean | undefined>(activeOverride);
  overrideRef.current = activeOverride;
  const readyCb = useRef(onReady);
  readyCb.current = onReady;

  // lazy mount
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setNear(true);
        }
      },
      { rootMargin: lazyMargin },
    );
    io.observe(el);
    const io2 = new IntersectionObserver((entries) => {
      for (const e of entries) visibleRef.current = e.isIntersecting;
    });
    io2.observe(el);
    return () => {
      io.disconnect();
      io2.disconnect();
    };
  }, [lazyMargin]);

  useEffect(() => {
    if (!supported || !near || !canvasRef.current || !wrapRef.current) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const mobile = isMobileDevice();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75);
    let dpr = maxDpr;
    renderer.setPixelRatio(dpr);
    let ctrl: SceneController;
    try {
      ctrl = factory({ renderer, canvas, mobile, reducedMotion: prefersReducedMotion() });
    } catch (err) {
      console.error('Scene failed to initialise', err);
      renderer.dispose();
      setFailed(true);
      return;
    }
    const resize = () => {
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, wrap.clientHeight);
      renderer.setSize(w, h, false);
      ctrl.camera.aspect = w / h;
      ctrl.camera.updateProjectionMatrix();
      ctrl.resize?.(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const lost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', lost);

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let first = true;
    let slowFrames = 0;
    let fastFrames = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const active = overrideRef.current ?? visibleRef.current;
      const dtMs = now - last;
      last = now;
      if (!active || document.hidden) return;
      const dt = Math.min(0.1, dtMs / 1000);
      elapsed += dt;
      ctrl.update(dt, elapsed);
      renderer.render(ctrl.scene, ctrl.camera);
      if (first) {
        first = false;
        ctrl.onFirstFrame?.();
        setReady(true);
        readyCb.current?.(ctrl);
      }
      // adaptive resolution
      if (dtMs > 34) slowFrames++;
      else if (dtMs < 18) fastFrames++;
      if (slowFrames > 40 && dpr > 0.75) {
        dpr = Math.max(0.75, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        resize();
        slowFrames = 0;
        fastFrames = 0;
      } else if (fastFrames > 240 && dpr < maxDpr) {
        dpr = Math.min(maxDpr, dpr + 0.25);
        renderer.setPixelRatio(dpr);
        resize();
        fastFrames = 0;
        slowFrames = 0;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      ctrl.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
    // factory is intentionally captured once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, near]);

  const showFallback = !supported || failed;
  return (
    <div ref={wrapRef} className={`${/\b(fixed|absolute|sticky)\b/.test(className ?? '') ? '' : 'relative'} overflow-hidden ${className ?? ''}`}>
      {showFallback ? (
        <div className="absolute inset-0">{fallback}</div>
      ) : (
        <>
          <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full ${interactive ? 'touch-none' : 'touch-pan-y pointer-events-none'}`} aria-label={label} role="img" />
          {!ready && (
            <div className="absolute inset-0 grid place-items-center bg-night/70" aria-live="polite">
              <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-label text-mist">
                <span className="loader-dot" aria-hidden="true" />
                {loadingLabel}
              </div>
            </div>
          )}
        </>
      )}
      {children}
    </div>
  );
}
