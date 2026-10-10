import { useState } from 'react';
import { getSim, useSim } from '../../simulation/store';
import { activeMission } from '../../simulation/missionEngine';
import { isolateS3WithDelayedRecovery, reduceDroneBattery, restoreNormal, setCorridorBlocked, setHighWind, startMission } from '../../simulation/failureScenarios';
import { SYSTEM } from '../../data/systemConstants';
import { CEILING_M } from '../../simulation/routePlanner';
import { Chapter, ChapterHeader } from '../layout/Chapter';
import { Button, Tag } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';
import { scrollToId } from '../../app/actions';

type Zone = 'fence' | 'lidar' | 'anemo' | 'battery' | 'land' | 'dock' | 'payload' | 'radio' | 'health';
const FEATURES: { id: Zone; icon: IconName; t: string; b: string; level: 'Drone' | 'Station' | 'Network' }[] = [
  { id: 'fence', icon: 'fence', t: 'Geofencing and no-go zones', b: 'Flight corridors and blocked cells (landslides, ridges above the ceiling) are excluded from planning.', level: 'Network' },
  { id: 'lidar', icon: 'scan', t: 'Collision avoidance', b: 'LiDAR / time-of-flight sensors plus a terrain database keep clearance from ridges and cables.', level: 'Drone' },
  { id: 'anemo', icon: 'wind', t: 'Weather and wind monitoring', b: `Station anemometers feed go/no-go. Above the assumed ${SYSTEM.droneWindLimitKmh} km/h limit, drones hold at a sheltered dock.`, level: 'Station' },
  { id: 'battery', icon: 'battery', t: `Battery monitoring · ${SYSTEM.batteryReservePct}% reserve`, b: 'Every hop must leave enough to return with the reserve; the BMS reports state of charge continuously.', level: 'Drone' },
  { id: 'land', icon: 'arrowDown', t: 'Emergency landing', b: 'If no dock is reachable, the drone performs a controlled landing and the mission is marked interrupted.', level: 'Drone' },
  { id: 'dock', icon: 'home', t: 'Return-to-dock on faults', b: 'On a fault the drone diverts to the nearest safe dock rather than pressing on.', level: 'Network' },
  { id: 'payload', icon: 'package', t: 'Payload verification', b: 'Weight, latch and ID are checked before launch and at release.', level: 'Drone' },
  { id: 'radio', icon: 'radio', t: 'Communications-loss handling', b: 'Pre-programmed return-to-dock if the command link is lost; messages wait in store-and-forward.', level: 'Network' },
  { id: 'health', icon: 'thermo', t: 'Station health', b: 'Temperature, tilt, voltage and link quality are reported over the mesh and raise alerts.', level: 'Station' },
];

const SCENARIOS: { id: string; icon: IconName; t: string; trigger: string; steps: string[]; run: () => void }[] = [
  {
    id: 'battery',
    icon: 'battery',
    t: 'Low battery',
    trigger: 'Battery fault drops the flying drone to 32%.',
    steps: ['Monitor checks remaining energy against the reserve every 2 s', 'Planner re-searches reachable docks from the current position', 'Drone continues on reserve only if the target is still the closest safe dock, otherwise diverts', 'If nothing is reachable: controlled landing, mission marked interrupted'],
    run: () => reduceDroneBattery(),
  },
  {
    id: 'wind',
    icon: 'wind',
    t: 'High wind',
    trigger: 'Gusts above 60 km/h across the corridor.',
    steps: [`All hops above the ${SYSTEM.droneWindLimitKmh} km/h limit become infeasible`, 'Drone in flight diverts to the nearest dock and lands in the sheltered bay', 'Bay doors close, turbines furl and brake', 'Mission holds until a weather window opens, then replans'],
    run: () => setHighWind(true),
  },
  {
    id: 'comms',
    icon: 'radio',
    t: 'Loss of communication',
    trigger: 'S3 loses both radio links; one returns after ~3 min.',
    steps: ['SOS and telemetry at S3 are held in store-and-forward, not reported as delivered', 'If data-mule is enabled, a docked drone can carry the bundle out', 'When a link returns, messages are released in priority order', 'Drones without a command link follow their pre-programmed return-to-dock'],
    run: () => isolateS3WithDelayedRecovery(),
  },
  {
    id: 'terrain',
    icon: 'mountain',
    t: 'Unsafe terrain',
    trigger: 'Tilt alert: landslide across the S2–S3 valley corridor.',
    steps: ['Terrain cells in the slide zone are blocked for routing', 'A* detour is evaluated; if too costly the hop becomes infeasible', 'Dijkstra picks the next feasible dock sequence (e.g. via S2b)', 'If none exists, the mission holds and the operator is alerted'],
    run: () => setCorridorBlocked(true),
  },
];

