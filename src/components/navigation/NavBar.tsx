import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { runDemo, scrollToId } from '../../app/actions';

const LINKS = [
  { id: 'crisis', label: 'The Crisis' },
  { id: 'solution', label: 'Our Solution' },
  { id: 'technology', label: 'Technology' },
  { id: 'simulation', label: 'Live Simulation' },
  { id: 'impact', label: 'Impact' },
];

/** Which nav group a chapter belongs to (for the active-link state). */
const GROUP: Record<string, string> = {
  crisis: 'crisis',
  constraints: 'crisis',
  solution: 'solution',
  geometry: 'solution',
  technology: 'technology',
  routing: 'technology',
  energy: 'technology',
  architecture: 'technology',
  safety: 'technology',
  simulation: 'simulation',
  failure: 'simulation',
  operations: 'simulation',
  impact: 'impact',
  closing: 'impact',
};

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 25 L12 9 L20 19 L28 6" fill="none" stroke="#61E6E0" strokeWidth="2" strokeDasharray="3 3" />
      <rect x="1.5" y="22.5" width="5" height="5" fill="#FF9E43" />
      <rect x="9.5" y="6.5" width="5" height="5" fill="none" stroke="#61E6E0" strokeWidth="2" />
      <rect x="17.5" y="16.5" width="5" height="5" fill="none" stroke="#61E6E0" strokeWidth="2" />
      <rect x="25.5" y="3.5" width="5" height="5" fill="none" stroke="#61E6E0" strokeWidth="2" />
    </svg>
  );
}

export function NavBar() {
  const bar = useRef<HTMLDivElement>(null);
  const [chapter, setChapter] = useState<{ id: string; label: string }>({ id: 'top', label: 'Prologue' });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? window.scrollY / h : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            setChapter({ id: el.id, label: el.dataset.chapter ?? '' });
          }
        }
      },
      { rootMargin: '-45% 0px -54% 0px' },
    );
    document.querySelectorAll<HTMLElement>('[data-chapter]').forEach((el) => io.observe(el));
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      io.disconnect();
    };
  }, []);

  const go = (id: string) => {
    setOpen(false);
    scrollToId(id);
  };
  const active = GROUP[chapter.id];

  return (
    <header className="fixed inset-x-0 top-0 z-50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="border-b border-line/70 bg-night/80 backdrop-blur-md">
        <nav aria-label="Primary" className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              go('top');
            }}
            className="flex shrink-0 items-center gap-2.5"
          >
            <Logo />
            <span className="font-display text-[17px] font-bold tracking-[0.01em]" style={{ fontStretch: '112%' }}>
              RescueMesh
            </span>
          </a>
          <div className="hidden min-w-0 items-center gap-2 border-l border-line pl-4 font-mono text-[11px] uppercase tracking-[0.12em] text-dim lg:flex" aria-live="polite">
            <span className="text-amber">●</span>
            <span className="truncate">{chapter.label}</span>
          </div>
          <ul className="ml-auto hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(l.id);
                  }}
                  aria-current={active === l.id ? 'true' : undefined}
                  className={`rounded px-3 py-2 text-[14px] transition-colors ${active === l.id ? 'text-ink' : 'text-mist hover:text-ink'}`}
                >
                  {l.label}
                  <span className={`mx-auto mt-0.5 block h-px transition-all ${active === l.id ? 'w-full bg-amber' : 'w-0 bg-transparent'}`} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          <button type="button" onClick={runDemo} className="ml-auto inline-flex min-h-[38px] items-center gap-2 rounded-md bg-amber px-3.5 text-[14px] font-semibold text-[#1b0f02] hover:bg-[#ffb366] md:ml-2">
            <Icon name="play" size={14} />
            Run Demo
          </button>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line text-mist md:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </nav>
        <div className="h-[2px] w-full bg-line/40">
          <div ref={bar} className="h-full origin-left bg-signal" style={{ transform: 'scaleX(0)' }} />
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="border-b border-line bg-night/95 px-4 pb-4 pt-2 backdrop-blur md:hidden">
          <ul className="grid gap-1">
            {LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(l.id);
                  }}
                  className={`flex min-h-[44px] items-center justify-between rounded px-3 text-[16px] ${active === l.id ? 'bg-raised text-ink' : 'text-mist'}`}
                >
                  {l.label}
                  <Icon name="chevron" size={16} />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-dim">Now: {chapter.label}</p>
        </div>
      )}
    </header>
  );
}
