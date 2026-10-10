export type NodeId = 'CC' | 'G' | 'S1' | 'S2' | 'S2b' | 'S3';
export type Priority = 0 | 1 | 2 | 3;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Km2 {
  x: number;
  z: number;
}

export interface StationState {
  id: NodeId;
  name: string;
  kind: 'command' | 'gateway' | 'station';
  online: boolean;
  batteryPct: number;
  windKmh: number;
  tempC: number;
  tiltOk: boolean;
  voltageOk: boolean;
  dockOccupiedBy: string | null;
  powerMode: 'normal' | 'shed';
  faults: string[];
}

export interface CommLink {
  id: string;
  a: NodeId;
  b: NodeId;
  kind: 'lora' | 'backhaul';
  up: boolean;
  /** sim time when an auto-recovery is scheduled */
  recoverAt: number | null;
}

export interface HopPlan {
  from: NodeId;
  to: NodeId;
  distanceKm: number;
  climbM: number;
  windKmh: number;
  energyPct: number;
  departBattery: number;
  arriveBattery: number;
  /** horizontal path in km */
  path: Km2[];
  /** 3D flight profile in world units (cruise section only) */
  profile: Vec3[];
  maxRisk: number;
}

export type EdgeVerdict = 'ok' | 'energy' | 'weather' | 'offline' | 'blocked' | 'no-path';

export interface EdgeEval {
  from: NodeId;
  to: NodeId;
  distanceKm: number;
  energyPct: number;
  verdict: EdgeVerdict;
  detail: string;
}

export interface RoutePlan {
  feasible: boolean;
  origin: NodeId;
  target: NodeId;
  payloadKg: number;
  route: NodeId[];
  hops: HopPlan[];
  totalKm: number;
  totalEnergyPct: number;
  reason: string;
  evaluated: EdgeEval[];
  createdAt: number;
}

export type FlightPurpose = 'hop' | 'drop' | 'return' | 'divert' | 'mule';

export interface Flight {
  purpose: FlightPurpose;
  from: NodeId | null;
  to: NodeId | null;
  pts: Vec3[];
  cum: number[];
  total: number;
  /** segment index ranges: [0, climbEnd) climb, [climbEnd, descendStart) cruise, rest descent */
  climbEnd: number;
  descendStart: number;
  s: number;
  energyPct: number;
  startBattery: number;
}

export type DroneState = 'docked' | 'charging' | 'flying' | 'holding' | 'delivering' | 'grounded';

export interface Drone {
  id: string;
  label: string;
  at: NodeId | null;
  pos: Vec3;
  heading: number;
  bank: number;
  batteryPct: number;
  state: DroneState;
  payloadKg: number;
  missionId: string | null;
  flight: Flight | null;
  chargeUntil: number | null;
  /** message ids carried as a data-mule bundle */
  bundle: string[];
  /** 0..1 payload release animation */
  release: number;
}

export type MissionStatus = 'active' | 'holding' | 'delivered' | 'completed' | 'interrupted';

export type MissionStep =
  | 'request'
  | 'received'
  | 'identify'
  | 'assign'
  | 'plan'
  | 'checks'
  | 'depart'
  | 'transit'
  | 'deliver'
  | 'confirm'
  | 'return'
  | 'logged';

export interface Mission {
  id: string;
  presetId: string;
  label: string;
  priority: 'P0' | 'P1';
  payloadKg: number;
  droneId: string | null;
  origin: NodeId;
  target: NodeId | null;
  step: MissionStep;
  stepsDone: MissionStep[];
  status: MissionStatus;
  statusText: string;
  createdAt: number;
  sosMessageId: string | null;
  confirmMessageId: string | null;
  nextCheckAt: number;
  delivered: boolean;
  confirmed: boolean;
  droneBackAtDock: boolean;
}

export type MessageState = 'queued' | 'transit' | 'stored' | 'delivered' | 'lost' | 'mule';
export type MessageKind = 'sos' | 'confirm' | 'control' | 'telemetry' | 'general';

export interface Message {
  id: string;
  priority: Priority;
  kind: MessageKind;
  label: string;
  origin: NodeId;
  dest: NodeId;
  at: NodeId;
  hopTo: NodeId | null;
  hopStart: number;
  hopEnd: number;
  state: MessageState;
  createdAt: number;
  deliveredAt: number | null;
  hops: NodeId[];
  missionId: string | null;
  storedLogged: boolean;
}

export type EventKind = 'info' | 'ok' | 'warn' | 'fail' | 'msg' | 'drone' | 'route';

export interface SimEvent {
  id: number;
  t: number;
  kind: EventKind;
  text: string;
}

export interface Alert {
  id: number;
  t: number;
  severity: 'critical' | 'warning';
  text: string;
  acknowledged: boolean;
  key: string;
}

export interface Conditions {
  highWind: boolean;
  corridorBlocked: boolean;
  storeForward: boolean;
  dataMule: boolean;
}

export interface SimState {
  version: number;
  clock: number;
  paused: boolean;
  speed: number;
  stations: Record<NodeId, StationState>;
  links: CommLink[];
  conditions: Conditions;
  drones: Drone[];
  missions: Mission[];
  activeMissionId: string | null;
  messages: Message[];
  events: SimEvent[];
  alerts: Alert[];
  plan: RoutePlan | null;
  previousPlan: RoutePlan | null;
  nodeNextSlot: Record<NodeId, number>;
  selectedStation: NodeId | null;
  highlight: string | null;
  seq: number;
}
