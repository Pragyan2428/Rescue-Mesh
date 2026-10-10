import { useRef } from 'react';
import { storyBus } from '../../scenes/storyState';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { runDemo, scrollToId } from '../../app/actions';
import { Icon } from '../ui/Icon';
import { Logo } from '../navigation/NavBar';

export function Closing() {
  const ref = useRef<HTMLElement>(null);
  useScrollProgress(ref, (p) => (storyBus.progress.closing = p), { start: 'top bottom', end: 'bottom bottom' });
  return (
    <section ref={ref} id="closing" data-story data-chapter="15 · The connected network" className="relative z-10 h-[210vh]">
      <div className="sticky top-0 flex min-h-[100svh] items-end pb-10 pt-24 md:items-center">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-10">
          <div className="max-w-[780px]">
            <p className="label mb-4 flex items-center gap-2 text-go">
              <Icon name="check" size={14} /> Delivery confirmed · acknowledgement received at the command center
            </p>
            <h2 className="text-[clamp(2.2rem,5.6vw,4.6rem)] font-extrabold leading-[1] tracking-[-0.02em]" style={{ fontStretch: '108%' }}>
              When infrastructure fails, <span className="text-signal">the network must become the infrastructure.</span>
            </h2>
            <p className="mt-6 max-w-[56ch] text-[clamp(1.05rem,1.5vw,1.25rem)] text-[#c9d6e2]">Self-powered stations. Decentralized communications. Autonomous logistics. One resilient system for emergency response.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={runDemo} className="inline-flex min-h-[48px] items-center gap-2 rounded-md bg-amber px-5 text-[15px] font-semibold text-[#1b0f02] hover:bg-[#ffb366]">
                <Icon name="reset" size={16} /> Replay the Simulation
              </button>
              <button type="button" onClick={() => scrollToId('solution')} className="inline-flex min-h-[48px] items-center gap-2 rounded-md border border-ink/30 bg-night/60 px-5 text-[15px] backdrop-blur hover:border-ink/60">
                Explore the Engineering
              </button>
              <button type="button" onClick={() => scrollToId('impact')} className="inline-flex min-h-[48px] items-center gap-2 rounded-md border border-ink/30 bg-night/60 px-5 text-[15px] backdrop-blur hover:border-ink/60">
                View the Prototype Roadmap
              </button>
            </div>
          </div>
          <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-line/70 pt-5 text-[14px] text-mist">
            <div className="flex items-center gap-3">
              <Logo size={22} />
              <span>
                <span className="text-ink">RescueMesh</span> by <span className="text-ink">BuildForge</span> · Pragyan, Aryan, Abhirup and Anurup
              </span>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-dim">Conceptual system and demonstration platform · not a deployed network</span>
          </footer>
        </div>
      </div>
    </section>
  );
}
