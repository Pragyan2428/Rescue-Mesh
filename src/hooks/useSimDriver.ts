import { useEffect } from 'react';
import { emit, getSim } from '../simulation/store';
import { tick } from '../simulation/missionEngine';

/**
 * The single clock that advances the shared simulation. 3D scenes and UI
 * only read state; this loop is the only place time moves forward.
 */
export function useSimDriver(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = getSim();
      if (s.paused || document.hidden) return;
      let simDt = dt * s.speed;
      while (simDt > 0) {
        const step = Math.min(1, simDt);
        tick(s, step);
        simDt -= step;
      }
      emit(false);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
