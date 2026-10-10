import { useRef } from 'react';
import { storyBus } from '../../scenes/storyState';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { Icon } from '../ui/Icon';
import { runDemo, scrollToId } from '../../app/actions';
import { SYSTEM } from '../../data/systemConstants';

const STATS = [
  { v: `${SYSTEM.blackoutRadiusKm} km`, k: 'Blackout radius', tone: 'text-coral' },
  { v: `${SYSTEM.nominalDroneRadiusKm} km`, k: 'Nominal drone radius / charge', tone: 'text-amber' },
  { v: `~${SYSTEM.designHopKm} km`, k: 'Design hop (planning)', tone: 'text-signal' },
  { v: `≤ ${SYSTEM.payloadTargetKg} kg`, k: 'Payload requirement', tone: 'text-ink' },
];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  useScrollProgress(ref, (p) => (storyBus.progress.hero = p), { start: 'top top', end: 'bottom top' });
  return (
    <section ref={ref} id="top" data-story data-chapter="Prologue" className="relative z-10 h-[170vh]">
      <div className="sticky top-0 flex min-h-[100svh] items-end pb-14 pt-24 md:items-center md:pb-0">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-10">
          <p className="label mb-5 flex items-center gap-3">
            <span className="text-amber">BuildForge</span>
            <span className="h-px w-6 bg-line" aria-hidden="true" />
            The Kishtwar pilgrimage blackout · design case
          </p>
          <h1 className="max-w-[17ch] text-[clamp(2.4rem,6.4vw,5.6rem)] font-extrabold leading-[0.98] tracking-[-0.02em]" style={{ fontStretch: '108%' }}>
            When infrastructure fails, <span className="text-signal">the network</span> must become the infrastructure.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[clamp(1.05rem,1.6vw,1.3rem)] leading-relaxed text-[#c9d6e2]">Self-powered drone docks. Resilient mesh communications. Emergency medical delivery across inaccessible terrain.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => scrollToId('solution')} className="inline-flex min-h-[48px] items-center gap-2 rounded-md bg-amber px-5 text-[15px] font-semibold text-[#1b0f02] hover:bg-[#ffb366]">
              Explore the System <Icon name="arrowRight" size={17} />
            </button>
            <button type="button" onClick={runDemo} className="inline-flex min-h-[48px] items-center gap-2 rounded-md border border-ink/30 bg-night/50 px-5 text-[15px] text-ink backdrop-blur hover:border-ink/60">
              <Icon name="play" size={15} /> Run Rescue Simulation
            </button>
          </div>
          <dl className="mt-10 grid max-w-[760px] grid-cols-2 gap-px overflow-hidden rounded-lg border border-line/80 bg-line/60 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.k} className="bg-night/80 px-4 py-3 backdrop-blur">
                <dt className="label text-[10px]">{s.k}</dt>
                <dd className={`num mt-1 font-display text-2xl font-bold ${s.tone}`}>{s.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 max-w-[70ch] text-[13px] leading-snug text-mist">
            The ~5 km design hop is deliberately shorter than the 8 km nominal radius: it allows for payload, altitude, headwind and a 20% battery reserve (deck assumption A2). Terrain shown is a conceptual visualisation, not survey data.
          </p>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-mist md:flex" aria-hidden="true">
        <span className="label text-[10px]">Scroll</span>
        <Icon name="arrowDown" size={16} />
      </div>
    </section>
  );
}
