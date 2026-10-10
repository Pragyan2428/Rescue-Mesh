import { useRef, useState } from 'react';
import { useSim, formatClock, SIM_SPEEDS } from '../../simulation/store';
import { activeMission } from '../../simulation/missionEngine';
import { commPath, linkId, linkUsable } from '../../simulation/networkGraph';
import { disableStation, reduceDroneBattery, resetDemo, restoreNormal, restoreStation, setCorridorBlocked, setHighWind, setLink, setPaused, setSpeed, startMission } from '../../simulation/failureScenarios';
import { MISSION_PRESETS } from '../../data/demoMissions';
import type { MissionStep, NodeId, SimState } from '../../simulation/types';
import { Viewport } from '../../scenes/core/Viewport';
import { createMissionScene, OPS_LABEL_IDS, type OpsView } from '../../scenes/MissionScene';
import { ChapterHeader } from '../layout/Chapter';
import { SceneFallback } from '../ui/SceneFallback';
import { Button, Meter, Segmented, SimBadge, Tag, Toggle } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { useReveal } from '../../hooks/useReveal';

const STEPS: { k: MissionStep; t: string }[] = [
  { k: 'request', t: 'Medical request created' },
  { k: 'received', t: 'Command center receives it' },
  { k: 'identify', t: 'Nearest feasible station identified' },
  { k: 'assign', t: 'Drone assigned' },
  { k: 'plan', t: 'Route planner finds a feasible route' },
  { k: 'checks', t: 'Battery and weather checks' },
  { k: 'depart', t: 'Drone departs' },
  { k: 'transit', t: 'Hops through intermediate docks' },
  { k: 'deliver', t: 'Medical payload delivered' },
  { k: 'confirm', t: 'Delivery confirmed over the mesh' },
  { k: 'return', t: 'Drone returns to a safe dock' },
  { k: 'logged', t: 'Mission log updated' },
];

const LABEL_TEXT: Record<string, string> = { CC: 'Command center', G: 'Gateway', S1: 'S1', S2: 'S2', S2b: 'S2b', S3: 'S3', INC: 'Casualty' };

export function statusTone(st: string) {
  return st === 'completed' ? 'go' : st === 'interrupted' ? 'coral' : st === 'holding' ? 'amber' : st === 'delivered' ? 'go' : 'signal';
}

