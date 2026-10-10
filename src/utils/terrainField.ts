/**
 * Procedural Himalayan height field shared by the 3D scenes and the route planner.
 * Conceptual visualization only: this is NOT a digital elevation model of Kishtwar.
 * Units: kilometres in x/z, metres for elevation.
 */
import { STATIONS, LANDSLIDE_ZONE } from '../data/demoStations';
import { WORLD } from '../data/systemConstants';

// ---------- deterministic gradient noise ----------
const PERM = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 1337;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

const GX = [1, -1, 1, -1, 1, -1, 0, 0];
const GY = [1, 1, -1, -1, 0, 0, 1, -1];
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const X = xi & 255;
  const Y = yi & 255;
  const g = (h: number, dx: number, dy: number) => {
    const k = h & 7;
    return GX[k] * dx + GY[k] * dy;
  };
  const aa = PERM[PERM[X] + Y];
  const ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];
  const u = fade(xf);
  const v = fade(yf);
  const x1 = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
  const x2 = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
  return (x1 + v * (x2 - x1)) * 0.9;
}

export function fbm(x: number, y: number, oct = 4): number {
  let a = 0.5;
  let f = 1;
  let s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

function ridged(x: number, y: number, oct = 5): number {
  let a = 0.55;
  let f = 1;
  let s = 0;
  let w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noise2(x * f + i * 17.1, y * f - i * 9.3));
    n *= n;
    n *= w;
    w = Math.min(1, n * 1.6);
    s += n * a;
    f *= 2.1;
    a *= 0.5;
  }
  return s;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- valleys ----------
type P = [number, number];
/** Main river valley the access road follows. Stations sit on its north shoulder. */
export const MAIN_VALLEY: P[] = [[-24, 3.8], [-19.5, 2.7], [-16.6, 0.4], [-14.6, -0.9], [-12.4, -0.6], [-10.2, -0.6], [-7.8, -1.2], [-5.4, -1.3], [-3, -0.9], [-0.6, -0.8], [2.2, -1.5], [6.5, -2.8], [13, -3.4], [24, -2.2]];
/** Side valley hosting the alternate dock S2b. */
export const SIDE_VALLEY: P[] = [[-11.6, 0.2], [-9, 1.9], [-7.2, 3.2], [-5.3, 3.5], [-3, 3.1], [-1.2, 2.1], [0.6, 1.9]];
/** Access road (km): continuous to the gateway, then a washed-out track into the zone. */
export const ROAD: P[] = [[-23.5, 3.2], [-21.4, 2.4], [-20.2, 3.0], [-18.6, 1.9], [-17.2, 1.5], [-16.2, 0.4], [-15.3, -0.4], [-13.4, -0.2], [-11.6, -0.1], [-10.2, -0.1], [-8.4, -0.7], [-6.6, -0.6], [-5.4, -0.8], [-3.6, -0.4], [-2.0, -0.3], [-0.6, -0.3], [0.3, 0.4]];
/** Index in ROAD where the road enters the blackout (beyond the gateway). */
export const ROAD_BLACKOUT_INDEX = 7;

