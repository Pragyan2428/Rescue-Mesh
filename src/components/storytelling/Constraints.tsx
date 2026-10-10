import { useRef, useState } from 'react';
import { storyBus } from '../../scenes/storyState';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { useReveal } from '../../hooks/useReveal';
import { SYSTEM } from '../../data/systemConstants';
import { maxHopKm } from '../../simulation/routePlanner';
import { Slider, Tag } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';

type Kind = 'Deck value' | 'Target' | 'Assumption' | 'Calculation';
const CARDS: { k: string; v: string; unit: string; kind: Kind; icon: IconName; impact: string }[] = [
  { k: 'Elevation', v: '>2,500', unit: 'm', kind: 'Deck value', icon: 'mountain', impact: 'Air is ~20% less dense: less rotor lift, lower turbine output and cold batteries. The model adds a 10% altitude energy factor.' },
  { k: 'Wind gusts', v: '60', unit: 'km/h', kind: 'Deck value', icon: 'wind', impact: 'Drives structural wind load, turbine cut-out and drone go/no-go. Above the assumed 40 km/h drone limit, drones hold at a sheltered dock.' },
  { k: 'Blackout radius', v: '15', unit: 'km', kind: 'Deck value', icon: 'signal', impact: 'One-way 15 km is longer than an 8 km radius, so both messages and drones need multiple hops.' },
  { k: 'Drone radius', v: '8', unit: 'km / charge', kind: 'Deck value', icon: 'drone', impact: 'Nominal: out and back (~16 km) at full payload in calm air. Not a guaranteed loaded hop.' },
  { k: 'Payload', v: '5', unit: 'kg', kind: 'Target', icon: 'package', impact: 'Sizes the medical packs. Heavier payloads raise energy per km and shrink the feasible hop.' },
  { k: 'Station power', v: '100%', unit: 'off-grid', kind: 'Deck value', icon: 'sun', impact: 'Hybrid wind + solar + battery per station, with a locked reserve for communications.' },
  { k: 'Design hop', v: '~5', unit: 'km', kind: 'Assumption', icon: 'route', impact: '8 km × ~0.6 derate for payload, headwind, 20% reserve and altitude (deck A2). Stations are placed about 5 km apart.' },
];

const RHO = 0.96; // kg/m³ at altitude (deck assumption)

export function Constraints() {
  const ref = useRef<HTMLElement>(null);
  const head = useReveal<HTMLDivElement>();
  const [sel, setSel] = useState(6);
  const [wind, setWind] = useState(24);
  const [payload, setPayload] = useState(5);
  useScrollProgress(ref, (p) => (storyBus.progress.constraints = p), { start: 'top 80%', end: 'bottom 20%' });

  const v = wind / 3.6;
  const q = 0.5 * RHO * v * v;
  const go = wind <= SYSTEM.droneWindLimitKmh;
  const hop = maxHopKm(payload, Math.min(wind, SYSTEM.droneWindLimitKmh));
  const turbine = wind >= 55 ? 'Furled / braked (cut-out)' : wind >= 43 ? 'Near rated output' : wind >= 10 ? 'Generating' : 'Below cut-in';

  return (
    <section ref={ref} id="constraints" data-story data-chapter="03 · Engineering constraints" className="relative z-10">
      <div className="bg-gradient-to-r from-night via-night/85 to-night/30">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-24 sm:px-6 md:py-32 lg:px-10">
          <div ref={head} className="grid gap-4">
            <div className="flex items-center gap-3">
              <span className="chapter-no">03</span>
              <span className="h-px w-8 bg-amber/60" aria-hidden="true" />
              <span className="label">Engineering constraints</span>
            </div>
            <h2 className="max-w-[20ch] text-[clamp(2rem,4.6vw,3.4rem)] font-bold leading-[1.02]">Every number in the brief becomes a design decision.</h2>
            <p className="lede">Values marked <Tag>Deck value</Tag> come from the BuildForge problem statement. <Tag tone="amber">Assumption</Tag> and <Tag tone="signal">Calculation</Tag> are modelling choices that would need validation with real hardware.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="list">
              {CARDS.map((c, i) => (
                <button
                  key={c.k}
                  type="button"
                  role="listitem"
                  aria-pressed={sel === i}
                  onClick={() => setSel(i)}
                  className={`group rounded-lg border p-4 text-left transition-colors ${sel === i ? 'border-amber/70 bg-raised/90' : 'border-line bg-night/70 hover:border-mist/50'} ${i === 6 ? 'col-span-2 sm:col-span-1' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="label text-[10px]">{c.k}</span>
                    <Icon name={c.icon} size={15} className={sel === i ? 'text-amber' : 'text-dim'} />
                  </div>
                  <div className="num mt-2 font-display text-[clamp(1.7rem,3.2vw,2.5rem)] font-bold leading-none">{c.v}</div>
                  <div className="mt-1 text-[13px] text-mist">{c.unit}</div>
                  <div className="mt-3">
                    <Tag tone={c.kind === 'Assumption' ? 'amber' : c.kind === 'Target' ? 'go' : c.kind === 'Calculation' ? 'signal' : 'mist'}>{c.kind}</Tag>
                  </div>
                </button>
              ))}
              <div className="col-span-2 rounded-lg border border-line bg-night/80 p-4 sm:col-span-3" aria-live="polite">
                <span className="label text-amber">Implication · {CARDS[sel].k}</span>
                <p className="mt-2 text-[16px] leading-relaxed text-ink">{CARDS[sel].impact}</p>
              </div>
            </div>

            <div className="panel-glass grid content-start gap-5 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="label text-ink">Wind check · go / no-go</span>
                <Tag tone="signal">Calculation</Tag>
              </div>
              <Slider id="c-wind" label="Wind at the corridor" value={wind} min={0} max={70} step={1} onChange={setWind} format={(x) => `${x} km/h`} />
              <Slider id="c-payload" label="Payload" value={payload} min={0} max={5} step={0.5} onChange={setPayload} format={(x) => `${x} kg`} />
              <dl className="grid gap-3 text-[15px]">
                <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-night/60 px-3 py-2">
                  <dt className="text-mist">Drone</dt>
                  <dd className={`font-mono text-sm ${go ? 'text-go' : 'text-coral'}`}>{go ? 'GO · within assumed limit' : `HOLD · sheltered dock (> ${SYSTEM.droneWindLimitKmh} km/h)`}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-night/60 px-3 py-2">
                  <dt className="text-mist">Feasible hop (out and back, 20% reserve)</dt>
                  <dd className="num font-mono text-sm text-amber">{go ? `${hop.toFixed(1)} km` : 'grounded'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-night/60 px-3 py-2">
                  <dt className="text-mist">Wind turbine</dt>
                  <dd className="font-mono text-sm text-ink">{turbine}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-night/60 px-3 py-2">
                  <dt className="text-mist">
                    Wind pressure q = ½ρv²
                  </dt>
                  <dd className="num font-mono text-sm text-ink">{q.toFixed(0)} Pa</dd>
                </div>
              </dl>
              <p className="text-[13px] leading-snug text-dim">
                ρ ≈ 0.96 kg/m³ at altitude. At 60 km/h q ≈ 133 Pa; the structure is designed to ~100 km/h (~370 Pa). The 40 km/h drone limit reflects deck assumption A4 (standard quadcopters ~36–43 km/h) and is configurable. Terrain also blocks line of sight and forces detours, which the route planner accounts for later.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
