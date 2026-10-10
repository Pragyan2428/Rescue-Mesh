import type { PartKey } from '../models/DockingStation';

export interface PartInfo {
  name: string;
  short: string;
  purpose: string;
  role: string;
  caveat: string;
}

/** Station component inspector content (deck slides 9-11, 15-16). */
export const PARTS: Record<PartKey, PartInfo> = {
  frame: {
    name: 'Reinforced frame',
    short: 'Frame',
    purpose: 'Steel or aluminium truss that carries the deck, mast and turbine loads down into the anchors.',
    role: 'Keeps the landing bay level and the antenna aligned so the dock and relay keep working in high wind.',
    caveat: 'Member sizes are conceptual. Design wind ~100 km/h (~370 Pa at altitude) must be confirmed by structural analysis (FEA).',
  },
  enclosure: {
    name: 'Ruggedised enclosure',
    short: 'Enclosure',
    purpose: 'Rounded, sealed housing for radio, controller, GPS and power electronics, with hinged access panels.',
    role: 'Protects the comms core from cold, moisture and debris; the rounded profile lowers wind load.',
    caveat: 'Ingress rating, insulation and heating need validation for monsoon and sub-zero conditions.',
  },
  anchors: {
    name: 'Anchoring system',
    short: 'Anchors',
    purpose: 'Four or more independent rock anchors or micropiles (ground screws on stable soil).',
    role: 'Any single anchor can fail without losing the station; tilt sensors flag ground movement.',
    caveat: 'Anchor type and depth depend on a geotechnical survey of each site.',
  },
  pad: {
    name: 'Sheltered landing bay',
    short: 'Landing bay',
    purpose: 'Deck-level landing pad with bay doors that close over it in bad weather.',
    role: 'Touch-down in a gust is the hardest moment of a flight; the bay shelters the drone while it charges.',
    caveat: 'Landing tolerance in turbulent wind must be tested with the selected airframe.',
  },
  contacts: {
    name: 'Charging contacts + centring guides',
    short: 'Contacts',
    purpose: 'Sloped guides push the drone onto copper contact strips after landing.',
    role: 'Lets the dock charge (or swap) the battery without a person on site.',
    caveat: 'Contact charging rate and corrosion resistance need hardware validation.',
  },
  mast: {
    name: 'Communication antenna mast',
    short: 'Antenna mast',
    purpose: 'LoRa antenna for SOS/text/telemetry plus a directional 5.8 GHz / 900 MHz backhaul link.',
    role: 'Makes every station a mesh node; sited for ridge line of sight to its neighbours.',
    caveat: 'Link range depends on terrain line of sight; frequencies and power need regulatory approval.',
  },
  turbine: {
    name: 'Compact wind turbine',
    short: 'Wind turbine',
    purpose: 'Small turbine that furls and brakes above its cut-out speed.',
    role: 'Wind power scales with v³, so steady mountain wind adds energy when the sun is weak.',
    caveat: 'Small turbines rate near 12 m/s and furl at high wind; turbulence lowers real yield.',
  },
  solar: {
    name: 'Low-profile solar panels',
    short: 'Solar',
    purpose: 'Two ~400 W panels mounted low to reduce wind load.',
    role: 'Strong high-altitude sun covers most daytime load and charging.',
    caveat: 'Output drops sharply in monsoon cloud and snow cover.',
  },
  battery: {
    name: 'Insulated battery compartment',
    short: 'Battery',
    purpose: 'LiFePO4 bank (~10 kWh, ~8 kWh usable) with BMS and heater, placed in the base.',
    role: 'Heavy mass sits low for a low centre of gravity; a locked ~2 kWh slice keeps comms alive.',
    caveat: 'Capacity is a design estimate; cold derating and heater energy need field data.',
  },
  sensors: {
    name: 'Weather, tilt and voltage sensors',
    short: 'Sensors',
    purpose: 'Anemometer and temperature shield, base tilt sensor and DC-bus voltage monitor.',
    role: 'Feeds go/no-go decisions, landslide alerts and station health over the mesh.',
    caveat: 'Thresholds are configurable assumptions until validated.',
  },
  shutdown: {
    name: 'Emergency shutdown + bay doors',
    short: 'Shutdown',
    purpose: 'Bay doors close over the pad and the turbine brakes when limits are exceeded.',
    role: 'The station rides out the storm with the drone sheltered and the comms core running.',
    caveat: 'Actuators must work in icing conditions; fail-safe states need testing.',
  },
  drainage: {
    name: 'Raised base + drainage',
    short: 'Drainage',
    purpose: 'Raised slab with a sloped deck and drain channels.',
    role: 'Lets water and debris pass instead of undermining the station.',
    caveat: 'Sites must avoid gullies and flood lines; drainage sizing is conceptual.',
  },
  radio: {
    name: 'Mesh radio',
    short: 'Mesh radio',
    purpose: 'LoRa radio for SOS and telemetry; B.A.T.M.A.N. / AODV routing, DTN bundles.',
    role: 'Forwards messages hop by hop with P0–P3 priority queues and store-and-forward.',
    caveat: 'Throughput is low; long messages and images need the backhaul link.',
  },
  controller: {
    name: 'Edge controller',
    short: 'Controller',
    purpose: 'Raspberry Pi / Jetson-class computer running station logic and telemetry (MAVLink + MQTT).',
    role: 'Runs load shedding, dock control, health checks and message queues locally.',
    caveat: 'Software reliability and watchdog behaviour need long-duration testing.',
  },
  gps: {
    name: 'GPS / time sync',
    short: 'GPS',
    purpose: 'Multi-constellation GNSS for position and time.',
    role: 'Keeps message timestamps, logs and flight plans consistent across the mesh.',
    caveat: 'Valley walls can degrade GNSS; holdover timing is needed.',
  },
  chargeCtrl: {
    name: 'Charge controllers + DC bus',
    short: 'Charge controllers',
    purpose: 'Wind charge controller and MPPT solar controller feeding a protected DC bus.',
    role: 'Routes generation into the battery and distributes power to loads by priority.',
    caveat: 'Controller sizing follows the illustrative power budget, not measured loads.',
  },
  charger: {
    name: 'Drone charger',
    short: 'Drone charger',
    purpose: 'Charges a 500 Wh drone pack through the pad contacts (~0.6 kWh per sortie at 85% efficiency).',
    role: 'The largest load on the station, and the first one shed when energy runs low.',
    caveat: 'Charge time and sorties per day depend on the final pack and weather.',
  },
};

export interface Subsystem {
  id: string;
  label: string;
  keys: PartKey[];
  blurb: string;
}

export const SUBSYSTEMS: Subsystem[] = [
  { id: 'structure', label: 'Structure', keys: ['frame', 'anchors', 'drainage', 'battery'], blurb: 'Reinforced frame, low centre of gravity, redundant anchoring and drainage.' },
  { id: 'drone', label: 'Drone interface', keys: ['pad', 'contacts'], blurb: 'Sheltered landing bay, charging contacts and positioning guides.' },
  { id: 'comms', label: 'Communication', keys: ['mast', 'radio', 'controller', 'gps'], blurb: 'Antenna, mesh radio, controller and GPS/time synchronisation.' },
  { id: 'power', label: 'Power', keys: ['turbine', 'solar', 'chargeCtrl', 'battery', 'charger'], blurb: 'Wind turbine, solar panels, charge controllers, battery and BMS.' },
  { id: 'monitoring', label: 'Monitoring', keys: ['sensors'], blurb: 'Weather, temperature, tilt, voltage and link-health monitoring.' },
  { id: 'safety', label: 'Safety', keys: ['shutdown', 'turbine'], blurb: 'Turbine braking, shutdown logic, bay closure and fault indicators.' },
];
