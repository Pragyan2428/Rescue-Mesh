import { Chapter, ChapterHeader } from '../layout/Chapter';
import { Tag } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';
import { useReveal } from '../../hooks/useReveal';

const PROTO = ['A small physical docking-station model', 'Two or three mesh nodes (LoRa boards), simulated here', 'SOS message propagation over the mesh', 'Drone flight-path simulation (ArduPilot SITL / Gazebo)', 'Interactive operations dashboard', 'Station failure and automatic rerouting', 'Small solar + wind demonstrator with battery'];
const FULL = ['Ruggedised, rock-anchored stations', 'Heavy-lift drones sized for the 5 kg payload', 'Real terrain flight testing', 'Certified radios and regulatory approvals', 'Validated energy sizing (5–10 kWh, ~800 W PV + turbine)', 'Operations-grade command center', 'Field-verified resilience'];
const DEMO = ['Show the 15 km blackout zone', 'Place stations at 5 / 10 / 15 km', 'Trigger a medical request', 'Show the mesh route carrying the message', 'Show drone route + battery per hop', 'Show station power status', 'Kill a station live', 'Watch the auto-reroute', 'Complete delivery + confirmation'];
const FUTURE: { phase: string; items: string[] }[] = [
  { phase: 'Phase 1', items: ['Expanded docking corridors', 'More drones per station, larger zones'] },
  { phase: 'Phase 2', items: ['Search-and-rescue thermal imaging', 'Disaster mapping', 'Temporary communications for responders'] },
  { phase: 'Phase 3', items: ['Predictive weather routing', 'Route optimisation from mission history'] },
];
const COSTS: { item: string; proto: string; station: string; mid: number }[] = [
  { item: 'Drone', proto: 'Rs 25–50k', station: 'Rs 8–15 lakh', mid: 11.5 },
  { item: 'Docking station', proto: 'Rs 10–20k', station: 'Rs 2–4 lakh', mid: 3 },
  { item: 'Structure', proto: 'Rs 10–20k', station: 'Rs 2–4 lakh', mid: 3 },
  { item: 'Renewable power', proto: 'Rs 10–15k', station: 'Rs 1.5–2.5 lakh', mid: 2 },
  { item: 'Battery', proto: 'Rs 8–15k', station: 'Rs 1–1.5 lakh', mid: 1.25 },
  { item: 'Comm hardware', proto: 'Rs 8–15k', station: 'Rs 0.5–1 lakh', mid: 0.75 },
  { item: 'Sensors', proto: 'Rs 5–10k', station: 'Rs 0.3–0.6 lakh', mid: 0.45 },
  { item: 'Software', proto: 'Open source', station: 'Dev + support', mid: 0 },
];
const IMPACT: { i: IconName; t: string }[] = [
  { i: 'radio', t: 'Restores emergency communication' },
  { i: 'package', t: 'Enables medical supply delivery' },
  { i: 'signal', t: 'Works without cellular infrastructure' },
  { i: 'sun', t: 'Operates off-grid' },
  { i: 'link', t: 'Decentralized and fault tolerant' },
  { i: 'mountain', t: 'Designed for mountain terrain' },
  { i: 'layers', t: 'Scalable to other disaster zones' },
];

