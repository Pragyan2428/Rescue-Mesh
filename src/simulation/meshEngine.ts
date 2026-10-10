/**
 * Decentralized mesh messaging: hop-by-hop forwarding with priority queues,
 * automatic rerouting, store-and-forward and data-mule hand-off.
 */
import { SYSTEM } from '../data/systemConstants';
import { commPath, linkId, linkUsable } from './networkGraph';
import { log } from './store';
import type { Message, MessageKind, NodeId, Priority, SimState } from './types';

type DeliveredHook = (s: SimState, m: Message) => void;
const hooks: DeliveredHook[] = [];
export function onMessageDelivered(h: DeliveredHook): void {
  hooks.push(h);
}

export const PRIORITY_LABEL: Record<Priority, string> = { 0: 'P0 SOS / medical', 1: 'P1 Mission control', 2: 'P2 Telemetry', 3: 'P3 General' };

export function sendMessage(
  s: SimState,
  o: { kind: MessageKind; priority: Priority; origin: NodeId; dest: NodeId; label: string; missionId?: string | null },
): Message {
  const m: Message = {
    id: `M${s.seq++}`,
    priority: o.priority,
    kind: o.kind,
    label: o.label,
    origin: o.origin,
    dest: o.dest,
    at: o.origin,
    hopTo: null,
    hopStart: 0,
    hopEnd: 0,
    state: 'queued',
    createdAt: s.clock,
    deliveredAt: null,
    hops: [o.origin],
    missionId: o.missionId ?? null,
    storedLogged: false,
  };
  s.messages.push(m);
  if (!s.stations[o.origin].online) {
    m.state = 'lost';
    log(s, 'fail', `${o.label}: origin ${o.origin} is offline, message could not be sent`);
  }
  return m;
}

function findLink(s: SimState, a: NodeId, b: NodeId) {
  const id = linkId(a, b);
  return s.links.find((l) => l.id === id);
}

export function processMesh(s: SimState): void {
  // 1. messages in transit
  for (const m of s.messages) {
    if (m.state !== 'transit' || !m.hopTo) continue;
    const l = findLink(s, m.at, m.hopTo);
    if (!l || !linkUsable(s, l)) {
      log(s, 'warn', `Link ${m.at}–${m.hopTo} lost mid-hop. ${m.label} re-queued at ${m.at}`);
      m.state = 'queued';
      m.hopTo = null;
      continue;
    }
    if (s.clock >= m.hopEnd) {
      m.at = m.hopTo;
      m.hops.push(m.at);
      m.hopTo = null;
      if (m.at === m.dest) {
        m.state = 'delivered';
        m.deliveredAt = s.clock;
        if (!m.missionId && m.priority <= 1) log(s, 'ok', `${m.label} delivered to ${m.dest} via ${m.hops.join(' → ')} (${Math.round(s.clock - m.createdAt)} s)`);
        hooks.forEach((h) => h(s, m));
      } else {
        m.state = 'queued';
      }
    }
  }
  // 2. stored messages: release when a path returns
  for (const m of s.messages) {
    if (m.state !== 'stored') continue;
    if (!s.stations[m.at].online) continue;
    if (commPath(s, m.at, m.dest)) {
      m.state = 'queued';
      log(s, 'msg', `Path restored: ${m.label} released from store at ${m.at}`);
    }
  }
  // 3. each node forwards one message per slot, highest priority first
  const byNode = new Map<NodeId, Message[]>();
  for (const m of s.messages) {
    if (m.state !== 'queued') continue;
    if (!s.stations[m.at].online) continue;
    const arr = byNode.get(m.at) ?? [];
    arr.push(m);
    byNode.set(m.at, arr);
  }
  for (const [node, q] of byNode) {
    if (s.clock < s.nodeNextSlot[node]) continue;
    q.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    for (const m of q) {
      const path = commPath(s, node, m.dest);
      if (!path) {
        if (s.conditions.storeForward) {
          m.state = 'stored';
          if (!m.storedLogged) {
            m.storedLogged = true;
            log(s, 'warn', `No radio path from ${node} to ${m.dest}. ${m.label} held in store-and-forward queue`);
          }
        } else {
          m.state = 'lost';
          log(s, 'fail', `No radio path from ${node}; store-and-forward disabled, ${m.label} dropped`);
        }
        continue; // try the next message in this slot
      }
      m.state = 'transit';
      m.hopTo = path[1];
      m.hopStart = s.clock;
      m.hopEnd = s.clock + SYSTEM.meshHopSeconds;
      s.nodeNextSlot[node] = s.clock + SYSTEM.meshSlotSeconds;
      break;
    }
  }
}

export function queueTrafficBurst(s: SimState): void {
  const items: { p: Priority; k: MessageKind; o: NodeId; d: NodeId; l: string }[] = [
    { p: 3, k: 'general', o: 'S3', d: 'CC', l: 'P3 status note' },
    { p: 3, k: 'general', o: 'S3', d: 'CC', l: 'P3 roster update' },
    { p: 2, k: 'telemetry', o: 'S3', d: 'CC', l: 'P2 S3 telemetry' },
    { p: 3, k: 'general', o: 'S3', d: 'CC', l: 'P3 supply list' },
    { p: 2, k: 'telemetry', o: 'S2', d: 'CC', l: 'P2 S2 telemetry' },
    { p: 1, k: 'control', o: 'CC', d: 'S3', l: 'P1 mission control' },
    { p: 2, k: 'telemetry', o: 'S1', d: 'CC', l: 'P2 S1 telemetry' },
    { p: 3, k: 'general', o: 'S2b', d: 'CC', l: 'P3 general' },
  ];
  for (const it of items) sendMessage(s, { kind: it.k, priority: it.p, origin: it.o, dest: it.d, label: it.l });
  log(s, 'msg', `Traffic burst queued: ${items.length} lower-priority messages`);
}

export function sendSOS(s: SimState, origin: NodeId = 'S3', missionId: string | null = null): Message {
  const m = sendMessage(s, { kind: 'sos', priority: 0, origin, dest: 'CC', label: 'P0 SOS', missionId });
  if (!missionId) log(s, 'msg', `P0 SOS entered the mesh at ${origin}`);
  return m;
}

export function messageCounts(s: SimState) {
  const c = { queued: 0, transit: 0, stored: 0, delivered: 0, lost: 0, mule: 0 };
  for (const m of s.messages) c[m.state]++;
  return c;
}
