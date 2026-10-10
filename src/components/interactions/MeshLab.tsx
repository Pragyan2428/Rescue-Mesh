import { useEffect, useRef, useState } from 'react';
import { getSim, useSim, formatClock } from '../../simulation/store';
import { linkUsable, commPath } from '../../simulation/networkGraph';
import { messageCounts } from '../../simulation/meshEngine';
import { disableStation, isolateS3WithDelayedRecovery, restoreNormal, restoreStation, sendSOSAction, setDataMule, setLink, setStoreForward, trafficBurst } from '../../simulation/failureScenarios';
import type { NodeId, Priority } from '../../simulation/types';
import { Chapter, ChapterHeader } from '../layout/Chapter';
import { Button, SimBadge, Tag, Toggle } from '../ui/controls';
import { Icon } from '../ui/Icon';

export const SCHEMA: Record<NodeId, { x: number; y: number }> = {
  CC: { x: 70, y: 255 },
  G: { x: 215, y: 255 },
  S1: { x: 390, y: 205 },
  S2: { x: 590, y: 240 },
  S2b: { x: 575, y: 95 },
  S3: { x: 800, y: 160 },
};
const PCOL: Record<Priority, string> = { 0: '#FFFFFF', 1: '#61E6E0', 2: '#3FB3AD', 3: '#5F8A96' };
const NAME: Record<NodeId, string> = { CC: 'Command', G: 'Gateway', S1: 'S1', S2: 'S2', S2b: 'S2b', S3: 'S3' };