function distToPolyline(x: number, z: number, line: P[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

const PADS = STATIONS.map((s) => ({ x: s.x, z: s.z }));

function rawElevation(x: number, z: number): number {
  const trend = 2450 + 25 * (x + 15);
  const dMain = distToPolyline(x, z, MAIN_VALLEY);
  const dSide = distToPolyline(x, z, SIDE_VALLEY) * 1.15;
  const dv = Math.min(dMain, dSide);
  const shape = smoothstep(0.3, 5.2, dv);
  // sharp, interlocking ridgelines with steep faces (conceptual Himalayan relief)
  const ridge = ridged(x * 0.14 + 3.1, z * 0.14 - 1.7, 6);
  const mountains = 2450 * Math.pow(shape, 1.1) * (0.32 + 0.85 * ridge);
  const crags = 300 * ridged(x * 0.5 + 7.3, z * 0.5 - 3.9, 3) * shape * shape;
  const texture = (200 * fbm(x * 0.33, z * 0.33, 4) + 70 * fbm(x * 1.1, z * 1.1, 3)) * (0.25 + shape) + crags;
  const floorRipple = 25 * fbm(x * 0.7 + 11, z * 0.7, 2);
  // gully cut at the landslide zone
  const g = Math.hypot(x - LANDSLIDE_ZONE.x, (z - LANDSLIDE_ZONE.z) * 0.6);
  const gully = -110 * (1 - smoothstep(0, LANDSLIDE_ZONE.r * 1.4, g));
  // ridge-shoulder benches for stations
  let bench = 0;
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    bench += 55 * (1 - smoothstep(0.15, 1.1, d));
  }
  return trend + mountains + texture + floorRipple + gully + bench;
}

/** Ungridded elevation, valid beyond the cached grid (used for the far skirt). */
export function elevationFar(x: number, z: number): number {
  return rawElevation(x, z);
}

function padElevation(i: number): number {
  return rawElevation(PADS[i].x, PADS[i].z);
}

let padCache: number[] | null = null;
function elevationAnalytic(x: number, z: number): number {
  if (!padCache) padCache = PADS.map((_, i) => padElevation(i));
  let e = rawElevation(x, z);
  for (let i = 0; i < PADS.length; i++) {
    const d = Math.hypot(x - PADS[i].x, z - PADS[i].z);
    const w = 1 - smoothstep(0.12, 0.32, d);
    if (w > 0) e = e * (1 - w) + padCache[i] * w;
  }
  return e;
}

// ---------- cached grid ----------
export const GRID_RES_KM = 0.125;
const HALF = WORLD.terrainHalfKm;
const N = Math.round((HALF * 2) / GRID_RES_KM) + 1;
let grid: Float32Array | null = null;

function ensureGrid(): Float32Array {
  if (grid) return grid;
  grid = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = -HALF + j * GRID_RES_KM;
    for (let i = 0; i < N; i++) {
      const x = -HALF + i * GRID_RES_KM;
      grid[j * N + i] = elevationAnalytic(x, z);
    }
  }
  return grid;
}

/** Elevation in metres at (x,z) km, bilinear from the cached grid. */
export function elevationM(x: number, z: number): number {
  const g = ensureGrid();
  const fx = Math.min(N - 1.001, Math.max(0, (x + HALF) / GRID_RES_KM));
  const fz = Math.min(N - 1.001, Math.max(0, (z + HALF) / GRID_RES_KM));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = g[j * N + i];
  const b = g[j * N + i + 1];
  const c = g[(j + 1) * N + i];
  const d = g[(j + 1) * N + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

/** Slope (rise/run, dimensionless) at a point. */
export function slopeAt(x: number, z: number): number {
  const e = 0.12;
  const dx = (elevationM(x + e, z) - elevationM(x - e, z)) / (2 * e * 1000);
  const dz = (elevationM(x, z + e) - elevationM(x, z - e)) / (2 * e * 1000);
  return Math.hypot(dx, dz);
}

/** Convert elevation (m) to world Y. Base 2,300 m sits at y=0. */
export function elevToY(m: number): number {
  return ((m - 2300) / 1000) * WORLD.unitsPerKm * WORLD.verticalExaggeration;
}
export function yToElev(y: number): number {
  return (y / (WORLD.unitsPerKm * WORLD.verticalExaggeration)) * 1000 + 2300;
}
export function groundY(x: number, z: number): number {
  return elevToY(elevationM(x, z));
}
export const kmToWorld = (km: number) => km * WORLD.unitsPerKm;

export function gridInfo() {
  ensureGrid();
  return { N, HALF, RES: GRID_RES_KM };
}

export function warmTerrain(): void {
  ensureGrid();
}
