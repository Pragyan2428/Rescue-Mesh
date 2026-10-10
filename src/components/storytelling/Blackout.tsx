import { useRef, useState } from 'react';
import { storyBus } from '../../scenes/storyState';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { Icon, type IconName } from '../ui/Icon';

const STEPS: { at: number; icon: IconName; title: string; body: string }[] = [
  { at: 0.0, icon: 'mountain', title: 'Flash floods and landslides', body: 'A major yatra in J&K is hit above 2,500 m. Hypothetical design case based on the Kishtwar pilgrimage blackout.' },
  { at: 0.2, icon: 'x', title: 'Road access lost', body: 'The single road into the valley washes out. Vehicles and supplies stop at the road-head.' },
  { at: 0.4, icon: 'signal', title: 'No cellular, no radio', body: 'Towers lose power and backhaul. The blackout spreads to a 15 km radius with no way to call for help.' },
  { at: 0.6, icon: 'radio', title: 'Responders disconnected', body: 'The command center outside the zone cannot hear from casualties or direct teams inside it.' },
  { at: 0.8, icon: 'package', title: 'Supplies cannot reach casualties', body: 'Medical teams cannot locate casualties or move supplies across the cut corridor.' },
];

export function Blackout() {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  useScrollProgress(ref, (p) => {
    storyBus.progress.blackout = p;
    let s = 0;
    STEPS.forEach((x, i) => {
      if (p >= x.at) s = i;
    });
    setStep((prev) => (prev === s ? prev : s));
  });
  return (
    <section ref={ref} id="crisis" data-story data-chapter="02 · The blackout" className="relative z-10 h-[300vh]">
      <div className="sticky top-0 flex min-h-[100svh] items-center pb-10 pt-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-10">
          <div className="max-w-[560px] rounded-xl border border-line/70 bg-night/80 p-6 backdrop-blur-md md:p-8">
            <div className="flex items-center gap-3">
              <span className="chapter-no">02</span>
              <span className="h-px w-8 bg-amber/60" aria-hidden="true" />
              <span className="label">The blackout</span>
            </div>
            <h2 className="mt-4 text-[clamp(1.9rem,3.8vw,2.9rem)] font-bold leading-[1.04]">Everything that should help fails at the same time.</h2>
            <ol className="mt-6 grid gap-2" aria-label="How conventional infrastructure fails">
              {STEPS.map((s, i) => {
                const on = i <= step;
                return (
                  <li key={s.title} className={`flex gap-3 rounded-md border p-3 transition-all duration-500 ${on ? 'border-coral/40 bg-coral/[0.07] opacity-100' : 'border-line/50 opacity-45'}`}>
                    <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded ${on ? 'bg-coral/20 text-coral' : 'bg-raised text-dim'}`}>
                      <Icon name={s.icon} size={15} />
                    </span>
                    <span>
                      <span className="block font-semibold text-ink">{s.title}</span>
                      <span className="block text-[15px] leading-snug text-mist">{s.body}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className={`mt-5 border-l-2 border-amber pl-4 text-[15px] leading-relaxed text-ink transition-opacity duration-500 ${step >= 4 ? 'opacity-100' : 'opacity-50'}`}>
              Towers, roads and grid power are single points of failure that share the same weak spots. A response network for this valley cannot depend on one tower, one road or one communications path.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
