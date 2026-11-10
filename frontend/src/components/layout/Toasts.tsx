import { BellRing, Info, X } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';

export default function Toasts() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.tone === 'up' ? <BellRing size={16} className="up" /> : <Info size={16} className={t.tone === 'down' ? 'down' : 'muted'} />}
          <div style={{ flex: 1, minWidth: 0 }}><strong>{t.title}</strong>{t.body && <span className="muted">{t.body}</span>}</div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
