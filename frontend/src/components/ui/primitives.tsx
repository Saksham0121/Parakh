import { useEffect, useRef, type ReactNode } from 'react';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import type { ConditionResult } from '../../lib/types';
import { fmtNum } from '../../lib/format';

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className = '' }: {
  value: T; options: Array<{ id: T; label: ReactNode }>; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={`seg ${className}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Closes on outside click / Escape. Positioning is left to the caller. */
export function Popover({ open, onClose, children, className = '', style }: {
  open: boolean; onClose: () => void; children: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = window.setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className={`menu ${className}`} style={style}>{children}</div>;
}

export function ConditionList({ items, emptyText }: { items: ConditionResult[]; emptyText?: string }) {
  if (!items.length) return emptyText ? <p className="hint">{emptyText}</p> : null;
  return (
    <div className="checks">
      {items.map((c, i) => {
        const pending = c.detail === 'Not enough history' || c.detail === 'Not reported for this company';
        return (
          <div className="check" key={i}>
            {c.passed ? <CheckCircle2 size={15} className="up" /> : pending ? <CircleDashed size={15} className="muted" /> : <XCircle size={15} className="down" />}
            <div style={{ minWidth: 0 }}>
              <div>{c.label}</div>
              <div className="meta">
                {c.actual != null && <>now {fmtNum(c.actual)}</>}
                {c.target != null && <> · level {fmtNum(c.target)}</>}
                {c.detail && <> · {c.detail}</>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
