/**
 * Illustrative station energy model (deck slides 11-12). Design estimates only;
 * not measured station performance or guaranteed output.
 */
import { SYSTEM } from '../data/systemConstants';

export interface PowerSettings {
  sunHours: number; // 0-6
  pvDerate: number; // 0.5-0.9
  windAvgW: number; // 0-250
  sorties: number; // drone charges per day, 0-6
  storm: boolean; // monsoon cloud + turbine furling
}

export const DEFAULT_POWER: PowerSettings = {
  sunHours: SYSTEM.station.sunHours,
  pvDerate: SYSTEM.station.pvDerate,
  windAvgW: SYSTEM.station.windAvgW,
  sorties: SYSTEM.station.sortiesPerDay,
  storm: false,
};

const P = SYSTEM.station;
export const CHARGE_KWH = P.dronePackWh / 1000 / P.chargeEfficiency; // ~0.59 kWh per sortie
export const CORE_LOADS = [
  { key: 'radio', label: 'Mesh radio relay', w: 10 },
  { key: 'controller', label: 'Edge controller', w: 8 },
  { key: 'sensors', label: 'Sensors', w: 3 },
  { key: 'gps', label: 'GPS / time sync', w: 1 },
  { key: 'standby', label: 'Charging electronics (standby)', w: 5 },
  { key: 'safety', label: 'Safety (heaters, actuators, beacon)', w: 10 },
];

export function effective(s: PowerSettings) {
  return {
    sunHours: s.storm ? s.sunHours * 0.3 : s.sunHours,
    windW: s.storm ? s.windAvgW * 0.55 : s.windAvgW,
  };
}

export function dailyBudget(s: PowerSettings) {
  const e = effective(s);
  const pv = (P.pvPanels * P.pvPanelW * e.sunHours * s.pvDerate) / 1000;
  const wind = (e.windW * 24) / 1000;
  const core = (P.coreW * 24) / 1000;
  const drone = s.sorties * CHARGE_KWH;
  return { pv, wind, gen: pv + wind, core, drone, load: core + drone, balance: pv + wind - core - drone };
}

export interface HourPoint {
  h: number;
  gen: number; // kWh in hour
  load: number;
  soc: number; // kWh at end of hour
  shed: boolean;
}

/**
 * 72-hour simulation. Policy: core loads always run (reserve is locked for
 * them); a drone charge is allowed only if it keeps SOC above the reserve.
 */
export function simulate72h(s: PowerSettings, startSoc = 6) {
  const e = effective(s);
  const peak = (P.pvPanels * P.pvPanelW * s.pvDerate) / 1000; // kW
  const k = e.sunHours / (24 / Math.PI);
  const chargeHours = [8, 11, 14, 17, 20, 6].slice(0, s.sorties);
  let soc = startSoc;
  const pts: HourPoint[] = [];
  let served = 0;
  let shedCount = 0;
  let minSoc = soc;
  for (let h = 0; h < 72; h++) {
    const hod = h % 24;
    const sun = hod >= 6 && hod < 18 ? Math.sin((Math.PI * (hod + 0.5 - 6)) / 12) : 0;
    const pv = peak * k * sun;
    const wind = (e.windW * (1 + 0.35 * Math.sin(h / 3.7) + 0.2 * Math.sin(h / 1.3))) / 1000;
    const gen = Math.max(0, pv) + Math.max(0, wind);
    let load = P.coreW / 1000;
    let shed = false;
    if (chargeHours.includes(hod)) {
      if (soc + gen - load - CHARGE_KWH >= P.reserveKWh) {
        load += CHARGE_KWH;
        served++;
      } else {
        shed = true;
        shedCount++;
      }
    }
    soc = Math.min(P.batteryKWh, Math.max(0, soc + gen - load));
    minSoc = Math.min(minSoc, soc);
    pts.push({ h, gen, load, soc, shed });
  }
  return { pts, served, shedCount, minSoc, reserveHeld: minSoc >= P.reserveKWh - 0.01 };
}

/** Hours the locked reserve keeps the core alive with zero generation. */
export function reserveHours(): number {
  return P.reserveKWh / (P.coreW / 1000);
}