function MissionConsole({ s, view, setView }: { s: SimState; view: OpsView; setView: (v: OpsView) => void }) {
  const [preset, setPreset] = useState('trauma');
  const m = activeMission(s);
  const d = m?.droneId ? s.drones.find((x) => x.id === m.droneId) : null;
  const busy = m && (m.status === 'active' || m.status === 'holding' || m.status === 'delivered');
  const sos = m?.sosMessageId ? s.messages.find((x) => x.id === m.sosMessageId) : null;
  const conf = m?.confirmMessageId ? s.messages.find((x) => x.id === m.confirmMessageId) : null;
  const cpath = commPath(s, 'S3', 'CC');
  const msgState = (x: typeof sos) => (!x ? '—' : x.state === 'delivered' ? `delivered via ${x.hops.join('→')}` : x.state === 'stored' ? `stored at ${x.at} (no path)` : x.state === 'mule' ? 'carried by drone' : `${x.state} at ${x.at}`);
  const stepIdx = m ? STEPS.findIndex((x) => x.k === m.step) : -1;

  return (
    <div className="grid gap-3">
      <div className="panel grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="label text-ink">Mission console</span>
          <SimBadge />
        </div>
        <fieldset className="grid gap-1.5" disabled={!!busy}>
          <legend className="label mb-1">Medical payload (≤ 5 kg design target)</legend>
          {MISSION_PRESETS.map((p) => (
            <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 ${preset === p.id ? 'border-amber/60 bg-amber/[0.06]' : 'border-line'} ${busy ? 'opacity-50' : ''}`}>
              <input type="radio" name="preset" value={p.id} checked={preset === p.id} onChange={() => setPreset(p.id)} className="mt-1 accent-amber" />
              <span className="grid">
                <span className="text-[15px] text-ink">
                  {p.label} · <span className="num font-mono">{p.payloadKg} kg</span> · {p.priority}
                </span>
                <span className="text-[13px] text-mist">{p.contents}. {p.note}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon="alert" disabled={!!busy} onClick={() => startMission(preset)}>
            Create Emergency Request
          </Button>
          <Button icon={s.paused ? 'play' : 'pause'} onClick={() => setPaused(!s.paused)}>
            {s.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="ghost" icon="reset" onClick={() => resetDemo()}>
            Reset
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented label="Simulation speed" value={String(s.speed)} onChange={(v) => setSpeed(Number(v))} options={SIM_SPEEDS.map((v) => ({ value: String(v), label: `${v}×` }))} />
          <Segmented
            label="3D camera"
            value={view}
            onChange={setView}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'follow', label: 'Follow' },
              { value: 'top', label: 'Top' },
            ]}
          />
        </div>
      </div>

      <div className={`panel p-4 ${m?.status === 'interrupted' ? 'border-coral/60' : m?.status === 'holding' ? 'border-amber/60' : ''}`} aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <span className="label">{m ? `${m.id} · ${m.label} · ${m.payloadKg} kg` : 'No active mission'}</span>
          {m && <Tag tone={statusTone(m.status) as 'go'}>{m.status}</Tag>}
        </div>
        <p className="mt-2 text-[15px] leading-snug text-ink">{m ? m.statusText : 'Create an emergency request to start the mission lifecycle.'}</p>
        <ol className="mt-3 grid gap-1">
          {STEPS.map((st, i) => {
            const done = m?.stepsDone.includes(st.k);
            const cur = m && i === stepIdx && !done && m.status !== 'completed';
            return (
              <li key={st.k} className={`flex items-center gap-2 text-[13px] ${done ? 'text-ink' : cur ? (m?.status === 'holding' ? 'text-amber' : m?.status === 'interrupted' ? 'text-coral' : 'text-signal') : 'text-dim'}`}>
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${done ? 'border-go bg-go/20 text-go' : cur ? 'border-current' : 'border-line'}`}>{done ? <Icon name="check" size={10} /> : cur ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}</span>
                <span className="num w-5 font-mono text-[11px] text-dim">{String(i + 1).padStart(2, '0')}</span>
                {st.t}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="panel grid gap-2 p-4 font-mono text-[13px]">
        <div className="flex justify-between gap-2">
          <span className="text-mist">Sim clock</span>
          <span className="num text-ink">{formatClock(s.clock)} IST</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-mist">Drone</span>
          <span className="text-ink">{d ? `${d.id} · ${d.state}${d.flight?.to ? ` → ${d.flight.to}` : d.at ? ` at ${d.at}` : ''}` : '—'}</span>
        </div>
        {d && (
          <div className="flex items-center gap-3">
            <Meter value={d.batteryPct} tone={d.batteryPct < 25 ? 'coral' : d.batteryPct < 45 ? 'amber' : 'go'} label="Drone battery" />
            <span className="num w-10 text-right">{Math.round(d.batteryPct)}%</span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="text-amber">Drone route</span>
          <span className="text-right text-ink">{s.plan?.feasible ? s.plan.route.join(' → ') : s.plan ? 'none feasible' : '—'}</span>
        </div>
        {s.previousPlan?.feasible && s.plan?.route.join() !== s.previousPlan.route.join() && (
          <div className="flex justify-between gap-2 text-dim">
            <span>Previous route</span>
            <span className="text-right line-through">{s.previousPlan.route.join(' → ')}</span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="text-signal">Radio path S3→CC</span>
          <span className={`text-right ${cpath ? 'text-ink' : 'text-coral'}`}>{cpath ? cpath.join(' → ') : 'none (store-and-forward)'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-mist">SOS</span>
          <span className="text-right text-ink">{msgState(sos)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-mist">Confirmation</span>
          <span className="text-right text-ink">{msgState(conf)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(['G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]).map((id) => (
            <span key={id} className={`rounded border px-1.5 py-0.5 text-[11px] ${s.stations[id].online ? 'border-go/40 text-go' : 'border-coral/60 text-coral'}`}>
              {id} {s.stations[id].online ? 'up' : 'down'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FailurePanel({ s }: { s: SimState }) {
  const head = useReveal<HTMLDivElement>();
  const m = activeMission(s);
  const s2s3 = s.links.find((l) => l.id === linkId('S2', 'S3'))!;
  const events = s.events.slice(-14).reverse();
  return (
    <div id="failure" data-chapter="10 · Failure demonstration" className="grid scroll-mt-20 gap-3 pt-10">
      <div ref={head} className="grid gap-3">
        <div className="flex items-center gap-3">
          <span className="chapter-no">10</span>
          <span className="h-px w-8 bg-amber/60" aria-hidden="true" />
          <span className="label">Failure demonstration</span>
        </div>
        <h2 className="text-[clamp(1.8rem,3.6vw,2.8rem)] font-bold leading-[1.04]">Built to adapt when something fails.</h2>
        <p className="text-[16px] leading-relaxed text-mist">Start a mission, then break the network while the drone is in the air. The planner either finds a feasible alternative or the mission degrades and says why. Try a 5 kg pack with S2 down: there is no feasible hop through S2b at that weight.</p>
      </div>
      <div className="panel grid gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="label text-ink">Inject failures</span>
          {!m && (
            <Button size="sm" variant="primary" icon="play" onClick={() => startMission('trauma')}>
              Start reference mission
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle on={!s.stations.S2.online} onChange={(v) => (v ? disableStation('S2') : restoreStation('S2'))} tone="coral" icon="power">
            Disable Station S2
          </Toggle>
          <Toggle on={!s2s3.up} onChange={(v) => setLink('S2', 'S3', !v)} tone="coral" icon="unlink">
            Break the S2–S3 link
          </Toggle>
          <Toggle on={s.conditions.highWind} onChange={setHighWind} tone="coral" icon="wind">
            Simulate high wind
          </Toggle>
          <Toggle on={s.conditions.corridorBlocked} onChange={setCorridorBlocked} tone="coral" icon="fence">
            Block terrain corridor
          </Toggle>
          <Button variant="danger" size="sm" icon="battery" onClick={() => reduceDroneBattery()}>
            Reduce drone battery
          </Button>
          <Button variant="signal" size="sm" icon="check" onClick={() => restoreNormal()}>
            Restore normal conditions
          </Button>
        </div>
        <Button variant="secondary" icon="reset" onClick={() => resetDemo()}>
          Reset the entire demo
        </Button>
        <p className="text-[12px] text-dim">Link S2–S3 is radio only: breaking it reroutes messages but does not block the drone’s flight corridor. Blocking the terrain corridor does the opposite.</p>
      </div>
      <div className="panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Operator event log</span>
          <span className="font-mono text-[11px] text-dim">sim clock</span>
        </div>
        <ol className="grid max-h-[300px] gap-1 overflow-y-auto pr-1 font-mono text-[12px] leading-snug" aria-live="polite">
          {events.map((e) => (
            <li key={e.id} className={e.kind === 'fail' ? 'text-coral' : e.kind === 'warn' ? 'text-amber' : e.kind === 'ok' ? 'text-go' : e.kind === 'route' ? 'text-[#ffd7a8]' : e.kind === 'msg' ? 'text-signal' : 'text-mist'}>
              <span className="text-dim">{formatClock(e.t)}</span> {e.text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function MissionOps() {
  const s = useSim();
  const [view, setViewState] = useState<OpsView>('overview');
  const viewRef = useRef<{ current: OpsView }>({ current: 'overview' });
  const labels = useRef(new Map<string, HTMLElement>());
  const setView = (v: OpsView) => {
    viewRef.current.current = v;
    setViewState(v);
  };
  const usable = s.links.filter((l) => linkUsable(s, l)).length;

  return (
    <section id="simulation" data-chapter="09 · Medical rescue mission" className="relative z-10 border-t border-line/60 bg-night">
      <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 md:py-28 lg:px-10">
        <ChapterHeader no="09" kicker="Live simulation · medical rescue mission" title="From SOS to confirmation, step by step.">
          Create an emergency request and follow it through the shared simulation: the SOS crosses the mesh (cyan), the planner picks docks, and the drone hops with its payload (amber). Pause, resume or reset at any time. This page does not dispatch hardware or contact emergency services.
        </ChapterHeader>

        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="lg:sticky lg:top-20 lg:h-[calc(100svh-6.5rem)]">
            <div className="relative h-[58vh] min-h-[380px] overflow-hidden rounded-xl border border-line bg-surface lg:h-full">
              <Viewport
                className="h-full w-full"
                interactive
                label="Live 3D operations view of stations, links, drones and messages"
                loadingLabel="Loading the operations twin"
                fallback={<SceneFallback title="The live 3D view needs WebGL 2." note="The console, log and dashboard still run the full simulation." />}
                factory={(ctx) => createMissionScene(ctx, labels.current, { view: viewRef.current })}
              >
                <div className="pointer-events-none absolute inset-0">
                  {OPS_LABEL_IDS.map((id) => {
                    const off = id !== 'INC' && !s.stations[id as NodeId].online;
                    return (
                      <div
                        key={id}
                        ref={(el) => {
                          if (el) labels.current.set(id, el);
                        }}
                        className={`scene-label ${off ? 'border-coral/70 text-coral' : id === 'INC' ? 'border-amber/60 text-amber' : 'border-line'}`}
                      >
                        {LABEL_TEXT[id]}
                        {off ? ' · failed' : ''}
                      </div>
                    );
                  })}
                </div>
                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                  <SimBadge />
                </div>
                <div className="absolute bottom-3 left-3 grid gap-1 rounded-md border border-line bg-night/85 px-3 py-2 font-mono text-[11px] text-mist">
                  <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-signal" /> Mesh radio links ({usable}/{s.links.length} up)</span>
                  <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-amber" /> Drone route / flight</span>
                  <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-coral" /> Failed link or blocked segment</span>
                </div>
              </Viewport>
            </div>
          </div>
          <div className="grid content-start gap-3">
            <MissionConsole s={s} view={view} setView={setView} />
            <FailurePanel s={s} />
          </div>
        </div>
      </div>
    </section>
  );
}
