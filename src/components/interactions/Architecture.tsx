import { useState } from 'react';
import { useSim } from '../../simulation/store';
import { linkUsable } from '../../simulation/networkGraph';
import { disableStation, restoreStation } from '../../simulation/failureScenarios';
import type { NodeId, SimState } from '../../simulation/types';
import { Chapter, ChapterHeader } from '../layout/Chapter';
import { Button, Tag } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';

type Status = 'ok' | 'warn' | 'down' | 'idle';
interface Item {
  label: string;
  detail: string;
  status: Status;
}

function layers(s: SimState, id: NodeId): { comm: Item[]; power: Item[]; phys: Item[] } {
  const st = s.stations[id];
  const on = st.online;
  const links = s.links.filter((l) => l.a === id || l.b === id);
  const queued = s.messages.filter((m) => m.at === id && (m.state === 'queued' || m.state === 'stored'));
  const stored = queued.filter((m) => m.state === 'stored').length;
  const drones = s.drones.filter((d) => d.at === id);
  const m = s.missions.find((x) => x.id === s.activeMissionId);
  const wind = s.conditions.highWind;
  return {
    comm: [
      { label: 'Command center', detail: 'Outside the blackout, reached via the gateway backhaul', status: s.stations.CC.online ? 'ok' : 'down' },
      { label: 'Gateway', detail: 'Road-head relay into the mesh', status: s.stations.G.online ? 'ok' : 'down' },
      { label: `Mesh radio · ${id}`, detail: on ? 'Forwarding traffic' : 'Offline: node removed from the graph', status: on ? 'ok' : 'down' },
      ...links.map((l) => ({ label: `Link ${l.a}–${l.b}`, detail: linkUsable(s, l) ? (l.kind === 'backhaul' ? 'Backhaul up' : 'LoRa up') : 'Unavailable', status: (linkUsable(s, l) ? 'ok' : 'down') as Status })),
      { label: 'Priority queues P0–P3', detail: on ? `${queued.length} waiting at this node` : 'Not available', status: !on ? 'down' : queued.length ? 'warn' : 'ok' },
      { label: 'Store-and-forward', detail: s.conditions.storeForward ? `${stored} bundle(s) held` : 'Disabled', status: !on ? 'down' : s.conditions.storeForward ? (stored ? 'warn' : 'ok') : 'idle' },
      { label: 'Telemetry', detail: on ? 'MAVLink + MQTT reporting' : 'Silent', status: on ? 'ok' : 'down' },
    ],
    power: [
      { label: 'Wind generation', detail: wind ? 'Furled above cut-out' : `${Math.round(st.windKmh)} km/h`, status: !on ? 'down' : wind ? 'warn' : 'ok' },
      { label: 'PV generation', detail: '2 × 400 W (estimate)', status: on ? 'ok' : 'down' },
      { label: 'Charge controllers', detail: 'Wind controller + MPPT', status: on ? 'ok' : 'down' },
      { label: 'LiFePO4 battery + BMS', detail: `${Math.round(st.batteryPct)}% state of charge`, status: !on ? 'down' : st.batteryPct < 25 ? 'warn' : 'ok' },
      { label: 'Protected reserve', detail: '~2 kWh locked for comms and sensors', status: on ? 'ok' : 'down' },
      { label: 'Load shedding', detail: st.powerMode === 'shed' ? 'Drone charging shed' : 'All loads served', status: !on ? 'down' : st.powerMode === 'shed' ? 'warn' : 'ok' },
    ],
    phys: [
      { label: 'Drone dock', detail: !on ? 'Unavailable: drones skip to next dock in range' : st.dockOccupiedBy ? `Occupied by ${st.dockOccupiedBy}` : 'Free', status: on ? 'ok' : 'down' },
      ...drones.map((d) => ({ label: `Drone ${d.id}`, detail: `${d.state}, ${Math.round(d.batteryPct)}%`, status: (on ? 'ok' : 'warn') as Status })),
      { label: 'Medical payload', detail: m && m.droneId && drones.some((d) => d.id === m.droneId) ? `${m.payloadKg} kg on board` : 'None at this dock', status: 'idle' },
      { label: 'Incident location', detail: id === 'S3' ? 'Casualty zone ~1 km away' : 'Not adjacent', status: id === 'S3' ? 'warn' : 'idle' },
      { label: 'Emergency team', detail: id === 'S3' ? 'Receives drops near S3' : 'Outside this cell', status: 'idle' },
      { label: 'Delivery confirmation', detail: m?.confirmed ? `${m.id} confirmed` : m?.delivered ? 'Delivered, awaiting confirmation' : 'No delivery yet', status: m?.confirmed ? 'ok' : 'idle' },
    ],
  };
}

const DOT: Record<Status, string> = { ok: 'bg-go', warn: 'bg-amber', down: 'bg-coral', idle: 'bg-dim' };

