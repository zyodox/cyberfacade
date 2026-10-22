import { useRef, useState, type ReactNode } from "react";
import { IconChevron, IconLock, IconUnlock } from "./icons";

function decimalsFor(min: number, max: number, step?: number): number {
  if (step && step >= 1) return 0;
  const range = max - min;
  if (range <= 1.01) return 3;
  if (range <= 10) return 2;
  return 1;
}

export function LockButton({ locked, onToggle }: { locked?: boolean; onToggle?: () => void }) {
  if (!onToggle) return <span className="lock-spacer" />;
  return (
    <button className={`lock-btn${locked ? " on" : ""}`} onClick={onToggle} title={locked ? "Locked — RANDOMIZE keeps this value" : "Lock against RANDOMIZE"}>
      {locked ? <IconLock /> : <IconUnlock />}
    </button>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  unit?: string;
  hint?: string;
  locked?: boolean;
  onToggleLock?: () => void;
  onChange(v: number): void;
}

/**
 * Drag bar: click/drag sets the value (Shift = fine relative drag),
 * click the number to type, arrow keys nudge.
 */
export function Slider({ label, value, min, max, step, integer, unit, hint, locked, onToggleLock, onChange }: SliderProps) {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; v: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const decimals = integer ? 0 : decimalsFor(min, max, step);
  const quant = (v: number) => {
    let q = Math.min(max, Math.max(min, v));
    if (integer) q = Math.round(q);
    else if (step) q = Math.round(q / step) * step;
    return Number(q.toFixed(Math.max(decimals, 3)));
  };
  const fromX = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return min + ((clientX - r.left) / r.width) * (max - min);
  };
  const pct = Math.min(1, Math.max(0, (value - min) / (max - min || 1))) * 100;

  return (
    <div className="row" title={hint}>
      <LockButton locked={locked} onToggle={onToggleLock} />
      <div
        ref={bar}
        className="slider"
        tabIndex={0}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value };
          if (!e.shiftKey) onChange(quant(fromX(e.clientX)));
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          if (e.shiftKey) {
            const r = bar.current!.getBoundingClientRect();
            onChange(quant(drag.current.v + ((e.clientX - drag.current.x) / r.width) * (max - min) * 0.1));
          } else onChange(quant(fromX(e.clientX)));
        }}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          const s = integer ? 1 : step ?? (max - min) / 100;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(quant(value + s * (e.shiftKey ? 0.1 : 1)));
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(quant(value - s * (e.shiftKey ? 0.1 : 1)));
          else return;
          e.preventDefault();
        }}
      >
        <div className="slider-fill" style={{ width: `${pct}%` }} />
        <span className="slider-label">{label}</span>
        {editing ? (
          <input
            className="slider-input"
            autoFocus
            defaultValue={value.toFixed(decimals)}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onChange(quant(v));
              setEditing(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span
            className="slider-value"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setEditing(true)}
            title="Click to type a value"
          >
            {value.toFixed(decimals)}
            {unit ? <em>{unit}</em> : null}
          </span>
        )}
      </div>
    </div>
  );
}

export function ColorField({ label, value, locked, onToggleLock, onChange }: { label: string; value: string; locked?: boolean; onToggleLock?: () => void; onChange(v: string): void }) {
  return (
    <div className="row">
      <LockButton locked={locked} onToggle={onToggleLock} />
      <label className="field">
        <span className="field-label">{label}</span>
        <span className="color-wrap">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          <span className="color-hex">{value.toUpperCase()}</span>
        </span>
      </label>
    </div>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, locked, onToggleLock }: { label: string; value: T; options: { id: T; label: string }[]; onChange(v: T): void; locked?: boolean; onToggleLock?: () => void }) {
  return (
    <div className="row">
      <LockButton locked={locked} onToggle={onToggleLock} />
      <label className="field">
        <span className="field-label">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <div className="row">
      <span className="lock-spacer" />
      <label className="field toggle-field">
        <span className="field-label">{label}</span>
        <button className={`switch${value ? " on" : ""}`} role="switch" aria-checked={value} onClick={() => onChange(!value)}>
          <span />
        </button>
      </label>
    </div>
  );
}

export function Section({ title, children, defaultOpen = true, right }: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section${open ? " open" : ""}`}>
      <header className="section-head" onClick={() => setOpen(!open)}>
        <IconChevron open={open} />
        <span>{title}</span>
        {right ? (
          <span className="section-right" onClick={(e) => e.stopPropagation()}>
            {right}
          </span>
        ) : null}
      </header>
      {open ? <div className="section-body">{children}</div> : null}
    </section>
  );
}

export function SubGroup({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="subgroup">
      <div className="subgroup-head" onClick={() => setOpen(!open)}>
        <IconChevron open={open} width={11} height={11} />
        {title}
      </div>
      {open ? children : null}
    </div>
  );
}