/** Inject a fault once the mission drone is actually airborne (gives up after ~90 s). */
function whenFlying(fn: () => void) {
  let tries = 0;
  const id = window.setInterval(() => {
    const st = getSim();
    const mm = activeMission(st);
    const d = mm?.droneId ? st.drones.find((x) => x.id === mm.droneId) : null;
    if (d && d.state === 'flying' && d.flight && d.flight.s > d.flight.total * 0.35) {
      window.clearInterval(id);
      fn();
    } else if (++tries > 180) window.clearInterval(id);
  }, 500);
}

function Schematic({ zone }: { zone: Zone | null }) {
  const hl = (z: Zone[]) => (zone && z.includes(zone) ? '#FF9E43' : '#2A3E52');
  const glow = (z: Zone[]) => (zone && z.includes(zone) ? 1 : 0);
  return (
    <svg viewBox="0 0 520 300" className="h-auto w-full" role="img" aria-label="Side view of a drone approaching a docking station; the selected safety feature is highlighted">
      <path d="M0 260 L90 230 L170 248 L260 210 L380 236 L520 205 L520 300 L0 300Z" fill="#141F2B" />
      {/* geofence corridor */}
      <path d="M40 120 Q 200 70 330 120" fill="none" stroke={hl(['fence'])} strokeWidth="26" strokeOpacity={zone === 'fence' ? 0.25 : 0.12} />
      <path d="M60 60 L120 60 M60 60 L60 120" stroke={hl(['fence'])} strokeDasharray="4 4" />
      {/* station */}
      <g transform="translate(360 150)">
        <rect x="0" y="40" width="110" height="60" rx="10" fill="#1A2836" stroke={hl(['health'])} strokeWidth="2" />
        <rect x="-10" y="30" width="130" height="10" fill="#2C3A47" stroke={hl(['dock'])} strokeWidth="2" />
        <line x1="10" y1="100" x2="0" y2="118" stroke="#556" strokeWidth="3" />
        <line x1="100" y1="100" x2="110" y2="118" stroke="#556" strokeWidth="3" />
        <line x1="5" y1="30" x2="5" y2="-40" stroke={hl(['radio'])} strokeWidth="3" />
        <circle cx="5" cy="-44" r="5" fill={hl(['radio'])} />
        <g transform="translate(108 -8)">
          <line x1="0" y1="38" x2="0" y2="-10" stroke={hl(['anemo'])} strokeWidth="3" />
          <path d="M-10 -10 h20 M0 -20 v20" stroke={hl(['anemo'])} strokeWidth="3" />
        </g>
        <rect x="70" y="62" width="26" height="14" fill={hl(['health'])} opacity={0.8} />
        <text x="55" y="135" textAnchor="middle" fontSize="11" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
          dock
        </text>
      </g>
      {/* drone */}
      <g transform="translate(220 112)">
        <path d="M-40 0 H40" stroke="#C9D3DC" strokeWidth="4" />
        <ellipse cx="-40" cy="-6" rx="16" ry="3" fill="#C9D3DC" opacity="0.6" />
        <ellipse cx="40" cy="-6" rx="16" ry="3" fill="#C9D3DC" opacity="0.6" />
        <rect x="-16" y="-8" width="32" height="16" rx="4" fill="#E8ECEF" />
        <rect x="-10" y="-14" width="20" height="6" fill={hl(['battery'])} />
        <circle cx="18" cy="2" r="4" fill={hl(['lidar'])} />
        <path d="M22 2 L70 -10 L70 14 Z" fill={hl(['lidar'])} opacity={0.25 + glow(['lidar']) * 0.35} />
        <line x1="0" y1="8" x2="0" y2="22" stroke="#889" strokeWidth="2" />
        <rect x="-10" y="22" width="20" height="14" fill={zone === 'payload' ? '#FF9E43' : '#2FAE6B'} />
        <path d="M-20 8 L-26 18 M20 8 L26 18" stroke={hl(['land'])} strokeWidth="3" />
        {zone === 'land' && <path d="M0 40 V90" stroke="#FF9E43" strokeDasharray="4 4" />}
        {zone === 'dock' && <path d="M40 10 Q 120 20 190 66" fill="none" stroke="#FF9E43" strokeWidth="2" strokeDasharray="5 5" />}
      </g>
    </svg>
  );
}

