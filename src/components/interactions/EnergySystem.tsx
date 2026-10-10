import { useEffect, useMemo, useRef, useState } from 'react';
import { Viewport } from '../../scenes/core/Viewport';
import { createPowerScene, POWER_NODES, type PowerNode, type PowerSceneInput } from '../../scenes/PowerScene';
import { DEFAULT_POWER, dailyBudget, simulate72h, reserveHours, CORE_LOADS, CHARGE_KWH, type PowerSettings } from '../../simulation/powerModel';
import { SYSTEM } from '../../data/systemConstants';
import { prefersReducedMotion } from '../../scenes/core/webgl';
import { Chapter, ChapterHeader } from '../layout/Chapter';
import { SceneFallback } from '../ui/SceneFallback';
import { Button, Slider, Tag, Toggle } from '../ui/controls';

const P = SYSTEM.station;

const NODE_INFO: Record<PowerNode, { name: string; text: string }> = {
  turbine: { name: 'Wind turbine', text: 'Power scales with v³, so steady mountain wind adds energy in lulls of sun. Furls and brakes above cut-out; turbulence lowers real yield.' },
  windCtrl: { name: 'Wind charge controller', text: 'Regulates turbine output into the battery and applies the brake / dump load at cut-out.' },
  solar: { name: 'Solar array', text: `${P.pvPanels} × ${P.pvPanelW} W panels, ~${P.sunHours} sun-hours × ${P.pvDerate} derate in the deck estimate. Much less in monsoon cloud.` },
  mppt: { name: 'MPPT solar controller', text: 'Tracks the panels’ maximum power point and charges the bank.' },
  battery: { name: 'LiFePO4 battery + BMS + heater', text: `${P.batteryKWh} kWh (~${P.usableKWh} usable). A ~${P.reserveKWh} kWh slice is locked for comms and sensors: about ${Math.round(reserveHours())} hours of core load with zero generation.` },
  bus: { name: 'Protected DC power bus', text: 'Distributes power by priority. Communications and monitoring stay on the protected side; drone charging is sheddable.' },
  comms: { name: 'Communications', text: 'Mesh radio relay (10 W) and backhaul. Always powered from the protected reserve.' },
  controller: { name: 'Edge controller + GPS', text: 'Edge computer (8 W) and GPS/time sync (1 W). Runs load shedding itself.' },
  sensors: { name: 'Sensors', text: 'Weather, tilt, temperature and voltage monitoring (3 W).' },
  safety: { name: 'Safety systems', text: 'Heaters, actuators and beacon (10 W). Needed to close the bay and survive cold nights.' },
  charger: { name: 'Drone charger (sheddable)', text: `~${CHARGE_KWH.toFixed(2)} kWh per sortie (500 Wh pack, 85% efficiency). The biggest load, and the first to be shed.` },
};

