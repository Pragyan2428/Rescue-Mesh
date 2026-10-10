import { useCallback, useState } from 'react';
import { useSim, formatClock } from '../../simulation/store';
import { reachableSet, linkUsable } from '../../simulation/networkGraph';
import { acknowledgeAlert, acknowledgeAll, resetDemo, selectStation } from '../../simulation/failureScenarios';
import type { EventKind, NodeId, SimState } from '../../simulation/types';
import { Chapter, ChapterHeader } from '../layout/Chapter';
import { Button, Meter, SimBadge, Tag } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { OpsMap } from './OpsMap';
import { statusTone } from '../interactions/MissionOps';

const FILTERS: { id: string; label: string; kinds: EventKind[] }[] = [
  { id: 'all', label: 'All', kinds: ['info', 'ok', 'warn', 'fail', 'msg', 'drone', 'route'] },
  { id: 'fail', label: 'Failures', kinds: ['fail', 'warn'] },
  { id: 'route', label: 'Routing', kinds: ['route'] },
  { id: 'drone', label: 'Drones', kinds: ['drone'] },
  { id: 'msg', label: 'Messages', kinds: ['msg', 'ok'] },
];

function StationCard({ s, id }: { s: SimState; id: NodeId }) {
  const st = s.stations[id];
  const links = s.links.filter((l) => l.a === id || l.b === id);
  const up = links.filter((l) => linkUsable(s, l)).length;
  const sel = s.selectedStation === id;
  const dock = st.dockOccupiedBy ? s.drones.find((d) => d.id === st.dockOccupiedBy) : null;
  const state = !st.online ? 'Offline' : st.powerMode === 'shed' ? 'Load shedding' : 'Normal';
  return (
    <button type="button" aria-pressed={sel} onClick={() => selectStation(sel ? null : id)} className={`grid gap-2 rounded-lg border p-3 text-left transition-colors ${sel ? 'border-ink/60 bg-raised' : !st.online ? 'border-coral/60 bg-coral/[0.05]' : 'border-line bg-surface hover:border-mist/50'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[14px] font-medium text-ink">{st.name}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${!st.online ? 'bg-coral' : st.powerMode === 'shed' || !st.tiltOk ? 'bg-amber' : 'bg-go'}`} aria-label={state} />
      </div>
      <div className="flex items-center gap-2">
        <Meter value={st.batteryPct} tone={st.batteryPct < 25 ? 'coral' : st.batteryPct < 45 ? 'amber' : 'go'} label={`${id} battery`} />
        <span className="num w-10 text-right font-mono text-[12px]">{Math.round(st.batteryPct)}%</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[11px]">
        <dt className="text-dim">Power</dt>
        <dd className={!st.online ? 'text-coral' : st.powerMode === 'shed' ? 'text-amber' : 'text-ink'}>{state}</dd>
        <dt className="text-dim">Wind</dt>
        <dd className={st.windKmh > 40 ? 'text-coral' : 'text-ink'}>{Math.round(st.windKmh)} km/h</dd>
        <dt className="text-dim">Temp / tilt</dt>
        <dd className={st.tiltOk ? 'text-ink' : 'text-amber'}>
          {Math.round(st.tempC)}°C / {st.tiltOk ? 'OK' : 'ALERT'}
        </dd>
        <dt className="text-dim">Links</dt>
        <dd className={up < links.length ? 'text-amber' : 'text-ink'}>
          {up}/{links.length} up
        </dd>
        <dt className="text-dim">Dock</dt>
        <dd className="text-ink">{!st.online ? 'unavailable' : dock ? `${dock.id} ${dock.state}` : 'free'}</dd>
      </dl>
      {st.faults.length > 0 && <span className="font-mono text-[11px] text-coral">⚠ {st.faults.join(', ')}</span>}
    </button>
  );
}

