import { useEffect, type RefObject } from 'react';
import { ScrollTrigger } from './gsap';

/**
 * Scrubbed, reversible scroll progress for a section. Calls back with 0..1;
 * the caller decides what to do with it (story bus, step index, HUD).
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>, onProgress: (p: number) => void, opts: { start?: string; end?: string } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const st = ScrollTrigger.create({
      trigger: el,
      start: opts.start ?? 'top top',
      end: opts.end ?? 'bottom bottom',
      onUpdate: (self) => onProgress(self.progress),
      onRefresh: (self) => onProgress(self.progress),
    });
    onProgress(st.progress);
    return () => st.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
