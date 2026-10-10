import { useEffect, useRef } from 'react';
import { gsap } from './gsap';
import { prefersReducedMotion } from '../scenes/core/webgl';

/**
 * Text reveal on scroll. Starts from a dimmed (still readable) state rather
 * than invisible, plays once and never re-fires.
 */
export function useReveal<T extends HTMLElement>(opts: { y?: number; delay?: number } = {}) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: opts.y ?? 22, opacity: 0.25 },
        { y: 0, opacity: 1, duration: 0.9, delay: opts.delay ?? 0, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } },
      );
    }, el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
