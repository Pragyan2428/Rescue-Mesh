/**
 * Central configuration for the RescueMesh demo model.
 * Every value here comes from the BuildForge presentation or is labelled as a
 * modelling assumption. None of these numbers are measured or flight-tested.
 */
export const SYSTEM = {
  // Problem-statement values (deck slide 3)
  blackoutRadiusKm: 15,
  nominalDroneRadiusKm: 8, // per charge, A1: out-and-back ~16 km at full payload, calm air
  payloadTargetKg: 5,
  elevationM: 2500, // "above 2,500 m"
  gustKmh: 60,

  // Planning assumptions (deck A2-A4)
  designHopKm: 5, // A2: 8 km x ~0.6 derate
  designDerate: 0.6,
  batteryReservePct: 20, // illustrative reserve rule
  droneWindLimitKmh: 40, // A4: standard quadcopters ~36-43 km/h typical. Configurable assumption.
  structureDesignWindKmh: 100,

  // Drone energy model (illustrative, derived from A1)
  calmFullPayloadRangeKm: 16, // 100% battery = 16 km at 5 kg, calm air
  altitudeFactor: 1.1, // thin air, ~20% lower density
  emptyPayloadFactor: 0.75, // consumption multiplier at 0 kg; 1.0 at 5 kg
  climbPctPer100m: 0.5, // extra % battery per 100 m of net climb
  headwindDivisor: 150, // wind factor = 1 + wind/150 (assumed average headwind share)
  cruiseKmh: 54,
  chargeMinutes: 4, // battery swap / top-up at a dock (illustrative)
  flightClearanceM: 120,

  // Station power (deck slides 11-12)
  station: {
    batteryKWh: 10,
    usableKWh: 8,
    reserveKWh: 2,
    coreW: 37,
    coreKWhDay: 0.9,
    dronePackWh: 500,
    chargeEfficiency: 0.85,
    sortiesPerDay: 4,
    droneChargeKWhDay: 2.4,
    totalKWhDay: 3.3,
    pvPanels: 2,
    pvPanelW: 400,
    sunHours: 4,
    pvDerate: 0.75,
    windAvgW: 100,
    generationKWhDay: 4.8,
  },

  // Mesh (deck slide 7)
  meshSlotSeconds: 6, // one message forwarded per node per slot (sim seconds)
  meshHopSeconds: 4,
  linkRecoverySeconds: 150, // "delayed link recovery" demo
} as const;

/** 1 km = 10 world units. Heights use the same scale with vertical exaggeration. */
export const WORLD = {
  unitsPerKm: 10,
  verticalExaggeration: 1.6,
  terrainHalfKm: 22,
} as const;

export const COLORS = {
  night: '#07111B',
  surface: '#0D1B28',
  signal: '#61E6E0',
  amber: '#FF9E43',
  coral: '#FF6B5E',
  go: '#7BD88F',
  ink: '#EAF2F8',
  mist: '#8EA3B5',
} as const;

/** Displayed start of the deterministic simulation clock (IST). */
export const SIM_START_LABEL_SECONDS = 14 * 3600 + 20 * 60;
