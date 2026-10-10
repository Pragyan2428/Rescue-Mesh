/** Static stand-in when WebGL is unavailable or a scene fails to start. */
export function SceneFallback({ title, note }: { title: string; note?: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-b from-[#1b2533] via-[#121c28] to-night">
      <svg viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M0 420 L140 300 L250 360 L380 210 L520 330 L650 250 L760 340 L900 180 L1040 300 L1200 240 L1200 600 L0 600Z" fill="#1a2532" />
        <path d="M0 480 L180 400 L320 450 L480 360 L640 440 L820 380 L980 450 L1200 390 L1200 600 L0 600Z" fill="#141e29" />
        <circle cx="760" cy="420" r="230" fill="none" stroke="#FF6B5E" strokeOpacity="0.55" strokeDasharray="8 8" />
        <path d="M300 470 L470 430 L620 452 L760 420" fill="none" stroke="#FF9E43" strokeWidth="3" strokeDasharray="10 8" />
        <path d="M300 462 L470 422 L620 444 L760 412" fill="none" stroke="#61E6E0" strokeWidth="1.5" />
        {[300, 470, 620, 760].map((x, i) => (
          <rect key={x} x={x - 7} y={[463, 423, 445, 413][i]} width="14" height="14" fill={i === 0 ? '#FF9E43' : '#0D1B28'} stroke="#61E6E0" strokeWidth="2" />
        ))}
      </svg>
      {title && (
      <div className="absolute bottom-4 left-4 right-4 rounded border border-line bg-night/80 p-3 text-sm text-mist">
        <span className="label mb-1 block text-amber">3D view unavailable</span>
        {title}
        {note ? ` ${note}` : ''} The written content and controls on this page still work.
      </div>
      )}
    </div>
  );
}
