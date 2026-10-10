import { useEffect, useRef, useState } from 'react';
import { storyBus } from '../../scenes/storyState';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { SYSTEM } from '../../data/systemConstants';
import { maxHopKm } from '../../simulation/routePlanner';
import { Slider, Tag, Toggle } from '../ui/controls';

const PHASES = [
  { at: 0, t: 'Gateway outside the zone', b: 'The command center and gateway sit at the road-head on the edge of the blackout (assumption A3).' },
  { at: 0.12, t: 'Docks every ~5 km', b: 'S1, S2 and S3 sit on ridge shoulders about 5, 10 and 15 km in. S2b is a configured alternate dock in the side valley.' },
  { at: 0.3, t: 'Two systems, two colours', b: 'Cyan: radio links between nodes. Amber: physical drone flights between feasible docks. A radio link is not a flight path.' },
  { at: 0.42, t: 'Hop 1 · Gateway → S1', b: 'The drone departs with a 5 kg pack and lands at S1 with battery to spare.' },
  { at: 0.6, t: 'Charge, then S1 → S2', b: 'Each dock charges or swaps the battery, shelters the drone and forwards mesh traffic.' },
  { at: 0.78, t: 'S2 → S3 · incident zone', b: 'Three ~5 km hops carry help 15 km into a zone a single 8 km drone cannot cross.' },
];

export function Geometry() {
  const ref = useRef<HTMLElement>(null);
  const hud = { batt: useRef<HTMLSpanElement>(null), leg: useRef<HTMLSpanElement>(null), km: useRef<HTMLSpanElement>(null), bar: useRef<HTMLDivElement>(null) };
  const [phase, setPhase] = useState(0);
  const [payload, setPayload] = useState(storyBus.interactive.payloadKg);
  const [wind, setWind] = useState(storyBus.interactive.windKmh);
  const [top, setTop] = useState(false);
  const [cov, setCov] = useState(false);

  useScrollProgress(ref, (p) => {
    storyBus.progress.geometry = p;
    let s = 0;
    PHASES.forEach((x, i) => {
      if (p >= x.at) s = i;
    });
    setPhase((prev) => (prev === s ? prev : s));
  });

  useEffect(() => {
    storyBus.hud = (h) => {
      if (hud.batt.current) hud.batt.current.textContent = `${Math.round(h.battery)}%`;
      if (hud.leg.current) hud.leg.current.textContent = h.leg;
      if (hud.km.current) hud.km.current.textContent = `${h.km.toFixed(1)} km`;
      if (hud.bar.current) hud.bar.current.style.width = `${Math.max(0, Math.min(100, h.battery))}%`;
    };
    return () => {
      storyBus.hud = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    storyBus.interactive.payloadKg = payload;
    storyBus.interactive.windKmh = wind;
    storyBus.interactive.topDown = top;
    storyBus.interactive.coverage = cov;
  }, [payload, wind, top, cov]);

  const hop = maxHopKm(payload, wind);

  return (
    <section ref={ref} id="geometry" data-story data-chapter="05 · Network geometry" className="relative z-10 h-[420vh]">
      <div className="sticky top-0 flex min-h-[100svh] flex-col justify-end gap-4 px-4 pb-6 pt-20 sm:px-6 md:justify-between md:pb-8 md:pt-24 lg:px-10">
        <div className="max-w-[520px] rounded-xl border border-line/70 bg-night/80 p-5 backdrop-blur-md md:p-6">
          <div className="flex items-center gap-3">
            <span className="chapter-no">05</span>
            <span className="h-px w-8 bg-amber/60" aria-hidden="true" />
            <span className="label">15 km blackout vs 8 km drone range</span>
          </div>
          <h2 className="mt-3 text-[clamp(1.35rem,3.2vw,2.4rem)] font-bold leading-[1.05]">A single drone reaches at most 28% of the zone. Docks close the gap.</h2>
          <div className="mt-4 border-l-2 border-amber pl-4 sm:min-h-[88px]" aria-live="polite">
            <p className="font-semibold text-ink">{PHASES[phase].t}</p>
            <p className="text-[15px] leading-snug text-mist">{PHASES[phase].b}</p>
          </div>
          <dl className="mt-4 hidden grid-cols-4 gap-2 text-center sm:grid">
            {[
              ['≤28%', '(8/15)² reach'],
              ['≥2', 'hops minimum'],
              ['3', 'hops at 5 km'],
              ['~11', 'full-area docks'],
            ].map(([v, k]) => (
              <div key={k} className="rounded border border-line bg-surface/80 px-1 py-2">
                <dd className="num font-display text-xl font-bold text-amber">{v}</dd>
                <dt className="text-[11px] leading-tight text-mist">{k}</dt>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,380px)] md:justify-between">
          <div className="rounded-xl border border-line/70 bg-night/85 p-4 backdrop-blur-md" role="status" aria-label="Drone telemetry for the scroll-driven hop sequence">
            <div className="flex items-center justify-between">
              <span className="label text-amber">Drone · 5 kg design case</span>
              <Tag>Model</Tag>
            </div>
            <div className="mt-2 font-mono text-[15px] text-ink">
              <span ref={hud.leg}>Docked at Gateway</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div ref={hud.bar} className="h-full bg-go" style={{ width: '100%' }} />
              </div>
              <span ref={hud.batt} className="num w-12 text-right font-mono text-sm">100%</span>
            </div>
            <div className="mt-1 font-mono text-[12px] text-dim">
              hop distance <span ref={hud.km}>0.0 km</span> · recharge at each dock
            </div>
          </div>

          <div className="rounded-xl border border-line/70 bg-night/85 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
              <span className="label text-ink">Range comparison</span>
              <Tag tone="amber">Assumption</Tag>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded border border-amber/40 border-dashed p-2">
                <span className="block text-mist">Nominal radius</span>
                <span className="num font-mono text-lg text-amber">{SYSTEM.nominalDroneRadiusKm.toFixed(1)} km</span>
                <span className="block text-[11px] text-dim">calm air, out and back</span>
              </div>
              <div className="rounded border border-amber/70 p-2">
                <span className="block text-mist">Feasible hop now</span>
                <span className="num font-mono text-lg text-amber">{hop.toFixed(1)} km</span>
                <span className="block text-[11px] text-dim">altitude, wind, payload, 20% reserve</span>
              </div>
            </div>
            <div className="mt-3 hidden gap-3 sm:grid">
              <Slider id="g-payload" label="Payload" value={payload} min={0} max={5} step={0.5} onChange={setPayload} format={(x) => `${x} kg`} />
              <Slider id="g-wind" label="Average headwind" value={wind} min={0} max={40} step={1} onChange={setWind} format={(x) => `${x} km/h`} />
            </div>
            <div className="mt-3 hidden grid-cols-2 gap-2 sm:grid">
              <Toggle on={top} onChange={setTop} icon="crosshair" tone="signal">
                Top-down
              </Toggle>
              <Toggle on={cov} onChange={setCov} icon="layers" tone="signal">
                Full-area ~11
              </Toggle>
            </div>
            {cov && <p className="mt-2 text-[12px] leading-snug text-mist">Conceptual: 707 km² ÷ ~65 km² per dock ≈ 11 stations. Three corridor docks serve the access route only; real coverage depends on terrain, line of sight and weather.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
