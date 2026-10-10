import { useEffect, useRef } from 'react';
import { getSim } from '../../simulation/store';
import { linkUsable } from '../../simulation/networkGraph';
import { STATION_BY_ID, INCIDENT, LANDSLIDE_ZONE } from '../../data/demoStations';
import { SYSTEM, WORLD } from '../../data/systemConstants';
import { elevationM } from '../../utils/terrainField';
import type { NodeId } from '../../simulation/types';

// map window in km
const X0 = -19;
const X1 = 3;
const Z0 = -7;
const Z1 = 8;

let hillshade: HTMLCanvasElement | null = null;
function getHillshade(): HTMLCanvasElement {
  if (hillshade) return hillshade;
  const W = 330;
  const H = Math.round((W * (Z1 - Z0)) / (X1 - X0));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const step = (X1 - X0) / W;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = X0 + i * step;
      const z = Z0 + j * step;
      const e = elevationM(x, z);
      const ex = elevationM(x + step, z) - e;
      const ez = elevationM(x, z + step) - e;
      const shade = Math.max(0, Math.min(1, 0.55 - (ex * 0.9 + ez * 0.6) / (step * 1000) * 0.9));
      const t = Math.max(0, Math.min(1, (e - 2300) / 2600));
      const k = (j * W + i) * 4;
      img.data[k] = 20 + shade * 60 + t * 35;
      img.data[k + 1] = 30 + shade * 62 + t * 32;
      img.data[k + 2] = 42 + shade * 66 + t * 30;
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  hillshade = c;
  return c;
}