export function Roadmap() {
  const a = useReveal<HTMLDivElement>();
  const b = useReveal<HTMLDivElement>({ delay: 0.1 });
  const maxMid = Math.max(...COSTS.map((c) => c.mid));
  return (
    <Chapter id="impact" label="14 · Prototype, roadmap and impact">
      <ChapterHeader no="14" kicker="Prototype, roadmap and impact" title="What the hackathon prototype proves, and what still has to be built.">
        The prototype demonstrates each subsystem. Full-scale deployment needs field testing, certified hardware and regulatory approval. Future capabilities below are planned work, not finished features.
      </ChapterHeader>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div ref={a} className="panel p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Prototype demonstration</h3>
            <Tag tone="go">We build this</Tag>
          </div>
          <ul className="mt-4 grid gap-2">
            {PROTO.map((t) => (
              <li key={t} className="flex gap-2.5 text-[15px] text-ink">
                <Icon name="check" size={16} className="mt-1 shrink-0 text-go" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div ref={b} className="panel border-dashed p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Full-scale deployment concept</h3>
            <Tag tone="amber">Planned engineering</Tag>
          </div>
          <ul className="mt-4 grid gap-2">
            {FULL.map((t) => (
              <li key={t} className="flex gap-2.5 text-[15px] text-mist">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full border border-amber" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-bold">Demonstration plan · 2–3 minutes live</h3>
          <span className="font-mono text-[12px] text-dim">this site runs all nine steps</span>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-9">
          {DEMO.map((t, i) => (
            <li key={t} className={`rounded-md border p-3 text-[14px] leading-snug ${i === 6 ? 'border-coral/70 bg-coral/[0.08] text-[#ffd5d0]' : 'border-line text-ink'}`}>
              <span className="num block font-mono text-[11px] text-amber">{String(i + 1).padStart(2, '0')}</span>
              {t}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="panel p-5">
          <h3 className="text-xl font-bold">Future scope</h3>
          <div className="mt-4 grid gap-3">
            {FUTURE.map((f) => (
              <div key={f.phase} className="grid grid-cols-[84px_1fr] gap-3 border-t border-line pt-3">
                <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-signal">{f.phase}</span>
                <ul className="grid gap-1">
                  {f.items.map((t) => (
                    <li key={t} className="flex items-center justify-between gap-2 text-[15px] text-mist">
                      {t} <Tag>Planned</Tag>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-[12px] text-dim">3 corridor stations → ~11 full-area → a regional lattice</p>
        </div>

        <div className="panel overflow-x-auto p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xl font-bold">Cost concept</h3>
            <Tag tone="amber">Conceptual estimate</Tag>
          </div>
          <table className="mt-3 w-full min-w-[480px] text-left text-[14px]">
            <thead>
              <tr className="label text-[10px]">
                <th className="py-1.5 font-normal">Item</th>
                <th className="py-1.5 font-normal">Prototype</th>
                <th className="py-1.5 font-normal">Per station</th>
                <th className="w-[34%] py-1.5 font-normal">Midpoint, Rs lakh</th>
              </tr>
            </thead>
            <tbody>
              {COSTS.map((c) => (
                <tr key={c.item} className="border-t border-line">
                  <td className="py-1.5 pr-2 text-ink">{c.item}</td>
                  <td className="num py-1.5 pr-2 font-mono text-[13px] text-mist">{c.proto}</td>
                  <td className="num py-1.5 pr-2 font-mono text-[13px] text-mist">{c.station}</td>
                  <td className="py-1.5">
                    {c.mid > 0 ? (
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 rounded-sm bg-amber" style={{ width: `${(c.mid / maxMid) * 100}%`, opacity: c.item === 'Drone' ? 1 : 0.6 }} />
                        <span className="num font-mono text-[12px] text-ink">{c.mid}</span>
                      </span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-dim">Rough ranges from the deck to show cost structure, not vendor quotations or procurement pricing. The drone dominates; stations and software are the smaller share.</p>
        </div>
      </div>

      <div className="mt-4 panel p-5">
        <h3 className="text-xl font-bold">Impact</h3>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {IMPACT.map((x) => (
            <li key={x.t} className="flex items-center gap-3 rounded-md border border-line p-3 text-[15px] text-ink">
              <Icon name={x.i} className="shrink-0 text-signal" />
              {x.t}
            </li>
          ))}
          <li className="flex items-start gap-3 rounded-md border border-amber/40 bg-amber/[0.06] p-3 text-[14px] text-[#f3dcc3]">
            <Icon name="alert" className="mt-0.5 shrink-0 text-amber" />
            Honest note: coverage depends on terrain line of sight, weather windows, station placement and the final radio and flight hardware. RescueMesh promises graceful degradation, not 100% connectivity.
          </li>
        </ul>
      </div>
    </Chapter>
  );
}