function Layer({ title, icon, tone, items }: { title: string; icon: IconName; tone: string; items: Item[] }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} className={tone} />
        <h3 className={`font-mono text-[12px] font-medium uppercase tracking-[0.14em] ${tone}`}>{title}</h3>
      </div>
      <ul className="mt-3 grid gap-1.5">
        {items.map((it) => (
          <li key={it.label} className={`flex items-start gap-2.5 rounded-md border px-2.5 py-2 transition-colors ${it.status === 'down' ? 'border-coral/50 bg-coral/[0.06]' : 'border-line bg-night/40'}`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[it.status]}`} aria-hidden="true" />
            <span className="min-w-0">
              <span className={`block text-[14px] ${it.status === 'down' ? 'text-coral' : 'text-ink'}`}>{it.label}</span>
              <span className="block text-[12px] leading-snug text-mist">{it.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Architecture() {
  const s = useSim();
  const [id, setId] = useState<NodeId>('S2');
  const L = layers(s, id);
  const on = s.stations[id].online;
  const flow = (ok: boolean) => (ok ? '#61E6E0' : '#FF6B5E');
  return (
    <Chapter id="architecture" label="12 · System architecture">
      <ChapterHeader no="12" kicker="Technology · system architecture" title="Three layers that fail separately, not together.">
        Communication, power and physical logistics are separate responsibilities inside every station. If power degrades, the comms core stays up on its reserve. If a radio link fails, the drone layer can carry data. Select a station and switch it off to see exactly what is affected.
      </ChapterHeader>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <span className="label mr-2">Inspect station</span>
        {(['G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]).map((n) => (
          <button key={n} type="button" aria-pressed={id === n} onClick={() => setId(n)} className={`min-h-[38px] rounded-md border px-3 font-mono text-[13px] ${id === n ? 'border-amber/70 bg-amber/10 text-amber' : 'border-line text-mist hover:text-ink'} ${s.stations[n].online ? '' : 'line-through decoration-coral'}`}>
            {n}
          </button>
        ))}
        <Button size="sm" className="ml-auto" variant={on ? 'danger' : 'signal'} icon="power" onClick={() => (on ? disableStation(id) : restoreStation(id))}>
          {on ? `Disable ${id}` : `Restore ${id}`}
        </Button>
      </div>

      <div className="mt-4 panel overflow-x-auto p-3">
        <svg viewBox="0 0 900 150" className="h-auto w-full min-w-[620px]" role="img" aria-label={`How the three layers of station ${id} interact. ${on ? 'All interactions active.' : 'Station offline: interactions interrupted.'}`}>
          {[
            { x: 150, t: 'POWER', c: '#FFC46B' },
            { x: 450, t: `STATION ${id}`, c: on ? '#EAF2F8' : '#FF6B5E' },
            { x: 750, t: 'COMMUNICATION', c: '#61E6E0' },
          ].map((n) => (
            <g key={n.t}>
              <rect x={n.x - 95} y={18} width={190} height={40} rx={6} fill="#0D1B28" stroke={n.c} />
              <text x={n.x} y={43} textAnchor="middle" fontSize="13" fill={n.c} fontFamily="JetBrains Mono, monospace">
                {n.t}
              </text>
            </g>
          ))}
          <rect x={355} y={98} width={190} height={40} rx={6} fill="#0D1B28" stroke="#FF9E43" />
          <text x={450} y={123} textAnchor="middle" fontSize="13" fill="#FF9E43" fontFamily="JetBrains Mono, monospace">
            PHYSICAL / LOGISTICS
          </text>
          <path d="M245 38 H355" stroke={flow(on)} strokeWidth="2" className={on ? 'flow-dash' : ''} strokeDasharray="6 6" />
          <path d="M545 38 H655" stroke={flow(on)} strokeWidth="2" className={on ? 'flow-dash' : ''} strokeDasharray="6 6" />
          <path d="M450 58 V98" stroke={flow(on)} strokeWidth="2" className={on ? 'flow-dash' : ''} strokeDasharray="6 6" />
          <text x={300} y={78} textAnchor="middle" fontSize="11" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
            reserve → radio first
          </text>
          <text x={600} y={78} textAnchor="middle" fontSize="11" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
            mission control · data-mule
          </text>
          <text x={560} y={112} fontSize="11" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
            charger (sheddable)
          </text>
        </svg>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Layer title="Communication layer" icon="radio" tone="text-signal" items={L.comm} />
        <Layer title="Power layer" icon="zap" tone="text-[#FFC46B]" items={L.power} />
        <Layer title="Physical & logistics layer" icon="drone" tone="text-amber" items={L.phys} />
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-[14px] text-mist">
        <Tag tone="signal">Why separate</Tag> A fault in one layer has a defined fallback in another: comms keep the locked energy reserve, messages can ride a drone when radios fail, and drones can skip a dark dock if the next one is in range. This is a design intent; whether it holds depends on terrain and hardware.
      </p>
    </Chapter>
  );
}