function Chart({ pts, hour, onHour }: { pts: ReturnType<typeof simulate72h>['pts']; hour: number; onHour: (h: number) => void }) {
  const W = 720;
  const H = 220;
  const L = 40;
  const R = 12;
  const T = 14;
  const B = 34;
  const X = (h: number) => L + (h / 72) * (W - L - R);
  const maxE = Math.max(1.2, ...pts.map((p) => Math.max(p.gen, p.load)));
  const Yk = (v: number) => T + (1 - v / P.batteryKWh) * (H - T - B);
  const Ye = (v: number) => H - B - (v / maxE) * (H - T - B) * 0.55;
  const soc = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.h + 1).toFixed(1)},${Yk(p.soc).toFixed(1)}`).join(' ');
  const bw = (W - L - R) / 72;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full touch-none"
      role="img"
      aria-label="72-hour chart of hourly generation, load and battery state of charge with the locked reserve line"
      onPointerDown={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const h = Math.floor((((e.clientX - r.left) / r.width) * W - L) / ((W - L - R) / 72));
        onHour(Math.max(0, Math.min(71, h)));
      }}
    >
      {[0, 2.5, 5, 7.5, 10].map((k) => (
        <g key={k}>
          <line x1={L} x2={W - R} y1={Yk(k)} y2={Yk(k)} stroke="#132536" />
          <text x={L - 6} y={Yk(k) + 4} textAnchor="end" fontSize="10" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
            {k}
          </text>
        </g>
      ))}
      {[0, 24, 48, 72].map((h) => (
        <text key={h} x={X(h)} y={H - 16} textAnchor="middle" fontSize="10" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
          {h}h
        </text>
      ))}
      {pts.map((p) => (
        <g key={p.h}>
          <rect x={X(p.h) + 0.5} width={Math.max(1, bw / 2 - 0.5)} y={Ye(p.gen)} height={H - B - Ye(p.gen)} fill="#FFC46B" opacity="0.55" />
          <rect x={X(p.h) + bw / 2} width={Math.max(1, bw / 2 - 0.5)} y={Ye(p.load)} height={H - B - Ye(p.load)} fill={p.shed ? '#FF6B5E' : '#61E6E0'} opacity={p.shed ? 0.9 : 0.45} />
        </g>
      ))}
      <line x1={L} x2={W - R} y1={Yk(P.reserveKWh)} y2={Yk(P.reserveKWh)} stroke="#FF9E43" strokeDasharray="6 5" />
      <text x={W - R} y={Yk(P.reserveKWh) - 5} textAnchor="end" fontSize="10" fill="#FF9E43" fontFamily="JetBrains Mono, monospace">
        locked reserve {P.reserveKWh} kWh
      </text>
      <path d={soc} fill="none" stroke="#7BD88F" strokeWidth="2.5" />
      <line x1={X(hour + 0.5)} x2={X(hour + 0.5)} y1={T} y2={H - B} stroke="#EAF2F8" strokeOpacity="0.7" />
      <circle cx={X(hour + 1)} cy={Yk(pts[hour].soc)} r="4.5" fill="#7BD88F" stroke="#07111B" strokeWidth="2" />
      <text x={L} y={H - 2} fontSize="10" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
        green: battery kWh · gold: generation / h · cyan: load / h · red: drone charge shed
      </text>
    </svg>
  );
}

export function EnergySystem() {
  const [cfg, setCfg] = useState<PowerSettings>({ ...DEFAULT_POWER });
  const [hour, setHour] = useState(10);
  const [playing, setPlaying] = useState(!prefersReducedMotion());
  const [sel, setSel] = useState<PowerNode | null>('charger');
  const labels = useRef(new Map<string, HTMLElement>());
  const sim = useMemo(() => simulate72h(cfg), [cfg]);
  const budget = dailyBudget(cfg);
  const pt = sim.pts[hour];
  const hod = hour % 24;
  const sunNow = hod >= 6 && hod < 18 ? Math.sin((Math.PI * (hod + 0.5 - 6)) / 12) * (cfg.storm ? 0.3 : 1) * (cfg.sunHours / 4) : 0;
  const input = useRef<PowerSceneInput>({ windKmh: 25, sun: 0.5, soc: 0.6, reserve: 0.2, chargerOn: 1, turbineBraked: false, selected: 'charger' });
  const chargeHour = [8, 11, 14, 17, 20, 6].slice(0, cfg.sorties).includes(hod);
  input.current = {
    windKmh: cfg.storm ? 62 : 8 + (cfg.windAvgW / 250) * 34,
    sun: Math.max(0, Math.min(1, sunNow)),
    soc: pt.soc / P.batteryKWh,
    reserve: P.reserveKWh / P.batteryKWh,
    chargerOn: chargeHour ? (pt.shed ? 0 : 1) : 0.15,
    turbineBraked: cfg.storm,
    selected: sel,
  };

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHour((h) => (h + 1) % 72), 260);
    return () => window.clearInterval(id);
  }, [playing]);

  const set = (patch: Partial<PowerSettings>) => setCfg((c) => ({ ...c, ...patch }));
  const requested = cfg.sorties * 3;

  return (
    <Chapter id="energy" label="08 · Off-grid energy">
      <ChapterHeader no="08" kicker="Technology · off-grid power" title="Comms are cheap. Drone charging is the big load, and it sheds first.">
        Wind and solar feed a LiFePO4 bank through their own controllers; a protected DC bus serves the loads by priority. Change the weather and watch the station protect its communications reserve. All figures are the deck’s design estimates, not measured performance.
      </ChapterHeader>

      <div className="mt-10 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative overflow-hidden rounded-xl border border-line bg-surface">
          <Viewport
            className="h-[52vh] min-h-[380px] w-full"
            interactive
            label="3D power system with animated energy flows"
            loadingLabel="Wiring the power system"
            fallback={<SceneFallback title="The 3D power diagram needs WebGL 2." note="The energy budget and chart still work." />}
            factory={(ctx) => createPowerScene(ctx, { input, labels: labels.current, onPick: setSel })}
          >
            <div className="pointer-events-none absolute inset-0">
              {POWER_NODES.map((k) => (
                <button
                  key={k}
                  type="button"
                  ref={(el) => {
                    if (el) labels.current.set(k, el);
                  }}
                  onClick={() => setSel(k)}
                  className={`pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[11px] opacity-0 transition-opacity ${sel === k ? 'border-amber/70 bg-night/90 text-amber' : 'border-line bg-night/80 text-ink'} ${k === 'charger' && input.current.chargerOn === 0 ? '!border-coral/70 !text-coral' : ''}`}
                >
                  {NODE_INFO[k].name.split(' (')[0].replace('LiFePO4 battery + BMS + heater', 'LiFePO4 + BMS')}
                </button>
              ))}
            </div>
            <div className="absolute left-3 top-3 grid gap-1 rounded-md border border-line bg-night/85 px-3 py-2 font-mono text-[12px]">
              <span className="text-mist">
                Hour <span className="num text-ink">{String(hour).padStart(2, '0')}</span> · {hod >= 6 && hod < 18 ? 'day' : 'night'}
              </span>
              <span className="text-mist">
                Battery <span className="num text-go">{pt.soc.toFixed(1)} kWh</span>
              </span>
              <span className={pt.shed ? 'text-coral' : chargeHour ? 'text-amber' : 'text-dim'}>{pt.shed ? 'Drone charge SHED · reserve protected' : chargeHour ? 'Drone charging' : 'Charger idle'}</span>
            </div>
          </Viewport>
        </div>

        <aside className="grid content-start gap-3">
          <div className="panel grid gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="label">Conditions</span>
              <Tag tone="amber">Design estimate</Tag>
            </div>
            <Slider id="e-sun" label="Sun-hours per day" value={cfg.sunHours} min={0} max={6} step={0.5} onChange={(v) => set({ sunHours: v })} format={(v) => `${v} h`} />
            <Slider id="e-wind" label="Average wind power" value={cfg.windAvgW} min={0} max={250} step={10} onChange={(v) => set({ windAvgW: v })} format={(v) => `${v} W`} />
            <Slider id="e-sorties" label="Drone sorties per day" value={cfg.sorties} min={0} max={6} step={1} onChange={(v) => set({ sorties: v })} format={(v) => `${v}`} />
            <div className="grid grid-cols-2 gap-2">
              <Toggle on={cfg.storm} onChange={(v) => set({ storm: v })} tone="coral" icon="wind">
                Monsoon storm
              </Toggle>
              <Button size="sm" variant="danger" onClick={() => setCfg({ ...DEFAULT_POWER, storm: true, sunHours: 1.5, windAvgW: 60, sorties: 5 })}>
                Worst case
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" icon={playing ? 'pause' : 'play'} onClick={() => setPlaying((p) => !p)}>
                {playing ? 'Pause 72 h' : 'Play 72 h'}
              </Button>
              <Button size="sm" variant="ghost" icon="reset" onClick={() => setCfg({ ...DEFAULT_POWER })}>
                Deck baseline
              </Button>
            </div>
          </div>
          <div className="panel p-4" aria-live="polite">
            {sel ? (
              <>
                <span className="label text-amber">Selected</span>
                <h3 className="mt-1 text-lg font-bold">{NODE_INFO[sel].name}</h3>
                <p className="mt-1 text-[15px] leading-snug text-mist">{NODE_INFO[sel].text}</p>
              </>
            ) : (
              <p className="text-mist">Click a component in the 3D view.</p>
            )}
          </div>
        </aside>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="panel p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="label">72-hour operation · click to scrub</span>
            <span className={`font-mono text-[12px] ${sim.reserveHeld ? 'text-go' : 'text-coral'}`}>{sim.reserveHeld ? `Reserve held · minimum ${sim.minSoc.toFixed(1)} kWh` : `Reserve breached · minimum ${sim.minSoc.toFixed(1)} kWh`}</span>
          </div>
          <Chart pts={sim.pts} hour={hour} onHour={(h) => {
            setPlaying(false);
            setHour(h);
          }} />
        </div>
        <div className="panel grid content-start gap-3 p-4">
          <span className="label">Daily budget</span>
          {[
            { k: 'Generation', v: budget.gen, c: '#FFC46B', d: `PV ${budget.pv.toFixed(1)} + wind ${budget.wind.toFixed(1)}` },
            { k: 'Core station', v: budget.core, c: '#61E6E0', d: `${P.coreW} W continuous` },
            { k: 'Drone charging', v: budget.drone, c: '#FF9E43', d: `${cfg.sorties} × ${CHARGE_KWH.toFixed(2)} kWh` },
          ].map((r) => (
            <div key={r.k}>
              <div className="flex items-baseline justify-between text-[14px]">
                <span className="text-mist">{r.k}</span>
                <span className="num font-mono text-ink">{r.v.toFixed(1)} kWh/day</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-line">
                <div className="h-full" style={{ width: `${Math.min(100, (r.v / 6) * 100)}%`, background: r.c }} />
              </div>
              <span className="text-[12px] text-dim">{r.d}</span>
            </div>
          ))}
          <div className={`rounded-md border p-3 text-[14px] ${budget.balance >= 0 ? 'border-go/40 text-go' : 'border-coral/50 text-coral'}`}>
            Balance {budget.balance >= 0 ? '+' : ''}
            {budget.balance.toFixed(1)} kWh/day ·{' '}
            <span className="text-ink">
              {sim.served} of {requested} drone charges served over 72 h{sim.shedCount ? `, ${sim.shedCount} shed to protect the reserve` : ''}
            </span>
          </div>
          <details className="text-[13px] text-mist">
            <summary className="cursor-pointer">Core loads ({P.coreW} W)</summary>
            <ul className="mt-2 grid gap-1">
              {CORE_LOADS.map((l) => (
                <li key={l.key} className="flex justify-between">
                  <span>{l.label}</span>
                  <span className="num font-mono">{l.w} W</span>
                </li>
              ))}
            </ul>
          </details>
          <p className="text-[12px] leading-snug text-dim">Deck baseline: ~4.8 kWh/day generation vs ~3.3 kWh/day demand (0.9 core + 2.4 drone). Wind and solar do not guarantee continuous operation; long storms reduce drone sorties first.</p>
        </div>
      </div>
    </Chapter>
  );
}
