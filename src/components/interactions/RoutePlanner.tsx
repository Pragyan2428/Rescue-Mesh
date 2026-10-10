import { useMemo, useRef, useState } from 'react';
import { useSim } from '../../simulation/store';
import { evaluateHop, planRoute, hopBudgetPct } from '../../simulation/routePlanner';
import { disableStation, restoreStation, setCorridorBlocked } from '../../simulation/failureScenarios';
import type { EdgeEval, HopPlan, NodeId, SimState } from '../../simulation/types';
import { Viewport } from '../../scenes/core/Viewport';
import { createRouteScene, type RouteSceneInput } from '../../scenes/RouteScene';
import { SYSTEM, WORLD } from '../../data/systemConstants';
import { elevationM, yToElev } from '../../utils/terrainField';
import { Chapter, ChapterHeader } from '../layout/Chapter';
import { SceneFallback } from '../ui/SceneFallback';
import { Segmented, SimBadge, Slider, Tag, Toggle } from '../ui/controls';

const CANDIDATES: { id: string; route: NodeId[] }[] = [
  { id: 'A', route: ['G', 'S1', 'S2', 'S3'] },
  { id: 'B', route: ['G', 'S1', 'S2b', 'S3'] },
  { id: 'C', route: ['G', 'S2', 'S3'] },
  { id: 'D', route: ['G', 'S3'] },
];

interface Candidate {
  id: string;
  route: NodeId[];
  hops: (HopPlan | null)[];
  evals: EdgeEval[];
  km: number;
  maxHop: number;
  minArrive: number;
  maxWind: number;
  risk: number;
  feasible: boolean;
  reason: string;
}

function evaluateRoute(s: SimState, route: NodeId[], payload: number): Omit<Candidate, 'id'> {
  const hops: (HopPlan | null)[] = [];
  const evals: EdgeEval[] = [];
  for (let i = 1; i < route.length; i++) {
    const { hop, ev } = evaluateHop(s, route[i - 1], route[i], { payloadKg: payload, departBattery: 100 });
    hops.push(hop);
    evals.push(ev);
  }
  const bad = evals.find((e) => e.verdict !== 'ok');
  const real = hops.filter((h): h is HopPlan => !!h);
  return {
    route,
    hops,
    evals,
    km: evals.reduce((a, e) => a + e.distanceKm, 0),
    maxHop: Math.max(...evals.map((e) => e.energyPct)),
    minArrive: Math.min(...evals.map((e) => 100 - e.energyPct)),
    maxWind: Math.max(...real.map((h) => h.windKmh), 0),
    risk: Math.max(...real.map((h) => h.maxRisk), 0),
    feasible: !bad,
    reason: bad ? `${bad.from}→${bad.to}: ${bad.detail}` : 'All hops within budget',
  };
}

function Profile({ hops }: { hops: HopPlan[] }) {
  const pts: { d: number; fly: number; ground: number }[] = [];
  let d = 0;
  let prev: { x: number; z: number } | null = null;
  for (const h of hops) {
    for (const p of h.profile) {
      const x = p.x / WORLD.unitsPerKm;
      const z = p.z / WORLD.unitsPerKm;
      if (prev) d += Math.hypot(x - prev.x, z - prev.z);
      prev = { x, z };
      pts.push({ d, fly: yToElev(p.y), ground: elevationM(x, z) });
    }
  }
  if (pts.length < 2) return <p className="text-[14px] text-mist">No feasible route to profile.</p>;
  const W = 600;
  const H = 150;
  const maxD = pts[pts.length - 1].d;
  const lo = Math.min(...pts.map((p) => p.ground)) - 100;
  const hi = Math.max(...pts.map((p) => p.fly)) + 100;
  const X = (v: number) => 34 + (v / maxD) * (W - 44);
  const Y = (e: number) => 12 + (1 - (e - lo) / (hi - lo)) * (H - 34);
  const ground = `M${X(0)},${H - 22} ` + pts.map((p) => `L${X(p.d).toFixed(1)},${Y(p.ground).toFixed(1)}`).join(' ') + ` L${X(maxD)},${H - 22} Z`;
  const fly = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.fly).toFixed(1)}`).join(' ');
  const ticks = [lo + 100, (lo + hi) / 2, hi - 100].map((e) => Math.round(e / 100) * 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Elevation profile of the selected route over ${maxD.toFixed(1)} km. The flight line stays above the terrain at all points.`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1="34" x2={W - 10} y1={Y(t)} y2={Y(t)} stroke="#1E3347" />
          <text x="30" y={Y(t) + 4} textAnchor="end" fontSize="10" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
            {t}
          </text>
        </g>
      ))}
      <path d={ground} fill="#2A3440" stroke="#5D7387" strokeWidth="1" />
      <path d={fly} fill="none" stroke="#FF9E43" strokeWidth="2.5" />
      <text x={W - 10} y={H - 6} textAnchor="end" fontSize="10" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
        {maxD.toFixed(1)} km · m above sea level (model)
      </text>
    </svg>
  );
}