export function OpsDashboard() {
  const s = useSim();
  const [filter, setFilter] = useState('all');
  const [inspect, setInspect] = useState<string | null>(null);
  const reach = reachableSet(s, 'CC');
  const openAlerts = s.alerts.filter((a) => !a.acknowledged);
  const queued = s.messages.filter((m) => m.state === 'queued' || m.state === 'stored').length;
  const active = s.missions.filter((m) => m.status === 'active' || m.status === 'holding' || m.status === 'delivered').length;
  const kinds = FILTERS.find((f) => f.id === filter)!.kinds;
  const events = s.events.filter((e) => kinds.includes(e.kind)).slice(-40).reverse();
  const onSelect = useCallback((id: NodeId | null) => selectStation(id), []);
  const im = s.missions.find((m) => m.id === inspect) ?? s.missions.find((m) => m.id === s.activeMissionId) ?? null;

  return (
    <Chapter id="operations" label="11 · Operations dashboard">
      <ChapterHeader no="11" kicker="Live simulation · operations dashboard" title="One picture of the network, from the same state as the 3D twin.">
        Every panel here reads the same simulation as the mission view above. Fail a station there and it shows up here, on the map, in the route and in the log. Select a station to highlight it everywhere.
      </ChapterHeader>

      <div className="mt-10 overflow-hidden rounded-xl border border-line bg-[#0A1622]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-surface px-4 py-3 font-mono text-[12px]">
          <span className="flex items-center gap-2 text-ink">
            <Icon name="activity" size={15} className="text-signal" /> RESCUEMESH OPS
          </span>
          <span className={s.stations.G.online ? 'text-go' : 'text-coral'}>GATEWAY {s.stations.G.online ? 'UP' : 'DOWN'}</span>
          <span className="text-mist">
            REACHABLE <span className="text-ink">{reach.size}/6</span>
          </span>
          <span className="text-mist">
            LINKS <span className="text-ink">{s.links.filter((l) => linkUsable(s, l)).length}/{s.links.length}</span>
          </span>
          <span className="text-mist">
            MISSIONS <span className="text-ink">{active}</span>
          </span>
          <span className="text-mist">
            QUEUED <span className="text-ink">{queued}</span>
          </span>
          <span className={openAlerts.length ? 'text-amber' : 'text-mist'}>
            ALERTS <span>{openAlerts.length}</span>
          </span>
          <span className="num text-ink">{formatClock(s.clock)} IST</span>
          <span className="ml-auto flex items-center gap-2">
            <SimBadge />
            <Button size="sm" icon="reset" variant="secondary" onClick={() => resetDemo()}>
              Reset Demo
            </Button>
          </span>
        </div>

        <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-px bg-line">
            <div className="relative h-[340px] bg-[#0A1622] md:h-[460px]">
              <OpsMap onSelect={onSelect} />
              <div className="pointer-events-none absolute right-2 top-2 grid gap-0.5 rounded bg-night/80 px-2 py-1.5 font-mono text-[10px] text-mist">
                <span><span className="text-signal">- -</span> radio link · <span className="text-coral">x</span> failed</span>
                <span><span className="text-amber">—</span> current route · <span className="text-[#9aa6b2]">- -</span> previous</span>
                <span><span className="text-coral">○</span> 15 km blackout · ▲ drone</span>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 content-start gap-px bg-line">
            <div className="min-w-0 bg-[#0A1622] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="label">Mission queue</span>
                <span className="font-mono text-[11px] text-dim">click to inspect</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-left font-mono text-[12px]">
                  <thead className="text-dim">
                    <tr>
                      <th className="py-1 pr-2 font-normal">ID</th>
                      <th className="py-1 pr-2 font-normal">Pri</th>
                      <th className="py-1 pr-2 font-normal">kg</th>
                      <th className="py-1 pr-2 font-normal">Drone</th>
                      <th className="py-1 pr-2 font-normal">State</th>
                      <th className="py-1 pr-2 font-normal">Next</th>
                      <th className="py-1 font-normal">Route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.missions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-3 text-dim">
                          No requests yet. Create one in the mission console.
                        </td>
                      </tr>
                    )}
                    {s.missions
                      .slice()
                      .reverse()
                      .map((m) => {
                        const d = s.drones.find((x) => x.id === m.droneId);
                        const isActive = m.id === s.activeMissionId;
                        return (
                          <tr key={m.id} onClick={() => setInspect(m.id)} className={`cursor-pointer border-t border-line ${im?.id === m.id ? 'bg-raised' : 'hover:bg-raised/50'}`}>
                            <td className="py-1.5 pr-2 text-ink">{m.id}</td>
                            <td className="py-1.5 pr-2 text-coral">{m.priority}</td>
                            <td className="py-1.5 pr-2">{m.payloadKg}</td>
                            <td className="py-1.5 pr-2">{m.droneId ?? '—'}</td>
                            <td className="py-1.5 pr-2">
                              <Tag tone={statusTone(m.status) as 'go'}>{m.status}</Tag>
                            </td>
                            <td className="py-1.5 pr-2">{d?.flight?.to ?? (d?.flight ? 'drop' : d?.at ?? '—')}</td>
                            <td className={`py-1.5 ${isActive && s.plan && !s.plan.feasible ? 'text-coral' : 'text-amber'}`}>{isActive && s.plan ? (s.plan.feasible ? s.plan.route.join('→') : 'no feasible') : '—'}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {im && (
                <div className="mt-3 rounded-md border border-line p-3 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-ink">
                      {im.id} · {im.label}
                    </span>
                    <span className="font-mono text-[11px] text-dim">created {formatClock(im.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-mist">{im.statusText}</p>
                  <p className="mt-1 font-mono text-[11px] text-dim">steps done: {im.stepsDone.length}/12 · target dock {im.target ?? '—'} · delivered {im.delivered ? 'yes' : 'no'} · confirmed {im.confirmed ? 'yes' : 'no'}</p>
                </div>
              )}
            </div>

            <div className="min-w-0 bg-[#0A1622] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="label">Alerts</span>
                {openAlerts.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => acknowledgeAll()}>
                    Acknowledge all
                  </Button>
                )}
              </div>
              <ul className="grid gap-1.5">
                {s.alerts.length === 0 && <li className="font-mono text-[12px] text-dim">No alerts.</li>}
                {s.alerts
                  .slice(-6)
                  .reverse()
                  .map((a) => (
                    <li key={a.id} className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 font-mono text-[12px] ${a.acknowledged ? 'border-line text-dim' : a.severity === 'critical' ? 'border-coral/60 text-coral' : 'border-amber/50 text-amber'}`}>
                      <span>
                        <span className="text-dim">{formatClock(a.t)}</span> {a.text}
                      </span>
                      {!a.acknowledged ? (
                        <button type="button" onClick={() => acknowledgeAlert(a.id)} className="min-h-[28px] rounded border border-current px-2 text-[11px]">
                          ACK
                        </button>
                      ) : (
                        <span className="text-[11px]">acked</span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>

            <div className="min-w-0 bg-[#0A1622] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="label">Event log</span>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Filter events">
                  {FILTERS.map((f) => (
                    <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`min-h-[28px] rounded px-2 font-mono text-[11px] ${filter === f.id ? 'bg-raised text-ink' : 'text-dim hover:text-ink'}`}>
                      <Icon name="filter" size={10} className="mr-1 inline" />
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <ol className="grid max-h-[260px] gap-1 overflow-y-auto pr-1 font-mono text-[12px] leading-snug">
                {events.map((e) => (
                  <li key={e.id} className={e.kind === 'fail' ? 'text-coral' : e.kind === 'warn' ? 'text-amber' : e.kind === 'ok' ? 'text-go' : e.kind === 'route' ? 'text-[#ffd7a8]' : e.kind === 'msg' ? 'text-signal' : 'text-mist'}>
                    <span className="text-dim">{formatClock(e.t)}</span> {e.text}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-line bg-[#0A1622] p-3 sm:grid-cols-3 lg:grid-cols-5">
          {(['G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]).map((id) => (
            <StationCard key={id} s={s} id={id} />
          ))}
        </div>
      </div>
    </Chapter>
  );
}
