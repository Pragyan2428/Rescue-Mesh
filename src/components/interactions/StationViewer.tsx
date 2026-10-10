import { useCallback, useRef, useState } from 'react';
import { Viewport } from '../../scenes/core/Viewport';
import { createStationScene, LABEL_PARTS, type DemoPhase, type StationViewerState } from '../../scenes/StationScene';
import type { PartKey } from '../../models/DockingStation';
import { PARTS, SUBSYSTEMS } from '../../data/stationParts';
import { Chapter, ChapterHeader } from '../layout/Chapter';
import { Button, Tag, Toggle } from '../ui/controls';
import { SceneFallback } from '../ui/SceneFallback';

const PHASE_TEXT: Record<DemoPhase, string> = {
  idle: 'Ready. Press “Show how it works” to land a drone.',
  approach: 'Approach: the drone flies a stabilised descent path toward the dock.',
  descent: 'Descent: vertical landing into the sheltered bay, doors open.',
  centering: 'Centring: sloped guides push the skids onto the contact strips.',
  charging: 'Charging through the pad contacts (sheltered bay).',
  ready: 'Charged. Pre-flight checks: battery, weather, payload latch.',
  takeoff: 'Departing for the next hop.',
};

export function StationViewer() {
  const state = useRef<StationViewerState>({ explode: 0, cutaway: false, emphasis: null, isolate: false, braked: false, doorsClosed: false, windKmh: 24, resetTick: 0, demoTick: 0, nudge: { tick: 0, yaw: 0, zoom: 1 } });
  const labels = useRef(new Map<string, HTMLElement>());
  const [sub, setSub] = useState<string | null>(null);
  const [part, setPart] = useState<PartKey | null>('pad');
  const [exploded, setExploded] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [braked, setBraked] = useState(false);
  const [closed, setClosed] = useState(false);
  const [phase, setPhase] = useState<{ p: DemoPhase; charge: number }>({ p: 'idle', charge: 0.32 });

  const apply = (patch: Partial<StationViewerState>) => Object.assign(state.current, patch);
  const subsystem = SUBSYSTEMS.find((s) => s.id === sub) ?? null;
  const shownLabels: PartKey[] = subsystem ? subsystem.keys : part ? [part] : [];
  // keep the scene's label visibility in sync with React state
  for (const k of LABEL_PARTS) {
    const el = labels.current.get(k);
    if (el) el.dataset.show = shownLabels.includes(k) || exploded ? '1' : '0';
  }

  const chooseSub = (id: string | null) => {
    setSub(id);
    const s = SUBSYSTEMS.find((x) => x.id === id);
    apply({ emphasis: s ? s.keys : part ? [part] : null });
    if (s) setPart(s.keys[0]);
  };
  const choosePart = useCallback((k: PartKey | null) => {
    setPart(k);
    setSub(null);
    apply({ emphasis: k ? [k] : null });
  }, []);
  const nudge = (yaw: number, zoom: number) => apply({ nudge: { tick: state.current.nudge.tick + 1, yaw, zoom } });

  const info = part ? PARTS[part] : null;

  return (
    <Chapter id="solution" label="04 · The docking station">
      <ChapterHeader no="04" kicker="Our solution · the docking station" title="One station, two jobs: a lifeline for drones and a relay for messages.">
        Each RescueMesh station lands, shelters and charges drones, and forwards mesh traffic, on wind, solar and battery power. Drag to rotate, scroll or use the buttons to zoom, and select any part to inspect it.
      </ChapterHeader>

      <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative self-start overflow-hidden rounded-xl border border-line bg-surface">
          <Viewport
            className="h-[62vh] min-h-[420px] w-full lg:h-[640px]"
            interactive
            label="Interactive 3D docking station"
            loadingLabel="Assembling the station"
            fallback={<SceneFallback title="The station viewer needs WebGL 2." note="The component inspector on the right still lists every part." />}
            factory={(ctx) =>
              createStationScene(ctx, {
                state,
                labels: labels.current,
                onPick: (k) => choosePart(k),
                onPhase: (p, charge) => setPhase({ p, charge }),
              })
            }
          >
            <div className="pointer-events-none absolute inset-0">
              {LABEL_PARTS.map((k) => (
                <button
                  key={k}
                  type="button"
                  ref={(el) => {
                    if (el) labels.current.set(k, el);
                  }}
                  data-show="0"
                  onClick={() => choosePart(k)}
                  className={`absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap opacity-0 transition-opacity duration-200 ${part === k ? 'z-10' : ''}`}
                >
                  <span className={`h-2 w-2 rounded-full ring-2 ring-night ${part === k ? 'bg-amber' : 'bg-signal'}`} />
                  <span className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${part === k ? 'border-amber/70 bg-night/90 text-amber' : 'border-line bg-night/80 text-ink'}`}>{PARTS[k].short}</span>
                </button>
              ))}
            </div>
            <div className="absolute left-3 top-3 flex flex-wrap gap-2">
              <Tag tone="mist">Concept model</Tag>
              {phase.p !== 'idle' && <Tag tone="amber">{phase.p === 'charging' ? `Charging ${Math.round(phase.charge * 100)}%` : phase.p}</Tag>}
            </div>
            <div className="absolute bottom-3 right-3 flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => nudge(-0.35, 1)} aria-label="Rotate left">
                ⟲
              </Button>
              <Button size="sm" variant="secondary" onClick={() => nudge(0.35, 1)} aria-label="Rotate right">
                ⟳
              </Button>
              <Button size="sm" variant="secondary" onClick={() => nudge(0, 0.82)} aria-label="Zoom in">
                +
              </Button>
              <Button size="sm" variant="secondary" onClick={() => nudge(0, 1.2)} aria-label="Zoom out">
                −
              </Button>
              <Button size="sm" variant="secondary" icon="reset" onClick={() => apply({ resetTick: state.current.resetTick + 1 })}>
                Reset
              </Button>
            </div>
            <p className="absolute bottom-3 left-3 hidden max-w-[48%] rounded bg-night/80 px-2 py-1 text-[12px] text-mist md:block" aria-live="polite">
              {PHASE_TEXT[phase.p]}
            </p>
          </Viewport>
        </div>

        <aside className="grid content-start gap-4" aria-label="Component inspector">
          <div className="panel grid gap-3 p-4">
            <span className="label">View</span>
            <div className="grid grid-cols-2 gap-2">
              <Toggle
                on={exploded}
                onChange={(v) => {
                  setExploded(v);
                  apply({ explode: v ? 0.62 : 0 });
                }}
                icon="layers"
              >
                Exploded
              </Toggle>
              <Toggle
                on={cutaway}
                onChange={(v) => {
                  setCutaway(v);
                  apply({ cutaway: v });
                }}
                icon="eye"
              >
                Cutaway
              </Toggle>
              <Toggle
                on={isolate}
                onChange={(v) => {
                  setIsolate(v);
                  apply({ isolate: v });
                }}
                icon="crosshair"
              >
                Isolate
              </Toggle>
              <Button
                variant="primary"
                size="sm"
                icon="play"
                onClick={() => {
                  setClosed(false);
                  apply({ doorsClosed: false, demoTick: state.current.demoTick + 1 });
                }}
              >
                Show how it works
              </Button>
            </div>
            <span className="label mt-1">Subsystems</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Highlight a subsystem">
              {SUBSYSTEMS.map((s) => (
                <button key={s.id} type="button" aria-pressed={sub === s.id} onClick={() => chooseSub(sub === s.id ? null : s.id)} className={`min-h-[34px] rounded border px-2.5 text-[13px] transition-colors ${sub === s.id ? 'border-amber/70 bg-amber/10 text-amber' : 'border-line text-mist hover:text-ink'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {subsystem && <p className="text-[14px] text-mist">{subsystem.blurb}</p>}
            {sub === 'safety' && (
              <div className="grid grid-cols-2 gap-2">
                <Toggle
                  on={braked}
                  tone="coral"
                  onChange={(v) => {
                    setBraked(v);
                    apply({ braked: v });
                  }}
                >
                  Brake turbine
                </Toggle>
                <Toggle
                  on={closed}
                  tone="coral"
                  onChange={(v) => {
                    setClosed(v);
                    apply({ doorsClosed: v });
                  }}
                >
                  Close bay
                </Toggle>
              </div>
            )}
          </div>

          <div className="panel p-4" aria-live="polite">
            {info ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-bold leading-tight">{info.name}</h3>
                  <Tag tone="amber">Selected</Tag>
                </div>
                <dl className="mt-3 grid gap-3 text-[15px] leading-snug">
                  <div>
                    <dt className="label text-[10px]">Purpose</dt>
                    <dd className="mt-0.5 text-ink">{info.purpose}</dd>
                  </div>
                  <div>
                    <dt className="label text-[10px]">Role in the system</dt>
                    <dd className="mt-0.5 text-ink">{info.role}</dd>
                  </div>
                  <div className="rounded-md border border-amber/30 bg-amber/[0.06] p-2.5">
                    <dt className="label text-[10px] text-amber">Engineering caveat</dt>
                    <dd className="mt-0.5 text-[#f3dcc3]">{info.caveat}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-mist">Select a component in the model or from the list below.</p>
            )}
          </div>

          <details className="panel p-4">
            <summary className="cursor-pointer text-[14px] text-mist">All components ({LABEL_PARTS.length})</summary>
            <ul className="mt-3 grid grid-cols-2 gap-1">
              {LABEL_PARTS.map((k) => (
                <li key={k}>
                  <button type="button" onClick={() => choosePart(k)} className={`w-full rounded px-2 py-1.5 text-left text-[13px] ${part === k ? 'bg-raised text-amber' : 'text-mist hover:text-ink'}`}>
                    {PARTS[k].short}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </aside>
      </div>
    </Chapter>
  );
}
