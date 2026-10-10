import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'signal';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-amber text-[#1b0f02] hover:bg-[#ffb366] border border-amber font-semibold',
  secondary: 'border border-line bg-raised/70 text-ink hover:border-mist/70 hover:bg-raised',
  ghost: 'border border-transparent text-mist hover:text-ink hover:bg-raised/60',
  danger: 'border border-coral/60 bg-coral/10 text-[#ffd5d0] hover:bg-coral/20',
  signal: 'border border-signal/50 bg-signal/10 text-signal hover:bg-signal/20',
};

export function Button({ variant = 'secondary', icon, children, className = '', size = 'md', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'min-h-[36px] px-3 text-[13px] gap-1.5' : 'min-h-[44px] px-4 text-[15px] gap-2';
  return (
    <button type="button" className={`inline-flex items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sz} ${VARIANT[variant]} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  );
}

/** Toggle with aria-pressed, used for scenario switches. */
export function Toggle({ on, onChange, children, icon, tone = 'amber', className = '', disabled }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; icon?: IconName; tone?: 'amber' | 'coral' | 'signal'; className?: string; disabled?: boolean }) {
  const onCls = tone === 'coral' ? 'border-coral/70 bg-coral/15 text-[#ffd5d0]' : tone === 'signal' ? 'border-signal/70 bg-signal/15 text-signal' : 'border-amber/70 bg-amber/15 text-amber';
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex min-h-[40px] items-center gap-2 rounded-md border px-3 text-[13px] transition-colors disabled:opacity-40 ${on ? onCls : 'border-line bg-raised/60 text-mist hover:text-ink'} ${className}`}
    >
      {icon && <Icon name={icon} size={15} />}
      <span className="text-left">{children}</span>
      <span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${on ? (tone === 'coral' ? 'bg-coral' : tone === 'signal' ? 'bg-signal' : 'bg-amber') : 'bg-dim'}`} aria-hidden="true" />
    </button>
  );
}

export function Tag({ children, tone = 'mist', className = '' }: { children: ReactNode; tone?: 'mist' | 'amber' | 'signal' | 'coral' | 'go'; className?: string }) {
  const t = {
    mist: 'border-line text-mist',
    amber: 'border-amber/50 text-amber',
    signal: 'border-signal/50 text-signal',
    coral: 'border-coral/60 text-coral',
    go: 'border-go/50 text-go',
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border bg-night/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${t} ${className}`}>{children}</span>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-night/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[34px] rounded px-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${value === o.value ? 'bg-raised text-ink' : 'text-mist hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ id, label, value, min, max, step, onChange, format, note }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; note?: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <span className="num font-mono text-sm text-ink">{format(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full" />
      {note && <p className="text-xs text-dim">{note}</p>}
    </div>
  );
}

export function Meter({ value, tone = 'go', label }: { value: number; tone?: 'go' | 'amber' | 'coral' | 'signal'; label: string }) {
  const c = { go: 'bg-go', amber: 'bg-amber', coral: 'bg-coral', signal: 'bg-signal' }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className={`h-full ${c} transition-[width] duration-300`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function SimBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded border border-amber/50 bg-amber/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-amber ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
      Demo simulation · not live telemetry
    </span>
  );
}