export function RoutePlanner() {
  const s = useSim();
  const [payload, setPayload] = useState(3);
  const [windMode, setWindMode] = useState<'live' | 'set'>('live');
  const [wind, setWind] = useState(28);
  const input = useRef<RouteSceneInput>({ key: '', edges: [], chosen: [], alternative: [], blocked: false, offline: [] });
  const labels = useRef(new Map<string, HTMLElement>());
  const lastChosen = useRef<string>('');
  const replanNote = useRef<string>('');

  const onlineKey = (Object.keys(s.stations) as NodeId[]).map((id) => (s.stations[id].online ? '1' : '0')).join('');
  const liveWindKey = windMode === 'live' ? (['G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]).map((id) => Math.round(s.stations[id].windKmh / 4)).join(',') : String(wind);
  const data = useMemo(() => {
    const what: SimState = windMode === 'live' ? s : { ...s, stations: Object.fromEntries(Object.entries(s.stations).map(([k, v]) => [k, { ...v, windKmh: wind }])) as SimState['stations'] };
    const plan = planRoute(what, 'G', 'S3', payload, 100);
    const cands: Candidate[] = CANDIDATES.map((c) => ({ id: c.id, ...evaluateRoute(what, c.route, payload) }));
    return { plan, cands };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, windMode, wind, liveWindKey, onlineKey, s.conditions.corridorBlocked]);

  const chosenKey = data.plan.feasible ? data.plan.route.join('>') : 'none';
  if (chosenKey !== lastChosen.current) {
    const prev = lastChosen.current;
    if (prev && prev !== chosenKey) replanNote.current = prev === 'none' ? `Feasible route found again: ${data.plan.route.join(' → ')}` : chosenKey === 'none' ? `Replanning: ${prev.split('>').join(' → ')} is no longer feasible and no replacement exists` : `Replanned: ${prev.split('>').join(' → ')} → now ${data.plan.route.join(' → ')}`;
    lastChosen.current = chosenKey;
  }
  const chosenCand = data.cands.find((c) => c.route.join('>') === chosenKey);
  const alt = data.cands.filter((c) => c.route.join('>') !== chosenKey && c.hops.every(Boolean)).sort((a, b) => Number(b.feasible) - Number(a.feasible) || a.km - b.km)[0];
  input.current = {
    key: `${chosenKey}|${alt?.id}|${payload}|${liveWindKey}|${onlineKey}|${s.conditions.corridorBlocked}`,
    edges: data.plan.evaluated,
    chosen: data.plan.hops,
    alternative: alt ? (alt.hops as HopPlan[]) : [],
    blocked: s.conditions.corridorBlocked,
    offline: (Object.keys(s.stations) as NodeId[]).filter((id) => !s.stations[id].online),
  };
  const riskLabel = (r: number) => (r >= 0.6 ? 'High' : r >= 0.25 ? 'Moderate' : 'Low');

  return (
    <Chapter id="routing" label="07 · Route-planning digital twin">
      <ChapterHeader no="07" kicker="Technology · route planning" title="The shortest line is rarely the cheapest flight.">
        Level 1 picks which docks to hop through (Dijkstra over the dock graph). Level 2 plans each hop across the terrain (A* with distance, climb, payload, headwind and risk costs). When a hop turns unsafe the drone replans from where it is. Every value below comes from the configured model, not flight tests.
      </ChapterHeader>

      <div className="mt-10 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative overflow-hidden rounded-xl border border-line bg-surface">
          <Viewport
            className="h-[56vh] min-h-[400px] w-full"
            interactive
            label="3D terrain route planner"
            loadingLabel="Computing terrain grid"
            fallback={<SceneFallback title="The 3D twin needs WebGL 2." note="The route comparison and elevation profile still update." />}
            factory={(ctx) => createRouteScene(ctx, { input, labels: labels.current })}
          >
            <div className="pointer-events-none absolute inset-0">
              {(['G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]).map((id) => (
                <div
                  key={id}
                  ref={(el) => {
                    if (el) labels.current.set(id, el);
                  }}
                  className={`scene-label ${s.stations[id].online ? 'border-line' : 'border-coral/70 text-coral'}`}
                >
                  {id}
                  {!s.stations[id].online ? ' · offline' : ''}
                </div>
              ))}
            </div>
            <div className="absolute left-3 top-3 grid gap-1.5 rounded-md border border-line bg-night/85 p-2.5 font-mono text-[11px] text-mist">
              <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-amber" /> Chosen route (A* over terrain)</span>
              <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-[#9aa6b2]" /> Alternative / previous route</span>
              <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-[#ffd7a8]" /> Feasible dock-graph edge</span>
              <span className="flex items-center gap-2"><span className="h-0.5 w-5 border-t-2 border-dashed border-coral" /> Infeasible edge</span>
            </div>
          </Viewport>
        </div>

        <aside className="grid content-start gap-3">
          <div className="panel grid gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="label">Planner inputs</span>
              <SimBadge className="!text-[9px]" />
            </div>
            <Slider id="r-payload" label="Payload" value={payload} min={0.5} max={5} step={0.5} onChange={setPayload} format={(v) => `${v} kg`} />
            <div className="flex items-center justify-between gap-2">
              <span className="label">Wind</span>
              <Segmented
                label="Wind source"
                value={windMode}
                onChange={setWindMode}
                options={[
                  { value: 'live', label: 'Live sim' },
                  { value: 'set', label: 'Override' },
                ]}
              />
            </div>
            {windMode === 'set' && <Slider id="r-wind" label="Wind at every station" value={wind} min={0} max={60} step={1} onChange={setWind} format={(v) => `${v} km/h`} note={`Drones hold above ${SYSTEM.droneWindLimitKmh} km/h (assumed limit).`} />}
            <div className="grid grid-cols-2 gap-2">
              <Toggle on={s.conditions.corridorBlocked} onChange={setCorridorBlocked} tone="coral" icon="fence">
                Block terrain corridor
              </Toggle>
              <Toggle on={!s.stations.S2.online} onChange={(v) => (v ? disableStation('S2') : restoreStation('S2'))} tone="coral" icon="power">
                Disable S2
              </Toggle>
            </div>
            <p className="text-[12px] leading-snug text-dim">Hop rule: a hop is feasible if the drone could fly it and still return with the {SYSTEM.batteryReservePct}% reserve, so one-way energy ≤ {hopBudgetPct(100)}% of the battery. Corridor and S2 toggles change the shared simulation.</p>
          </div>

          <div className={`panel p-4 ${data.plan.feasible ? '' : 'border-coral/60'}`} aria-live="polite">
            <span className="label">{data.plan.feasible ? 'Selected route (Level 1 Dijkstra)' : 'No feasible route'}</span>
            <p className={`mt-1 font-mono text-[15px] ${data.plan.feasible ? 'text-amber' : 'text-coral'}`}>{data.plan.feasible ? data.plan.route.join(' → ') : data.plan.reason}</p>
            {data.plan.feasible && (
              <p className="mt-1 text-[13px] text-mist">
                {data.plan.totalKm.toFixed(1)} km flown over terrain in {data.plan.hops.length} hops · recharge at each dock
              </p>
            )}
            {replanNote.current && <p className="mt-2 rounded border border-amber/30 bg-amber/[0.06] px-2 py-1.5 text-[13px] text-[#f3dcc3]">{replanNote.current} (D* Lite-style replanning, simplified as a re-search)</p>}
          </div>
        </aside>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="panel overflow-x-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">Route comparison</span>
            <Tag tone="signal">Model output</Tag>
          </div>
          <table className="w-full min-w-[620px] text-left text-[14px]">
            <thead>
              <tr className="label text-[10px]">
                <th className="py-2 pr-3 font-normal">Route</th>
                <th className="py-2 pr-3 font-normal">Distance</th>
                <th className="py-2 pr-3 font-normal">Worst hop energy</th>
                <th className="py-2 pr-3 font-normal">Lowest reserve on arrival</th>
                <th className="py-2 pr-3 font-normal">Weather</th>
                <th className="py-2 pr-3 font-normal">Terrain risk</th>
                <th className="py-2 font-normal">Feasibility</th>
              </tr>
            </thead>
            <tbody>
              {data.cands.map((c) => {
                const chosen = c.route.join('>') === chosenKey;
                return (
                  <tr key={c.id} className={`border-t border-line ${chosen ? 'bg-amber/[0.06]' : ''}`}>
                    <td className="py-2 pr-3 font-mono text-[13px]">
                      <span className={chosen ? 'text-amber' : 'text-ink'}>{c.route.join('→')}</span>
                      {chosen && <span className="ml-2 text-[10px] uppercase text-amber">chosen</span>}
                    </td>
                    <td className="num py-2 pr-3 font-mono text-[13px]">{c.km.toFixed(1)} km</td>
                    <td className={`num py-2 pr-3 font-mono text-[13px] ${c.maxHop > hopBudgetPct(100) ? 'text-coral' : ''}`}>{c.maxHop.toFixed(0)}%</td>
                    <td className={`num py-2 pr-3 font-mono text-[13px] ${c.minArrive < 100 - hopBudgetPct(100) ? 'text-coral' : ''}`}>{Math.max(0, c.minArrive).toFixed(0)}%</td>
                    <td className={`py-2 pr-3 font-mono text-[13px] ${c.maxWind > SYSTEM.droneWindLimitKmh ? 'text-coral' : 'text-go'}`}>{c.maxWind > SYSTEM.droneWindLimitKmh ? `Hold · ${c.maxWind.toFixed(0)} km/h` : `Go · ${c.maxWind.toFixed(0)} km/h`}</td>
                    <td className="py-2 pr-3 font-mono text-[13px]">{c.hops.every(Boolean) ? riskLabel(c.risk) : '—'}</td>
                    <td className={`py-2 text-[13px] ${c.feasible ? 'text-go' : 'text-coral'}`}>{c.feasible ? 'Feasible' : <span title={c.reason}>No · {c.reason.split(':')[0]}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-dim">Distances follow the A* terrain path, not the straight line. Worst hop energy above {hopBudgetPct(100)}% breaks the out-and-back reserve rule. Hover a “No” for the reason.</p>
        </div>
        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Level 2 · elevation profile</span>
            <Tag>Conceptual terrain</Tag>
          </div>
          <Profile hops={data.plan.hops} />
          <p className="mt-2 text-[13px] text-mist">The amber flight line keeps {SYSTEM.flightClearanceM} m clearance over the ridges and stays below the assumed {3900} m ceiling, so the planner detours around peaks instead of flying through them.</p>
          {chosenCand && <p className="mt-1 text-[12px] text-dim">Climb per hop: {data.plan.hops.map((h) => `${h.from}→${h.to} ${Math.round(h.climbM)} m`).join(' · ')}</p>}
        </div>
      </div>
    </Chapter>
  );
}