function MeshDiagram() {
  const s = useSim();
  const dots = useRef<SVGGElement>(null);
  const mule = useRef<SVGGElement>(null);

  // per-frame message animation straight from the shared state
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const st = getSim();
      const g = dots.current;
      if (!g) return;
      const pool = g.children;
      let k = 0;
      const stack = new Map<string, number>();
      for (const m of st.messages) {
        if (k >= pool.length) break;
        let x = 0;
        let y = 0;
        let r = m.priority === 0 ? 7 : 5;
        if (m.state === 'transit' && m.hopTo) {
          const a = SCHEMA[m.at];
          const b = SCHEMA[m.hopTo];
          const f = Math.max(0, Math.min(1, (st.clock - m.hopStart) / Math.max(0.01, m.hopEnd - m.hopStart)));
          x = a.x + (b.x - a.x) * f;
          y = a.y + (b.y - a.y) * f;
        } else if (m.state === 'queued' || m.state === 'stored') {
          const key = m.at;
          const i = stack.get(key) ?? 0;
          stack.set(key, i + 1);
          const n = SCHEMA[m.at];
          x = n.x - 30 + (i % 6) * 12;
          y = n.y + 42 + Math.floor(i / 6) * 12;
          r = 4.5;
        } else continue;
        const c = pool[k++] as SVGCircleElement;
        c.setAttribute('cx', x.toFixed(1));
        c.setAttribute('cy', y.toFixed(1));
        c.setAttribute('r', String(r));
        c.setAttribute('fill', m.state === 'stored' ? '#FF9E43' : PCOL[m.priority]);
        c.setAttribute('opacity', '1');
      }
      for (; k < pool.length; k++) (pool[k] as SVGCircleElement).setAttribute('opacity', '0');
      // data-mule drone
      const md = st.drones.find((d) => d.flight?.purpose === 'mule');
      if (mule.current) {
        if (md?.flight?.from && md.flight.to) {
          const a = SCHEMA[md.flight.from];
          const b = SCHEMA[md.flight.to];
          const f = md.flight.s / md.flight.total;
          mule.current.setAttribute('transform', `translate(${a.x + (b.x - a.x) * f},${a.y + (b.y - a.y) * f - 26})`);
          mule.current.setAttribute('opacity', '1');
        } else mule.current.setAttribute('opacity', '0');
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const reach = commPath(s, 'S3', 'CC');
  return (
    <svg viewBox="0 0 880 340" className="h-auto w-full" role="img" aria-label={`Mesh network schematic. ${reach ? `Current path from S3 to command: ${reach.join(' to ')}` : 'No radio path from S3 to command'}.`}>
      <defs>
        <pattern id="mgrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#132536" />
        </pattern>
      </defs>
      <rect width="880" height="340" fill="url(#mgrid)" />
      {s.links.map((l) => {
        const a = SCHEMA[l.a];
        const b = SCHEMA[l.b];
        const ok = linkUsable(s, l);
        const onPath = reach && reach.some((n, i) => i > 0 && ((reach[i - 1] === l.a && n === l.b) || (reach[i - 1] === l.b && n === l.a)));
        return (
          <g key={l.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ok ? '#61E6E0' : '#FF6B5E'} strokeOpacity={ok ? (onPath ? 0.95 : 0.4) : 0.8} strokeWidth={onPath ? 3 : 2} strokeDasharray={ok ? (l.kind === 'backhaul' ? '0' : '7 6') : '3 7'} className={ok && onPath ? 'flow-dash' : ''} />
            {!ok && (
              <g transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2})`}>
                <circle r="11" fill="#07111B" stroke="#FF6B5E" />
                <path d="M-4-4L4 4M4-4L-4 4" stroke="#FF6B5E" strokeWidth="2" />
                {l.recoverAt !== null && (
                  <text y="-16" textAnchor="middle" fontSize="11" fill="#FF9E43" fontFamily="JetBrains Mono, monospace">
                    back in {Math.max(0, Math.ceil((l.recoverAt - s.clock) / 60))} min
                  </text>
                )}
              </g>
            )}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth="22"
              className="cursor-pointer"
              onClick={() => l.a !== 'CC' && setLink(l.a, l.b, !l.up)}
              aria-label={`${l.a}–${l.b} link`}
            />
          </g>
        );
      })}
      {(Object.keys(SCHEMA) as NodeId[]).map((id) => {
        const n = SCHEMA[id];
        const st = s.stations[id];
        const queued = s.messages.filter((m) => m.at === id && (m.state === 'queued' || m.state === 'stored')).length;
        return (
          <g key={id} transform={`translate(${n.x},${n.y})`} className={id === 'CC' ? '' : 'cursor-pointer'} onClick={() => id !== 'CC' && (st.online ? disableStation(id) : restoreStation(id))}>
            {st.online && <circle r="26" fill="none" stroke="#61E6E0" strokeOpacity="0.18" />}
            <rect x="-15" y="-15" width="30" height="30" rx="4" fill={id === 'CC' || id === 'G' ? '#FF9E43' : '#0D1B28'} stroke={st.online ? '#61E6E0' : '#FF6B5E'} strokeWidth="2.5" />
            {!st.online && <path d="M-8-8L8 8M8-8L-8 8" stroke="#FF6B5E" strokeWidth="3" />}
            <text y="-24" textAnchor="middle" fontSize="13" fill={st.online ? '#EAF2F8' : '#FF6B5E'} fontFamily="JetBrains Mono, monospace">
              {NAME[id]}
              {!st.online ? ' · OFFLINE' : ''}
            </text>
            {queued > 0 && (
              <text y="34" textAnchor="middle" fontSize="11" fill="#8EA3B5" fontFamily="JetBrains Mono, monospace">
                queue {queued}
              </text>
            )}
          </g>
        );
      })}
      <g ref={dots}>
        {Array.from({ length: 40 }, (_, i) => (
          <circle key={i} r="5" opacity="0" stroke="#07111B" strokeWidth="1.5" />
        ))}
      </g>
      <g ref={mule} opacity="0">
        <rect x="-26" y="-11" width="52" height="20" rx="3" fill="#07111B" stroke="#FF9E43" />
        <text textAnchor="middle" y="4" fontSize="11" fill="#FF9E43" fontFamily="JetBrains Mono, monospace">
          MULE
        </text>
      </g>
    </svg>
  );
}

export function MeshLab() {
  const s = useSim();
  const [linkSel, setLinkSel] = useState('S2-S3');
  const c = messageCounts(s);
  const msgEvents = s.events.filter((e) => e.kind === 'msg' || (e.kind === 'ok' && /deliver|SOS|recovered|restored/i.test(e.text)) || (e.kind === 'warn' && /store|radio path|re-queued/i.test(e.text)) || (e.kind === 'drone' && /mule/i.test(e.text))).slice(-7).reverse();
  const sel = s.links.find((l) => `${l.a}-${l.b}` === linkSel)!;

  return (
    <Chapter id="technology" label="06 · Mesh communication">
      <ChapterHeader no="06" kicker="Technology · decentralized mesh" title="No towers, no master node. Messages find their own way out.">
        Stations are nodes and radio links are edges. Each message hops station to station; if a link fails it reroutes, and if no path exists it waits in a store-and-forward queue until one returns or a drone carries it. Click a node or link in the diagram to fail or restore it.
      </ChapterHeader>

      <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-mist">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-white" /> P0 SOS</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-signal" /> P1 control</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#3FB3AD]" /> P2 telemetry</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#5F8A96]" /> P3 general</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber" /> stored</span>
            </div>
            <SimBadge />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[640px] p-2">
              <MeshDiagram />
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-px border-t border-line bg-line sm:grid-cols-6">
            {[
              ['Clock', formatClock(s.clock)],
              ['Queued', c.queued],
              ['In transit', c.transit],
              ['Stored', c.stored],
              ['On mule', c.mule],
              ['Delivered', c.delivered],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface px-3 py-2">
                <dt className="label text-[10px]">{k}</dt>
                <dd className="num font-mono text-[15px] text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="grid content-start gap-3">
          <div className="panel grid gap-2 p-4">
            <span className="label">Send traffic</span>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" size="sm" icon="alert" onClick={() => sendSOSAction('S3')}>
                Send SOS
              </Button>
              <Button size="sm" icon="inbox" onClick={() => trafficBurst()}>
                Queue P1–P3
              </Button>
            </div>
            <p className="text-[13px] text-dim">Queue a burst first, then send an SOS: P0 jumps every queue it meets.</p>
          </div>
          <div className="panel grid gap-2 p-4">
            <span className="label">Break things</span>
            <div className="flex gap-2">
              <label htmlFor="link-select" className="sr-only">
                Link
              </label>
              <select id="link-select" value={linkSel} onChange={(e) => setLinkSel(e.target.value)} className="min-h-[38px] flex-1 rounded-md border border-line bg-night px-2 font-mono text-[13px] text-ink">
                {s.links
                  .filter((l) => l.a !== 'CC')
                  .map((l) => (
                    <option key={l.id} value={`${l.a}-${l.b}`}>
                      {l.a}–{l.b} {l.up ? '' : '(down)'}
                    </option>
                  ))}
              </select>
              <Button size="sm" variant={sel?.up ? 'danger' : 'signal'} icon={sel?.up ? 'unlink' : 'link'} onClick={() => sel && setLink(sel.a, sel.b, !sel.up)}>
                {sel?.up ? 'Break' : 'Restore'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant={s.stations.S2.online ? 'danger' : 'signal'} icon="power" onClick={() => (s.stations.S2.online ? disableStation('S2') : restoreStation('S2'))}>
                {s.stations.S2.online ? 'Disable S2' : 'Restore S2'}
              </Button>
              <Button size="sm" icon="clock" onClick={() => isolateS3WithDelayedRecovery()}>
                Isolate S3 · slow recovery
              </Button>
            </div>
            <Toggle on={s.conditions.storeForward} onChange={setStoreForward} icon="inbox" tone="signal">
              Store-and-forward
            </Toggle>
            <Toggle on={s.conditions.dataMule} onChange={setDataMule} icon="drone">
              Drone data-mule
            </Toggle>
            <Button size="sm" variant="ghost" icon="reset" onClick={() => restoreNormal()}>
              Restore all links and stations
            </Button>
          </div>
          <div className="panel p-4">
            <span className="label">Message log</span>
            <ol className="mt-2 grid gap-1.5 font-mono text-[12px] leading-snug" aria-live="polite">
              {msgEvents.length === 0 && <li className="text-dim">No messages yet.</li>}
              {msgEvents.map((e) => (
                <li key={e.id} className={e.kind === 'warn' ? 'text-amber' : e.kind === 'ok' ? 'text-go' : 'text-mist'}>
                  <span className="text-dim">{formatClock(e.t)}</span> {e.text}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { i: 'route' as const, t: 'Multi-hop forwarding', b: 'Each station only needs to reach its neighbour. LoRa (865–867 MHz, licence-free; rules apply) carries SOS, text and telemetry; directional 5.8 GHz / 900 MHz links carry backhaul.' },
          { i: 'link' as const, t: 'Automatic rerouting', b: 'B.A.T.M.A.N. / AODV-style routing recomputes paths when a node or link drops. Here the model uses shortest open path over the live graph.' },
          { i: 'inbox' as const, t: 'Store-and-forward', b: 'With no path, a node holds the bundle (DTN-style) and releases it when any route returns, instead of claiming delivery.' },
          { i: 'drone' as const, t: 'Drone data-mule', b: 'If the radio chain stays cut, a docked drone can fly the stored bundle to a station that still has a path out.' },
        ].map((x) => (
          <div key={x.t} className="panel p-4">
            <Icon name={x.i} className="text-signal" />
            <h3 className="mt-3 text-lg font-bold">{x.t}</h3>
            <p className="mt-1 text-[15px] leading-snug text-mist">{x.b}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-dim">
        <Tag>Caveat</Tag> The architecture is decentralized in concept. Whether a given failure is recoverable depends on terrain line of sight, station placement and the final radio hardware.
      </p>
    </Chapter>
  );
}
