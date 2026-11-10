import { useEffect } from 'react';
import { Bell, BellRing, Plus, RefreshCw } from 'lucide-react';
import { useAlertStore } from '../../store/alertStore';
import { useUiStore } from '../../store/uiStore';
import { useSetupStore } from '../../store/setupStore';
import { displaySymbol, fmtPct, fmtPrice, timeAgo, toneOf } from '../../lib/format';
import { tfLabel } from '../../lib/catalog';
import { ConditionList, Empty, Spinner } from '../ui/primitives';

export default function AlertsView() {
  const { alerts, loaded, load, markRead } = useAlertStore();
  const { setSymbol, setView, openSetup } = useUiStore();
  const monitoring = useSetupStore((s) => s.setups.filter((x) => x.active).length);

  useEffect(() => { markRead(); }, [markRead]);

  return (
    <div className="view">
      <div className="view-inner" style={{ maxWidth: 900 }}>
        <div className="view-head">
          <div>
            <h1>Alerts</h1>
            <p>{monitoring ? `${monitoring} setup${monitoring === 1 ? ' is' : 's are'} being monitored. New matches appear here instantly.` : 'No setup is being monitored yet.'}</p>
          </div>
          <button className="btn" onClick={() => load()}><RefreshCw size={15} /> Refresh</button>
        </div>

        {!loaded && <div className="empty"><Spinner /></div>}
        {loaded && alerts.length === 0 && (
          <div className="card">
            <Empty icon={<Bell size={26} className="muted" />} title="No alerts yet"
              action={!monitoring ? <button className="btn btn-primary" onClick={() => setView('setups')}><Plus size={15} /> Turn on monitoring for a setup</button> : undefined}>
              When a monitored setup appears on one of its symbols you’ll get one alert per bar, with the reasons it matched.
            </Empty>
          </div>
        )}
        {alerts.length > 0 && (
          <section className="card">
            {alerts.map((a) => (
              <article key={a.id} className="alert-item">
                <div className="icon"><BellRing size={17} /></div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <button className="mono" style={{ fontWeight: 600, fontSize: 15 }} onClick={() => { setSymbol(a.symbol); setView('chart'); }}>{displaySymbol(a.symbol)}</button>
                    <span className="hint">matched</span>
                    <button style={{ fontWeight: 500 }} onClick={() => openSetup(a.setupId, 'setups')}>{a.setupName}</button>
                    {a.technicalSnapshot?.timeframe && <span className="badge">{tfLabel(a.technicalSnapshot.timeframe)}</span>}
                    <span className="hint" style={{ marginLeft: 'auto' }}>{timeAgo(a.matchedAt)}</span>
                  </div>
                  {a.technicalSnapshot?.close != null && (
                    <div className="num" style={{ fontSize: 13 }}>{fmtPrice(a.technicalSnapshot.close)} <span className={toneOf(a.technicalSnapshot.changePct)}>{fmtPct(a.technicalSnapshot.changePct)}</span></div>
                  )}
                  <ConditionList items={[...(a.technicalSnapshot?.conditions ?? []), ...(a.fundamentalsSnapshot?.conditions ?? [])]} />
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
