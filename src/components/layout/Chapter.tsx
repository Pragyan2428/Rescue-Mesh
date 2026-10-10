import type { ReactNode } from 'react';
import { useReveal } from '../../hooks/useReveal';

export function ChapterHeader({ no, kicker, title, children, align = 'left' }: { no: string; kicker: string; title: ReactNode; children?: ReactNode; align?: 'left' | 'center' }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`grid gap-4 ${align === 'center' ? 'mx-auto justify-items-center text-center' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="chapter-no">{no}</span>
        <span className="h-px w-8 bg-amber/60" aria-hidden="true" />
        <span className="label">{kicker}</span>
      </div>
      <h2 className="max-w-[22ch] text-[clamp(2rem,4.6vw,3.4rem)] font-bold leading-[1.02] tracking-[-0.01em]">{title}</h2>
      {children && <div className={`lede ${align === 'center' ? 'mx-auto' : ''}`}>{children}</div>}
    </div>
  );
}

/** Opaque chapter: covers the fixed story canvas. */
export function Chapter({ id, children, className = '', label }: { id: string; children: ReactNode; className?: string; label: string }) {
  return (
    <section id={id} data-chapter={label} className={`relative z-10 border-t border-line/60 bg-night ${className}`}>
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 md:py-28 lg:px-10">{children}</div>
    </section>
  );
}
