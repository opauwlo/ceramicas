import type { ReactNode } from 'react';
import { fmt, round } from '../lib/format';
import type { Unit } from '../model/spec';

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: Unit;
  /** passo dos botões − e + */
  nudge?: number;
  onChange(v: number): void;
  onCommit(): void;
}

/** Controle deslizante com botões de ajuste fino, bons para o dedo. */
export function Slider({ id, label, value, min, max, step, unit, nudge, onChange, onCommit }: SliderProps) {
  const n = nudge ?? (step < 0.05 ? step * 5 : step);
  const fit = (v: number) => round(Math.min(max, Math.max(min, Math.round(v / step) * step)), 4);
  const bump = (d: number) => {
    onChange(fit(value + d));
    onCommit();
  };
  return (
    <div className="field">
      <div className="fl">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{fmt(value, unit)}</output>
      </div>
      <div className="rangerow">
        <button type="button" className="nudge" aria-label={`Diminuir ${label}`} onClick={() => bump(-n)}>
          −
        </button>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(round(parseFloat(e.target.value), 4))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          onBlur={onCommit}
        />
        <button type="button" className="nudge" aria-label={`Aumentar ${label}`} onClick={() => bump(n)}>
          +
        </button>
      </div>
    </div>
  );
}

export function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="check" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

export function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange(v: string): void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="color" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

export function TextField({ id, label, value, placeholder, maxLength, onChange }: { id: string; label: string; value: string; placeholder?: string; maxLength?: number; onChange(v: string): void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} placeholder={placeholder} maxLength={maxLength} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange(v: T): void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, txt]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {txt}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, extra, children }: { title: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="sec">
      <h3>
        {title}
        {extra}
      </h3>
      {children}
    </section>
  );
}