export function Safety() {
  const s = useSim();
  const [zone, setZone] = useState<Zone | null>('battery');
  const [scn, setScn] = useState<string>('wind');
  const sc = SCENARIOS.find((x) => x.id === scn)!;
  const m = activeMission(s);
  return (
    <Chapter id="safety" label="13 · Safety and resilience">
      <ChapterHeader no="13" kicker="Safety and resilience" title="Every layer has a safe default when something goes wrong.">
        Safety is layered across the drone, the station and the network. Select a feature to see where it lives, or run a scenario against the shared simulation and read the safe response it triggers.
      </ChapterHeader>

      <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="panel grid content-start gap-3 p-4">
          <Schematic zone={zone} />
          <div className="grid gap-1.5 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <button key={f.id} type="button" aria-pressed={zone === f.id} onClick={() => setZone(f.id)} className={`flex items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors ${zone === f.id ? 'border-amber/70 bg-amber/[0.07]' : 'border-line hover:border-mist/50'}`}>
                <Icon name={f.icon} size={16} className={zone === f.id ? 'mt-0.5 shrink-0 text-amber' : 'mt-0.5 shrink-0 text-dim'} />
                <span>
                  <span className="block text-[14px] leading-tight text-ink">{f.t}</span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-dim">{f.level}</span>
                </span>
              </button>
            ))}
          </div>
          {zone && <p className="rounded-md border border-line bg-night/50 p-3 text-[15px] text-ink">{FEATURES.find((f) => f.id === zone)!.b}</p>}
        </div>

        <div className="grid content-start gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Safety scenarios">
            {SCENARIOS.map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={scn === x.id} onClick={() => setScn(x.id)} className={`inline-flex min-h-[40px] items-center gap-2 rounded-md border px-3 text-[14px] ${scn === x.id ? 'border-coral/70 bg-coral/10 text-[#ffd5d0]' : 'border-line text-mist hover:text-ink'}`}>
                <Icon name={x.icon} size={15} /> {x.t}
              </button>
            ))}
          </div>
          <div className="panel p-5" role="tabpanel">
            <span className="label text-coral">Trigger</span>
            <p className="mt-1 text-[16px] text-ink">{sc.trigger}</p>
            <span className="label mt-4 block text-go">Safe response</span>
            <ol className="mt-2 grid gap-2">
              {sc.steps.map((t, i) => (
                <li key={t} className="flex gap-3 text-[15px] leading-snug text-ink">
                  <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full border border-go/50 font-mono text-[11px] text-go">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="danger"
                icon="play"
                onClick={() => {
                  if (!m || m.status === 'completed' || m.status === 'interrupted') startMission('trauma');
                  if (sc.id === 'battery') whenFlying(sc.run);
                  else sc.run();
                  scrollToId('simulation');
                }}
              >
                Run in the live simulation
              </Button>
              <Button variant="ghost" icon="check" onClick={() => restoreNormal()}>
                Restore normal
              </Button>
            </div>
            <p className="mt-3 text-[12px] text-dim">Runs on the shared model: the mission view, dashboard and log will all show the outcome.</p>
          </div>
          <div className="panel overflow-x-auto p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Operating thresholds</span>
              <Tag tone="amber">Configurable assumptions</Tag>
            </div>
            <table className="w-full text-left text-[14px]">
              <tbody>
                {[
                  ['Battery reserve', `${SYSTEM.batteryReservePct}%`],
                  ['Drone wind limit (go/no-go)', `${SYSTEM.droneWindLimitKmh} km/h`],
                  ['Terrain clearance', `${SYSTEM.flightClearanceM} m`],
                  ['Flight ceiling', `${CEILING_M.toLocaleString('en-IN')} m`],
                  ['Station structure design wind', `${SYSTEM.structureDesignWindKmh} km/h`],
                  ['Payload target', `${SYSTEM.payloadTargetKg} kg`],
                ].map(([k, v]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-mist">{k}</td>
                    <td className="num py-1.5 text-right font-mono text-ink">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-dim">To be validated for the selected hardware and applicable regulations before any real operation.</p>
          </div>
        </div>
      </div>
    </Chapter>
  );
}
