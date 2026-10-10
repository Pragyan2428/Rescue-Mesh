/**
 * Scroll-driven story state. ScrollTrigger writes section progress here; the
 * story scene reads it every frame and interpolates camera + scene parameters.
 * Pure function of scroll position → fully reversible when scrolling back.
 */
export interface StoryParams {
  cam: [number, number, number];
  tgt: [number, number, number];
  storm: number;
  dusk: number;
  blackout: number;
  fail: number;
  reveal: number;
  links: number;
  drone: number;
  contours: number;
  wind: number;
  final: number;
}

type Stop = { at: number; p: StoryParams };

const base: StoryParams = {
  cam: [-340, 210, 240],
  tgt: [-80, 18, 0],
  storm: 0.3,
  dusk: 1,
  blackout: 0,
  fail: 0,
  reveal: 0,
  links: 0,
  drone: 0,
  contours: 0,
  wind: 0.2,
  final: 0,
};
const P = (o: Partial<StoryParams>, from: StoryParams = base): StoryParams => ({ ...from, ...o });

const heroEnd = P({ cam: [-270, 150, 175], tgt: [-60, 20, 0], storm: 0.65, wind: 0.5 });
const blackoutEnd = P({ cam: [-170, 250, 270], tgt: [-40, 10, 5], storm: 1, blackout: 1, fail: 1, wind: 0.9 }, heroEnd);
const consStart = P({ cam: [-215, 90, 105], tgt: [-125, 30, 0], storm: 0.55, contours: 1, wind: 1 }, blackoutEnd);
const consEnd = P({ cam: [-70, 95, 100], tgt: [-25, 35, 0], storm: 0.45, contours: 1, wind: 1 }, consStart);
const netStart = P({ cam: [-130, 180, 175], tgt: [-70, 18, 5], storm: 0.25, contours: 0, wind: 0.35 }, consEnd);
const netBuilt = P({ cam: [-118, 140, 135], tgt: [-68, 18, 6], reveal: 1, links: 1, storm: 0.15 }, netStart);
const netEnd = P({ cam: [-30, 110, 115], tgt: [-30, 22, 6], reveal: 1, links: 1, drone: 1, storm: 0.1 }, netBuilt);
const closeStart = P({ cam: [-40, 230, 280], tgt: [-60, 10, 0], storm: 0.05, dusk: 0.7, final: 0.3 }, netEnd);
const closeEnd = P({ cam: [80, 260, 320], tgt: [-65, 10, 10], storm: 0, dusk: 0.55, final: 1 }, closeStart);

export const STORY_SECTIONS: Record<string, Stop[]> = {
  hero: [
    { at: 0, p: base },
    { at: 1, p: heroEnd },
  ],
  blackout: [
    { at: 0, p: heroEnd },
    { at: 1, p: blackoutEnd },
  ],
  constraints: [
    { at: 0, p: consStart },
    { at: 1, p: consEnd },
  ],
  geometry: [
    { at: 0, p: netStart },
    { at: 0.35, p: netBuilt },
    { at: 1, p: netEnd },
  ],
  closing: [
    { at: 0, p: closeStart },
    { at: 1, p: closeEnd },
  ],
};
export const STORY_ORDER = ['hero', 'blackout', 'constraints', 'geometry', 'closing'] as const;
export type StorySection = (typeof STORY_ORDER)[number];

export const storyBus = {
  progress: { hero: 0, blackout: 0, constraints: 0, geometry: 0, closing: 0 } as Record<StorySection, number>,
  /** Which story section currently owns the background (null when covered). */
  visible: true,
  interactive: {
    topDown: false,
    coverage: false,
    payloadKg: 5,
    windKmh: 24,
  },
  hud: null as null | ((h: { battery: number; leg: string; km: number }) => void),
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

function mix(a: StoryParams, b: StoryParams, t: number): StoryParams {
  const k = ease(t);
  return {
    cam: [lerp(a.cam[0], b.cam[0], k), lerp(a.cam[1], b.cam[1], k), lerp(a.cam[2], b.cam[2], k)],
    tgt: [lerp(a.tgt[0], b.tgt[0], k), lerp(a.tgt[1], b.tgt[1], k), lerp(a.tgt[2], b.tgt[2], k)],
    storm: lerp(a.storm, b.storm, k),
    dusk: lerp(a.dusk, b.dusk, k),
    blackout: lerp(a.blackout, b.blackout, k),
    fail: lerp(a.fail, b.fail, k),
    reveal: lerp(a.reveal, b.reveal, t),
    links: lerp(a.links, b.links, t),
    drone: lerp(a.drone, b.drone, t),
    contours: lerp(a.contours, b.contours, k),
    wind: lerp(a.wind, b.wind, k),
    final: lerp(a.final, b.final, k),
  };
}

function evalSection(name: StorySection, p: number): StoryParams {
  const stops = STORY_SECTIONS[name];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (p <= b.at) return mix(a.p, b.p, (p - a.at) / (b.at - a.at));
  }
  return stops[stops.length - 1].p;
}

/** Current target parameters from scroll progress of all story sections. */
export function currentStoryParams(): StoryParams {
  let active: StorySection = 'hero';
  for (const n of STORY_ORDER) if (storyBus.progress[n] > 0) active = n;
  return evalSection(active, storyBus.progress[active]);
}
