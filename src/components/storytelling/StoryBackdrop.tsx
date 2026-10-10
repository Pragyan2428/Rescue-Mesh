import { useEffect, useMemo, useRef, useState } from 'react';
import { Viewport } from '../../scenes/core/Viewport';
import { createStoryScene } from '../../scenes/StoryScene';
import { SceneFallback } from '../ui/SceneFallback';
import { STATION_BY_ID } from '../../data/demoStations';
import { elevationM } from '../../utils/terrainField';

const round10 = (m: number) => Math.round(m / 10) * 10;

/**
 * The fixed, scroll-driven world behind the story chapters. It renders only
 * while a story chapter is on screen; opaque chapters cover it otherwise.
 */
export function StoryBackdrop() {
  const labels = useRef(new Map<string, HTMLElement>());
  const [active, setActive] = useState(true);

  useEffect(() => {
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      setActive(visible.size > 0);
    });
    document.querySelectorAll('[data-story]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const L = useMemo(() => {
    const g = STATION_BY_ID.G;
    const s3 = STATION_BY_ID.S3;
    return [
      { id: 'lbl-blackout', text: '15 km blackout radius', tone: 'coral' },
      { id: 'lbl-cell', text: 'No cellular signal', tone: 'coral' },
      { id: 'lbl-road', text: 'Road access lost', tone: 'coral' },
      { id: 'lbl-resp', text: 'Responders disconnected', tone: 'coral' },
      { id: 'lbl-casualty', text: 'Isolated casualties · above 2,500 m', tone: 'amber' },
      { id: 'lbl-elev-g', text: `Gateway · ~${round10(elevationM(g.x, g.z)).toLocaleString('en-IN')} m (model)`, tone: 'ink' },
      { id: 'lbl-elev-s3', text: `Incident zone · ~${round10(elevationM(s3.x, s3.z)).toLocaleString('en-IN')} m (model)`, tone: 'ink' },
      { id: 'lbl-wind', text: 'Gusts up to 60 km/h', tone: 'ink' },
      { id: 'lbl-G', text: 'Gateway · road-head', tone: 'signal' },
      { id: 'lbl-S1', text: 'S1 · ~5 km', tone: 'signal' },
      { id: 'lbl-S2', text: 'S2 · ~10 km', tone: 'signal' },
      { id: 'lbl-S3', text: 'S3 · ~15 km · forward dock', tone: 'signal' },
      { id: 'lbl-S2b', text: 'S2b · alternate dock', tone: 'signal' },
      { id: 'lbl-confirm', text: 'Delivery confirmed · command center', tone: 'go' },
    ];
  }, []);

  const toneCls: Record<string, string> = {
    coral: 'border-coral/60 text-[#ffcfc9]',
    amber: 'border-amber/60 text-amber',
    signal: 'border-signal/50 text-signal',
    go: 'border-go/60 text-go',
    ink: 'border-line text-ink',
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden={!active}>
      <Viewport
        className="fixed inset-0"
        label="3D Himalayan valley showing the blackout zone, corridor stations and drone route"
        activeOverride={active}
        lazyMargin="0px"
        loadingLabel="Building the valley"
        fallback={<SceneFallback title="" />}
        factory={(ctx) => createStoryScene(ctx, labels.current)}
      >
        <div className="pointer-events-none absolute inset-0">
          {L.map((l) => (
            <div
              key={l.id}
              ref={(el) => {
                if (el) labels.current.set(l.id, el);
              }}
              className={`scene-label ${toneCls[l.tone]}`}
            >
              {l.text}
            </div>
          ))}
        </div>
        {/* readability scrim */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-night/70 via-night/10 to-transparent" />
      </Viewport>
    </div>
  );
}
