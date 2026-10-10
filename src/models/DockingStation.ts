/**
 * RescueMesh autonomous docking station (procedural, metres).
 * Heavy equipment sits low (battery in the base) for a low centre of gravity.
 * Parts are grouped so the viewer can explode, cut away, highlight and isolate.
 */
import * as THREE from 'three';
import { PALETTE, emissive, mesh, roundedBox, std, strut } from './materials';
import { createWindTurbine } from './WindTurbine';
import { createSolarArray } from './SolarArray';
import { createAntennaMast } from './Antenna';
import { createBatteryModules } from './BatteryModules';
import { createAnchor } from './AnchorAssembly';
import { setEmphasis } from './emphasis';

export type PartKey =
  | 'frame'
  | 'enclosure'
  | 'anchors'
  | 'pad'
  | 'contacts'
  | 'mast'
  | 'turbine'
  | 'solar'
  | 'battery'
  | 'sensors'
  | 'shutdown'
  | 'drainage'
  | 'radio'
  | 'controller'
  | 'gps'
  | 'chargeCtrl'
  | 'charger';

export const PAD_TOP_M = 2.8;

interface Opts {
  detail: 'high' | 'low';
}

export function createDockingStation({ detail }: Opts) {
  const high = detail === 'high';
  const root = new THREE.Group();
  root.name = 'DockingStation';
  const groups = {} as Record<PartKey, THREE.Group>;
  const mk = (k: PartKey) => {
    const g = new THREE.Group();
    g.name = k;
    groups[k] = g;
    root.add(g);
    return g;
  };
  const steel = std(PALETTE.steel, 0.42, 0.65);
  const dark = std(PALETTE.darkSteel, 0.5, 0.55);
  const shell = std(PALETTE.enclosure, 0.42, 0.25);
  const shellDark = std(PALETTE.enclosureDark, 0.5, 0.3);
  const concrete = std(PALETTE.concrete, 0.95, 0.0);
  const insul = std(PALETTE.insulation, 0.85, 0.05);
  const yellow = std(PALETTE.safetyYellow, 0.5, 0.2);

  // ---------- drainage slab ----------
  const slab = mk('drainage');
  slab.add(mesh(new THREE.BoxGeometry(4.8, 0.3, 5.8), concrete, [0, 0.15, 0.5]));
  for (const x of [-2.15, 2.15]) slab.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 5.6), std(0x3e3f3c, 0.9, 0), [x, 0.31, 0.5]));
  slab.add(mesh(new THREE.BoxGeometry(4.5, 0.05, 0.16), std(0x3e3f3c, 0.9, 0), [0, 0.31, 3.25]));

  // ---------- anchors (4 redundant points) ----------
  const anchors = mk('anchors');
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    anchors.add(createAnchor(new THREE.Vector3(sx * 1.85, 0.9, sz * 1.55), new THREE.Vector3(sx * 2.6, -0.02, sz * 2.3)));
  }

  // ---------- battery compartment (low, insulated) ----------
  const battery = mk('battery');
  const batWalls = new THREE.Group();
  batWalls.name = 'batteryWalls';
  batWalls.add(mesh(new THREE.BoxGeometry(3.0, 0.08, 2.4), insul, [0, 1.11, 0]));
  batWalls.add(mesh(new THREE.BoxGeometry(3.0, 0.85, 0.08), insul, [0, 0.725, 1.16]));
  batWalls.add(mesh(new THREE.BoxGeometry(3.0, 0.85, 0.08), insul, [0, 0.725, -1.16]));
  batWalls.add(mesh(new THREE.BoxGeometry(0.08, 0.85, 2.4), insul, [1.46, 0.725, 0]));
  batWalls.add(mesh(new THREE.BoxGeometry(0.08, 0.85, 2.4), insul, [-1.46, 0.725, 0]));
  if (high) for (let i = -1; i <= 1; i++) batWalls.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.02), std(0xa59a82, 0.8, 0.05), [i * 0.95, 0.72, 1.21]));
  battery.add(batWalls);
  const modules = createBatteryModules(4, 2);
  modules.group.position.set(0, 0.32, 0);
  battery.add(modules.group);

  // ---------- main enclosure (rounded, ruggedised) ----------
  const enclosure = mk('enclosure');
  const encShell = mesh(roundedBox(3.3, 1.25, 2.7, 0.28, high ? 4 : 2), shell, [0, 1.78, 0]);
  encShell.name = 'enclosureShell';
  enclosure.add(encShell);
  if (high) {
    // access panels, hinges, fasteners, vents
    for (const x of [-0.72, 0.72]) {
      enclosure.add(mesh(new THREE.BoxGeometry(1.15, 0.85, 0.03), shellDark, [x, 1.78, 1.36]));
      for (const y of [1.5, 2.06]) enclosure.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), dark, [x - 0.6, y, 1.38]));
      for (const fx of [-0.5, 0.5]) for (const fy of [1.4, 2.16]) enclosure.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 6), steel, [x + fx, fy, 1.385], [Math.PI / 2, 0, 0]));
      enclosure.add(mesh(new THREE.BoxGeometry(0.18, 0.04, 0.05), dark, [x + 0.42, 1.78, 1.39]));
    }
    for (let i = 0; i < 6; i++) enclosure.add(mesh(new THREE.BoxGeometry(0.03, 0.5, 0.6), shellDark, [1.66, 1.78, -0.6 + i * 0.12 - 0.3]));
  }
  const statusStrip = mesh(new THREE.BoxGeometry(2.6, 0.035, 0.02), emissive(0x7bd88f, 2), [0, 2.32, 1.37]);
  statusStrip.userData.dynamic = true;
  enclosure.add(statusStrip);

  // internals (visible in cutaway)
  const internal = (k: PartKey, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number]) => {
    const g = mk(k);
    g.add(mesh(geo, mat, pos));
    return g;
  };
  const radio = internal('radio', new THREE.BoxGeometry(0.5, 0.32, 0.4), std(0x2a3b4a, 0.5, 0.3), [-0.95, 1.45, -0.6]);
  radio.add(mesh(new THREE.BoxGeometry(0.06, 0.03, 0.01), emissive(PALETTE.cyan, 2.5), [-0.82, 1.55, -0.395]));
  const controller = internal('controller', new THREE.BoxGeometry(0.55, 0.06, 0.4), std(0x1f5a3a, 0.6, 0.2), [-0.25, 1.36, -0.6]);
  controller.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), std(0x111111, 0.4, 0.5), [-0.25, 1.41, -0.6]));
  internal('gps', new THREE.BoxGeometry(0.22, 0.12, 0.22), std(0x3a4652, 0.5, 0.3), [0.3, 1.38, -0.6]);
  const chargeCtrl = mk('chargeCtrl');
  chargeCtrl.add(mesh(new THREE.BoxGeometry(0.42, 0.55, 0.22), std(0x41536a, 0.5, 0.3), [0.85, 1.6, -0.75]));
  chargeCtrl.add(mesh(new THREE.BoxGeometry(0.42, 0.55, 0.22), std(0x41536a, 0.5, 0.3), [1.35, 1.6, -0.75]));
  chargeCtrl.add(mesh(new THREE.BoxGeometry(1.9, 0.06, 0.08), std(PALETTE.copper, 0.35, 0.8), [0.2, 1.24, 0.3])); // DC bus
  const charger = mk('charger');
  charger.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5), std(0x4b4f58, 0.5, 0.4), [0.75, 1.4, 0.45]));
  charger.add(mesh(new THREE.BoxGeometry(0.15, 0.03, 0.01), emissive(PALETTE.amber, 2), [0.75, 1.5, 0.705]));

  // ---------- frame truss ----------
  const frame = mk('frame');
  const posts: [number, number][] = [
    [1.85, 1.55],
    [-1.85, 1.55],
    [1.85, -1.55],
    [-1.85, -1.55],
  ];
  for (const [x, z] of posts) frame.add(strut(new THREE.Vector3(x, 0.3, z), new THREE.Vector3(x, 2.66, z), 0.07, steel, 8));
  const ring = (y: number) => {
    frame.add(strut(new THREE.Vector3(-1.85, y, 1.55), new THREE.Vector3(1.85, y, 1.55), 0.05, steel));
    frame.add(strut(new THREE.Vector3(-1.85, y, -1.55), new THREE.Vector3(1.85, y, -1.55), 0.05, steel));
    frame.add(strut(new THREE.Vector3(1.85, y, -1.55), new THREE.Vector3(1.85, y, 1.55), 0.05, steel));
    frame.add(strut(new THREE.Vector3(-1.85, y, -1.55), new THREE.Vector3(-1.85, y, 1.55), 0.05, steel));
  };
  ring(0.4);
  ring(1.15);
  ring(2.62);
  // diagonal bracing on side faces
  for (const x of [-1.85, 1.85]) {
    frame.add(strut(new THREE.Vector3(x, 1.15, -1.55), new THREE.Vector3(x, 2.62, 1.55), 0.035, steel));
    frame.add(strut(new THREE.Vector3(x, 1.15, 1.55), new THREE.Vector3(x, 2.62, -1.55), 0.035, steel));
  }
  for (const z of [-1.55]) {
    frame.add(strut(new THREE.Vector3(-1.85, 1.15, z), new THREE.Vector3(1.85, 2.62, z), 0.035, steel));
    frame.add(strut(new THREE.Vector3(1.85, 1.15, z), new THREE.Vector3(-1.85, 2.62, z), 0.035, steel));
  }
  if (high) {
    // handrail with an access gap
    for (const [x, z] of [
      [-1.85, 1.55],
      [1.85, 1.55],
      [1.85, -1.55],
      [-1.85, -1.55],
      [0, -1.55],
    ])
      frame.add(strut(new THREE.Vector3(x, 2.72, z), new THREE.Vector3(x, 3.25, z), 0.025, yellow));
    frame.add(strut(new THREE.Vector3(-1.85, 3.25, -1.55), new THREE.Vector3(1.85, 3.25, -1.55), 0.025, yellow));
    frame.add(strut(new THREE.Vector3(1.85, 3.25, -1.55), new THREE.Vector3(1.85, 3.25, 1.55), 0.025, yellow));
    frame.add(strut(new THREE.Vector3(-1.85, 3.25, -1.55), new THREE.Vector3(-1.85, 3.25, 1.55), 0.025, yellow));
    // ladder
    for (let y = 0.5; y < 2.6; y += 0.3) frame.add(strut(new THREE.Vector3(-1.95, y, 0.9), new THREE.Vector3(-1.95, y, 1.3), 0.02, steel));
    frame.add(strut(new THREE.Vector3(-1.95, 0.3, 0.9), new THREE.Vector3(-1.95, 2.7, 0.9), 0.025, steel));
    frame.add(strut(new THREE.Vector3(-1.95, 0.3, 1.3), new THREE.Vector3(-1.95, 2.7, 1.3), 0.025, steel));
  }

  // ---------- landing deck / pad ----------
  const pad = mk('pad');
  pad.add(mesh(new THREE.BoxGeometry(3.8, 0.1, 3.2), dark, [0, 2.67, 0]));
  pad.add(mesh(new THREE.BoxGeometry(2.7, 0.08, 2.7), std(0x2b333b, 0.85, 0.1), [0, 2.76, 0]));
  const mark = std(PALETTE.amber, 0.6, 0.1, { emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.25 });
  pad.add(mesh(new THREE.TorusGeometry(0.9, 0.035, 6, 48), mark, [0, 2.805, 0], [Math.PI / 2, 0, 0]));
  pad.add(mesh(new THREE.BoxGeometry(0.06, 0.01, 0.9), mark, [-0.25, 2.805, 0]));
  pad.add(mesh(new THREE.BoxGeometry(0.06, 0.01, 0.9), mark, [0.25, 2.805, 0]));
  pad.add(mesh(new THREE.BoxGeometry(0.5, 0.01, 0.06), mark, [0, 2.805, 0]));
  const contacts = mk('contacts');
  const contactMat = std(PALETTE.copper, 0.3, 0.85, { emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0 });
  const contactStrips: THREE.Mesh[] = [];
  for (const x of [-0.42, 0.42]) {
    const c = mesh(new THREE.BoxGeometry(0.1, 0.02, 1.2), contactMat, [x, 2.81, 0]);
    contactStrips.push(c);
    contacts.add(c);
  }
  // centering guides: four sloped plates
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.rotation.y = (i * Math.PI) / 2;
    const plate = mesh(new THREE.BoxGeometry(1.6, 0.04, 0.38), std(0x8f9aa4, 0.4, 0.6), [0, 2.88, 1.18], [0.55, 0, 0]);
    g.add(plate);
    contacts.add(g);
  }

  // ---------- bay doors / shutdown ----------
  const shutdown = mk('shutdown');
  const doorMat = std(PALETTE.enclosure, 0.45, 0.25, { side: THREE.DoubleSide });
  const doors: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 1.5, 2.8, 0);
    const shellGeo = new THREE.CylinderGeometry(1.5, 1.5, 2.9, high ? 24 : 10, 1, true, 0, Math.PI / 2);
    // arc in the upper quadrant on this side, centred on the bay axis
    shellGeo.rotateX(Math.PI / 2);
    shellGeo.rotateZ(side > 0 ? Math.PI / 2 : Math.PI);
    const door = new THREE.Mesh(shellGeo, doorMat);
    door.castShadow = true;
    door.position.set(-side * 1.5, 0, 0);
    const pivot = new THREE.Group();
    pivot.add(door);
    hinge.add(pivot);
    hinge.userData.side = side;
    doors.push(hinge);
    shutdown.add(hinge);
  }
  const shutdownBox = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.16), std(PALETTE.coral, 0.5, 0.2), [-1.35, 2.0, 1.25]);
  shutdown.add(shutdownBox);

  // ---------- mast, turbine, solar ----------
  const mastG = mk('mast');
  const mast = createAntennaMast(3.4);
  mast.group.position.set(-1.75, 2.72, -1.45);
  mastG.add(mast.group);
  const turbineG = mk('turbine');
  const turbine = createWindTurbine(2.5, 0.9);
  turbine.group.position.set(1.75, 2.72, -1.45);
  turbineG.add(turbine.group);
  const solarG = mk('solar');
  const solar = createSolarArray(2, 1.0, 1.7, 0.42);
  solar.group.position.set(1.1, 0.3, 2.45);
  solar.group.rotation.y = 0;
  solarG.add(solar.group);

  // ---------- sensors ----------
  const sensors = mk('sensors');
  const shield = new THREE.Group();
  shield.position.set(2.05, 1.1, 1.2);
  for (let i = 0; i < 6; i++) shield.add(mesh(new THREE.CylinderGeometry(0.12 - i * 0.004, 0.13 - i * 0.004, 0.03, 14), std(PALETTE.white, 0.5, 0.05), [0, i * 0.06, 0]));
  sensors.add(shield);
  sensors.add(strut(new THREE.Vector3(1.85, 1.2, 1.2), new THREE.Vector3(2.05, 1.2, 1.2), 0.02, steel));
  sensors.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), yellow, [-1.55, 0.37, 1.95])); // tilt sensor on slab
  sensors.add(mesh(new THREE.BoxGeometry(0.18, 0.1, 0.06), std(0x2c3440, 0.5, 0.3), [0.2, 1.33, 0.38])); // voltage monitor on DC bus

  // ---------- cables ----------
  if (high) {
    const cableMat = std(0x111316, 0.7, 0.1);
    const cable = (pts: [number, number, number][]) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      return new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.025, 6), cableMat);
    };
    turbineG.add(cable([[1.75, 2.75, -1.4], [1.7, 2.6, -1.3], [1.5, 2.45, -1.1], [1.2, 2.3, -1.0]]));
    mastG.add(cable([[-1.75, 2.75, -1.4], [-1.65, 2.6, -1.25], [-1.45, 2.42, -1.05], [-1.1, 2.3, -0.9]]));
    solarG.add(cable([[0.4, 0.45, 2.0], [0.3, 0.6, 1.6], [0.6, 1.2, 1.4], [0.8, 1.3, 1.36]]));
  }

  // ---------- explode configuration ----------
  const explode: Partial<Record<PartKey, THREE.Vector3>> = {
    anchors: new THREE.Vector3(0, -0.4, 0),
    battery: new THREE.Vector3(0, 0.05, -3.6),
    enclosure: new THREE.Vector3(0, 2.0, 0),
    radio: new THREE.Vector3(-0.6, 1.0, -1.0),
    controller: new THREE.Vector3(0, 1.0, -1.1),
    gps: new THREE.Vector3(0.4, 1.0, -1.2),
    chargeCtrl: new THREE.Vector3(1.0, 0.9, -1.4),
    charger: new THREE.Vector3(1.2, 0.8, 0.8),
    pad: new THREE.Vector3(0, 3.8, 0),
    contacts: new THREE.Vector3(0, 4.4, 0),
    shutdown: new THREE.Vector3(0, 3.8, 0),
    mast: new THREE.Vector3(-1.6, 3.8, -1.2),
    turbine: new THREE.Vector3(1.8, 3.8, -1.2),
    solar: new THREE.Vector3(1.5, 0, 2.0),
    sensors: new THREE.Vector3(0.6, 0.4, 1.4),
  };
  const anchorsLocal: Record<PartKey, THREE.Vector3> = {
    frame: new THREE.Vector3(1.85, 2.0, 1.55),
    enclosure: new THREE.Vector3(-1.0, 2.35, 1.3),
    anchors: new THREE.Vector3(2.6, 0.0, 2.3),
    pad: new THREE.Vector3(-0.9, 2.82, 0.6),
    contacts: new THREE.Vector3(0.42, 2.82, 0.4),
    mast: new THREE.Vector3(-1.75, 5.6, -1.45),
    turbine: new THREE.Vector3(1.75, 5.2, -1.05),
    solar: new THREE.Vector3(1.6, 0.85, 2.6),
    battery: new THREE.Vector3(-1.2, 0.75, -1.2),
    sensors: new THREE.Vector3(2.05, 1.4, 1.2),
    shutdown: new THREE.Vector3(-1.35, 2.1, 1.35),
    drainage: new THREE.Vector3(0, 0.3, 3.3),
    radio: new THREE.Vector3(-0.95, 1.6, -0.6),
    controller: new THREE.Vector3(-0.25, 1.4, -0.6),
    gps: new THREE.Vector3(0.3, 1.45, -0.6),
    chargeCtrl: new THREE.Vector3(1.1, 1.9, -0.75),
    charger: new THREE.Vector3(0.75, 1.6, 0.45),
  };

  // leader lines for exploded view
  const leaderMat = new THREE.LineDashedMaterial({ color: 0x8ea3b5, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.8 });
  const leaders = new THREE.Group();
  root.add(leaders);
  const leaderLines: { key: PartKey; line: THREE.Line }[] = [];
  for (const k of Object.keys(explode) as PartKey[]) {
    const g = new THREE.BufferGeometry().setFromPoints([anchorsLocal[k], anchorsLocal[k]]);
    const line = new THREE.Line(g, leaderMat);
    line.visible = false;
    leaders.add(line);
    leaderLines.push({ key: k, line });
  }

  let explodeT = 0;
  let doorOpen = 1;
  let cutaway = false;
  let emphasis: { keys: PartKey[]; mode: 'highlight' | 'isolate' } | null = null;
  const shells = [encShell, batWalls];

  const applyEmphasis = () => {
    for (const k of Object.keys(groups) as PartKey[]) {
      const g = groups[k];
      let mode: 'normal' | 'highlight' | 'ghost' = 'normal';
      if (emphasis) {
        const on = emphasis.keys.includes(k);
        mode = on ? 'highlight' : emphasis.mode === 'isolate' ? 'ghost' : 'normal';
      }
      setEmphasis(g, mode);
    }
    if (cutaway) {
      for (const s of shells) {
        const parentKey = s === encShell ? 'enclosure' : 'battery';
        const on = emphasis?.keys.includes(parentKey as PartKey);
        if (!on) setEmphasis(s, 'glass');
      }
      // doors become glass so the bay stays readable
      if (!emphasis?.keys.includes('shutdown')) setEmphasis(groups.shutdown, 'glass');
    }
  };

  const api = {
    group: root,
    groups,
    padTop: 2.8,
    anchorsLocal,
    setExplode(t: number) {
      explodeT = t;
      for (const k of Object.keys(explode) as PartKey[]) {
        const off = explode[k]!;
        groups[k].position.copy(off).multiplyScalar(t);
      }
      for (const { key, line } of leaderLines) {
        line.visible = t > 0.05;
        const a = anchorsLocal[key];
        const b = a.clone().add(explode[key]!.clone().multiplyScalar(t));
        (line.geometry as THREE.BufferGeometry).setFromPoints([a, b]);
        line.computeLineDistances();
      }
    },
    getExplode: () => explodeT,
    setCutaway(on: boolean) {
      cutaway = on;
      applyEmphasis();
    },
    setEmphasis(keys: PartKey[] | null, mode: 'highlight' | 'isolate' = 'highlight') {
      emphasis = keys && keys.length ? { keys, mode } : null;
      applyEmphasis();
    },
    setDoors(open: number) {
      doorOpen = open;
    },
    setStatus(state: 'ok' | 'warn' | 'fault' | 'off') {
      mast.setStatus(state);
      const c = state === 'ok' ? 0x7bd88f : state === 'warn' ? PALETTE.amber : state === 'fault' ? PALETTE.coral : 0x1a1a1a;
      statusStrip.material = emissive(c, state === 'off' ? 0 : 2);
    },
    /** World-space label anchor for a part (accounts for explode). */
    labelAnchor(k: PartKey, target = new THREE.Vector3()) {
      target.copy(anchorsLocal[k]);
      if (explode[k]) target.addScaledVector(explode[k]!, explodeT);
      return root.localToWorld(target);
    },
    update(dt: number, t: number, o: { windKmh: number; braked: boolean; charging: number; chargeActive: boolean; sun: number }) {
      turbine.update(dt, o.windKmh, o.braked);
      mast.update(dt, o.windKmh);
      solar.setSun(o.sun);
      modules.setLevel(o.charging, o.chargeActive, t);
      contactMat.emissiveIntensity = o.chargeActive ? 0.8 + Math.sin(t * 8) * 0.4 : 0;
      // doors: open = folded outward flat; closed = meet over the pad
      for (const d of doors) {
        const side = d.userData.side as number;
        const pivot = d.children[0];
        const cur = pivot.rotation.z;
        const target = side * 1.5 * doorOpen;
        pivot.rotation.z = cur + (target - cur) * Math.min(1, dt * 3);
      }
    },
    contactStrips,
  };
  api.setExplode(0);
  return api;
}

export type DockingStationApi = ReturnType<typeof createDockingStation>;