/** Top-down operations map drawn every frame from the shared simulation state. */
export function OpsMap({ onSelect }: { onSelect: (id: NodeId | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver((e) => (visible = e[0].isIntersecting));
    io.observe(cv);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sc = Math.min(w / (X1 - X0), h / (Z1 - Z0));
      const ox = (w - (X1 - X0) * sc) / 2;
      const oy = (h - (Z1 - Z0) * sc) / 2;
      const P = (x: number, z: number): [number, number] => [ox + (x - X0) * sc, oy + (z - Z0) * sc];
      const s = getSim();
      g.fillStyle = '#07111B';
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.9;
      g.drawImage(getHillshade(), ox, oy, (X1 - X0) * sc, (Z1 - Z0) * sc);
      g.globalAlpha = 1;
      // blackout circle (centre 0,0)
      const [cx, cy] = P(0, 0);
      g.strokeStyle = 'rgba(255,107,94,0.7)';
      g.setLineDash([6, 6]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(cx, cy, SYSTEM.blackoutRadiusKm * sc, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      // landslide zone
      if (s.conditions.corridorBlocked) {
        const [lx, ly] = P(LANDSLIDE_ZONE.x, LANDSLIDE_ZONE.z);
        g.fillStyle = 'rgba(255,107,94,0.22)';
        g.strokeStyle = '#FF6B5E';
        g.beginPath();
        g.arc(lx, ly, LANDSLIDE_ZONE.r * sc, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      // previous plan
      const drawPlan = (hops: NonNullable<typeof s.plan>['hops'], color: string, width: number, dash: number[]) => {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.setLineDash(dash);
        for (const hp of hops) {
          g.beginPath();
          hp.path.forEach((p, i) => {
            const [x, y] = P(p.x, p.z);
            if (i) g.lineTo(x, y);
            else g.moveTo(x, y);
          });
          g.stroke();
        }
        g.setLineDash([]);
      };
      if (s.previousPlan?.feasible) drawPlan(s.previousPlan.hops, 'rgba(154,166,178,0.6)', 2, [3, 4]);
      if (s.plan?.feasible) drawPlan(s.plan.hops, '#FF9E43', 3, []);
      // links
      for (const l of s.links) {
        const a = STATION_BY_ID[l.a];
        const b = STATION_BY_ID[l.b];
        const [ax, ay] = P(a.x, a.z);
        const [bx, by] = P(b.x, b.z);
        const ok = linkUsable(s, l);
        g.strokeStyle = ok ? 'rgba(97,230,224,0.75)' : 'rgba(255,107,94,0.9)';
        g.lineWidth = 1.5;
        g.setLineDash(ok ? [5, 4] : [2, 5]);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
      g.setLineDash([]);
      // incident
      const [ix, iy] = P(INCIDENT.x, INCIDENT.z);
      g.strokeStyle = '#FF9E43';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(ix, iy, 6 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2);
      g.stroke();
      // stations
      g.font = '11px "JetBrains Mono", monospace';
      for (const id of ['CC', 'G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]) {
        const st = STATION_BY_ID[id];
        const ss = s.stations[id];
        const [x, y] = P(st.x, st.z);
        if (s.selectedStation === id) {
          g.strokeStyle = '#EAF2F8';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, 13, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = id === 'CC' || id === 'G' ? '#FF9E43' : '#0D1B28';
        g.strokeStyle = !ss.online ? '#FF6B5E' : ss.powerMode === 'shed' || !ss.tiltOk ? '#FF9E43' : '#61E6E0';
        g.lineWidth = 2;
        g.fillRect(x - 6, y - 6, 12, 12);
        g.strokeRect(x - 6, y - 6, 12, 12);
        if (!ss.online) {
          g.beginPath();
          g.moveTo(x - 5, y - 5);
          g.lineTo(x + 5, y + 5);
          g.moveTo(x + 5, y - 5);
          g.lineTo(x - 5, y + 5);
          g.stroke();
        }
        g.fillStyle = '#EAF2F8';
        g.fillText(id, x + 9, y - 8);
      }
      // drones
      for (const d of s.drones) {
        const x = d.pos.x / WORLD.unitsPerKm;
        const z = d.pos.z / WORLD.unitsPerKm;
        const [px, py] = P(x, z);
        const flying = d.state === 'flying' || d.state === 'delivering';
        if (!flying && d.at) continue;
        g.fillStyle = d.state === 'grounded' ? '#FF6B5E' : '#FF9E43';
        g.beginPath();
        g.moveTo(px, py - 6);
        g.lineTo(px + 5, py + 4);
        g.lineTo(px - 5, py + 4);
        g.closePath();
        g.fill();
        g.fillStyle = '#EAF2F8';
        g.fillText(`${d.id} ${Math.round(d.batteryPct)}%`, px + 7, py + 4);
      }
      // scale bar
      g.strokeStyle = '#8EA3B5';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(12, h - 14);
      g.lineTo(12 + 5 * sc, h - 14);
      g.stroke();
      g.fillStyle = '#8EA3B5';
      g.fillText('5 km', 16 + 5 * sc, h - 10);
    };
    raf = requestAnimationFrame(draw);
    const click = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const sc = Math.min(w / (X1 - X0), h / (Z1 - Z0));
      const ox = (w - (X1 - X0) * sc) / 2;
      const oy = (h - (Z1 - Z0) * sc) / 2;
      const x = (e.clientX - r.left - ox) / sc + X0;
      const z = (e.clientY - r.top - oy) / sc + Z0;
      let best: NodeId | null = null;
      let bd = 1.2;
      for (const id of ['G', 'S1', 'S2', 'S2b', 'S3'] as NodeId[]) {
        const st = STATION_BY_ID[id];
        const d = Math.hypot(st.x - x, st.z - z);
        if (d < bd) ((bd = d), (best = id));
      }
      onSelect(best);
    };
    cv.addEventListener('click', click);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      cv.removeEventListener('click', click);
    };
  }, [onSelect]);
  return <canvas ref={ref} className="h-full w-full cursor-crosshair" role="img" aria-label="Top-down operations map: blackout region, stations, radio links, current and previous drone routes, drone positions and blocked areas" />;
}
