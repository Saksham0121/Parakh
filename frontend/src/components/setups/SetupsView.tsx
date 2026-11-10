import { useEffect, useState } from 'react';
import { Copy, FlaskConical, ListChecks, Pencil, Plus, Radar, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { Setup } from '../../lib/types';
import { describeCondition, metricLabel, TEMPLATES, tfLabel } from '../../lib/catalog';
import { useSetupStore } from '../../store/setupStore';
import { useUiStore } from '../../store/uiStore';
import { useWatchlistStore } from '../../store/watchlistStore';
import { toast } from '../../store/toastStore';
import { timeAgo } from '../../lib/format';
import { Empty, Spinner } from '../ui/primitives';
import SetupEditor from './SetupEditor';

function MonitorSwitch({ setup }: { setup: Setup }) {
  const upsert = useSetupStore((s) => s.upsert);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const s = await api.toggleSetupActive(setup.id);
      upsert(s);
      toast(s.active ? `Monitoring “${s.name}”` : `Stopped monitoring “${s.name}”`, s.active ? 'Matches show up in Alerts as they happen.' : undefined);
    } catch (e) {
      toast('Could not update setup', (e as Error).message, 'down');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={`badge ${setup.active ? 'badge-up' : ''}`} style={{ cursor: 'pointer', height: 24, padding: '0 10px', border: 0 }} onClick={toggle} disabled={busy}
      role="switch" aria-checked={setup.active} title={setup.active ? 'Click to stop monitoring' : 'Click to start monitoring'}>
      <span className="dot" /> {setup.active ? 'Monitoring' : 'Paused'}
    </button>
  );
}

export default function SetupsView() {
  const { setups, loaded, error, load, upsert, remove } = useSetupStore();
  const { focusSetupId, openSetup } = useUiStore();
  const watchCount = useWatchlistStore((s) => s.watchlist.length);
  const [editing, setEditing] = useState<Setup | 'new' | null>(null);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => {
    if (!focusSetupId) return;
    if (focusSetupId === 'new') setEditing('new');
    else { const s = setups.find((x) => x.id === focusSetupId); if (s) setEditing(s); else if (!loaded) return; }
    openSetup(null);
  }, [focusSetupId, setups, loaded, openSetup]);

  if (editing) {
    return (
      <div className="view">
        <SetupEditor setup={editing === 'new' ? null : editing} onDone={(saved) => { if (saved) upsert(saved); setEditing(null); }} />
      </div>
    );
  }

  const duplicate = async (s: Setup) => { try { upsert(await api.duplicateSetup(s.id)); } catch (e) { toast('Could not duplicate', (e as Error).message, 'down'); } };
  const del = async (s: Setup) => {
    if (!window.confirm(`Delete “${s.name}”? Its alerts and backtests are deleted too.`)) return;
    try { await api.deleteSetup(s.id); remove(s.id); } catch (e) { toast('Could not delete', (e as Error).message, 'down'); }
  };

  return (
    <div className="view">
      <div className="view-inner">
        <div className="view-head">
          <div>
            <h1>Setups</h1>
            <p>Your trade ideas as rules. Monitored setups scan their symbols every minute and alert you on a match.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} /> New setup</button>
        </div>

        {!loaded && <div className="empty"><Spinner /></div>}
        {loaded && error && <div className="notice notice-error">{error}</div>}
        {loaded && !error && setups.length === 0 && (
          <div className="card">
            <Empty icon={<ListChecks size={26} className="muted" />} title="Build your first setup"
              action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} /> New setup</button>}>
              Combine technical triggers (a breakout, a crossover, RSI) with fundamental filters (P/E, ROE, debt) and Parakh will find stocks that have it.
            </Empty>
            <div style={{ padding: '0 16px 16px' }}>
              <div className="section-title" style={{ marginBottom: 8 }}>Or start from a template</div>
              <div className="setup-grid">
                {TEMPLATES.slice(0, 3).map((t) => (
                  <button key={t.name} className="card setup-card" style={{ textAlign: 'left' }} onClick={async () => {
                    try { const s = await api.createSetup({ ...t.setup, universe: [] }); upsert(s); setEditing(s); } catch (e) { toast('Could not create', (e as Error).message, 'down'); }
                  }}>
                    <h3>{t.name}</h3><p className="hint">{t.blurb}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="setup-grid">
          {setups.map((s) => (
            <article key={s.id} className="card setup-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</h3>
                  <div className="hint">{tfLabel(s.timeframe)} · {s.orderRule?.side === 'SHORT' ? 'Short' : 'Long'} · {s.universe?.length ? `${s.universe.length} symbols` : `watchlist (${watchCount})`} · edited {timeAgo(s.updatedAt)}</div>
                </div>
                <MonitorSwitch setup={s} />
              </div>
              <div className="pills">
                {s.technicalConditions.map((c, i) => <span className="pill" key={i}>{i > 0 && <span className="muted">{c.logic ?? 'AND'} </span>}{describeCondition(c)}</span>)}
                {(s.fundamentalConditions ?? []).map((f, i) => (
                  <span className="pill pill-f" key={`f${i}`}>{metricLabel(f.metric)} {f.operator.startsWith('l') ? '<' : '>'} {f.value}</span>
                ))}
              </div>
              <div className="foot">
                <button className="btn btn-sm" onClick={() => openSetup(s.id, 'scanner')}><Radar size={14} /> Scan</button>
                <button className="btn btn-sm" onClick={() => openSetup(s.id, 'backtest')}><FlaskConical size={14} /> Backtest</button>
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(s)} aria-label="Edit"><Pencil size={14} /></button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => duplicate(s)} aria-label="Duplicate"><Copy size={14} /></button>
                <button className="btn btn-ghost btn-sm btn-icon btn-danger" onClick={() => del(s)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
