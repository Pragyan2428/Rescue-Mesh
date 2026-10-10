export interface MissionPreset {
  id: string;
  label: string;
  payloadKg: number;
  contents: string;
  priority: 'P0' | 'P1';
  note: string;
}

/** Preconfigured medical missions. All payloads are at or below the 5 kg design target. */
export const MISSION_PRESETS: MissionPreset[] = [
  { id: 'trauma', label: 'Trauma kit', payloadKg: 3, contents: 'Haemostatic dressings, splints, IV set', priority: 'P0', note: 'Deck example: 3 kg kit to a team ~13 km in.' },
  { id: 'insulin', label: 'Cold-chain meds', payloadKg: 1.5, contents: 'Insulin and antibiotics in an insulated pouch', priority: 'P0', note: 'Light payload, widest energy margin.' },
  { id: 'oxygen', label: 'Full 5 kg pack', payloadKg: 5, contents: 'Portable oxygen and blankets', priority: 'P0', note: 'At the design limit; long hops may become infeasible.' },
];
