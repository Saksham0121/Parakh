import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Edit3, Copy, Power, PowerOff, ChevronLeft,
  Zap, BarChart2, TrendingUp, Target, Shield,
  CheckCircle2, Clock,
} from 'lucide-react';
import { api } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

const INDICATORS = [
  { value: 'RSI', label: 'RSI', category: 'momentum' },
  { value: 'SMA', label: 'SMA', category: 'trend' },
  { value: 'EMA', label: 'EMA', category: 'trend' },
  { value: 'MACD', label: 'MACD', category: 'momentum' },
  { value: 'BollingerBands', label: 'Bollinger Bands', category: 'volatility' },
  { value: 'VWAP', label: 'VWAP', category: 'volume' },
  { value: 'ATR', label: 'ATR', category: 'volatility' },
  { value: 'Stochastic', label: 'Stochastic %K', category: 'momentum' },
  { value: 'breakout', label: '🔺 Breakout', category: 'pattern' },
  { value: 'breakdown', label: '🔻 Breakdown', category: 'pattern' },
];

const OPERATORS = [
  { value: '>', label: 'is above' },
  { value: '<', label: 'is below' },
  { value: 'crosses above', label: 'crosses above' },
  { value: 'crosses below', label: 'crosses below' },
  { value: '=', label: 'equals' },
];

const FUND_METRICS = [
  { value: 'peRatio', label: 'P/E Ratio' },
  { value: 'eps', label: 'EPS' },
  { value: 'roe', label: 'ROE (%)' },
  { value: 'debtToEquity', label: 'Debt / Equity' },
  { value: 'marketCap', label: 'Market Cap (Cr)' },
];

const TIMEFRAMES = [
  { value: 'GTC', label: 'GTC — Good Till Cancelled' },
  { value: 'IOC', label: 'IOC — Immediate or Cancel' },
  { value: 'DAY', label: 'DAY — Day Order' },
];

function defaultTechCondition() {
  return { id: Date.now(), indicator: 'RSI', params: { period: 14 }, operator: '>', value: 70, logic: 'AND' };
}

function defaultFundCondition() {
  return { id: Date.now(), metric: 'peRatio', operator: '<', value: 20, logic: 'AND' };
}

function defaultOrderRule() {
  return { stopLossPct: 5, takeProfitPct: 15, trailingStopPct: '', stopLimitPrice: '', timeInForce: 'GTC' };
}

function defaultBreakoutParams() {
  return { lookback_period: 20, volume_multiplier: 1.5, confirmation_bars: 1 };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 2,
        fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        background: active ? 'rgba(8,153,129,0.15)' : 'rgba(120,123,134,0.12)',
        color: active ? '#089981' : '#787B86',
        border: `1px solid ${active ? 'rgba(8,153,129,0.3)' : 'rgba(120,123,134,0.2)'}`,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function ConditionPill({ text }: { text: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      background: 'rgba(41,98,255,0.12)', color: '#5C8FFF',
      border: '1px solid rgba(41,98,255,0.25)',
      borderRadius: 2, fontSize: 11, fontFamily: 'var(--font-mono)',
    }}>
      {text}
    </span>
  );
}

function TechConditionRow({
  cond, index, total,
  onChange, onRemove,
}: {
  cond: any; index: number; total: number;
  onChange: (updated: any) => void; onRemove: () => void;
}) {
  const isBreakPattern = cond.indicator === 'breakout' || cond.indicator === 'breakdown';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {index > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
          {['AND', 'OR'].map((op) => (
            <button
              key={op}
              onClick={() => onChange({ ...cond, logic: op })}
              style={{
                padding: '2px 10px', borderRadius: 2, cursor: 'pointer',
                fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                border: '1px solid',
                background: cond.logic === op ? 'var(--accent-primary)' : 'transparent',
                borderColor: cond.logic === op ? 'var(--accent-primary)' : 'var(--border-grid)',
                color: cond.logic === op ? 'white' : 'var(--text-muted)',
              }}
            >
              {op}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isBreakPattern ? '1.2fr 1fr 1fr 1fr auto' : '1.2fr auto auto auto 90px auto', alignItems: 'end' }}>
        {/* Indicator */}
        <div style={{ display: 'grid', gap: 4 }}>
          <label style={labelStyle}>Indicator</label>
          <select
            value={cond.indicator}
            onChange={(e) => {
              const ind = e.target.value;
              const isBreak = ind === 'breakout' || ind === 'breakdown';
              onChange({
                ...cond,
                indicator: ind,
                params: isBreak ? defaultBreakoutParams() : { period: 14 },
                operator: isBreak ? undefined : '>',
                value: isBreak ? undefined : 70,
              });
            }}
            style={inputStyle}
          >
            {INDICATORS.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>

        {isBreakPattern ? (
          <>
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={labelStyle}>Lookback bars</label>
              <input
                type="number" min={5} max={200}
                value={cond.params?.lookback_period ?? 20}
                onChange={(e) => onChange({ ...cond, params: { ...cond.params, lookback_period: +e.target.value } })}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={labelStyle}>Vol multiplier</label>
              <input
                type="number" min={1} max={10} step={0.1}
                value={cond.params?.volume_multiplier ?? 1.5}
                onChange={(e) => onChange({ ...cond, params: { ...cond.params, volume_multiplier: +e.target.value } })}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={labelStyle}>Confirm bars</label>
              <input
                type="number" min={1} max={5}
                value={cond.params?.confirmation_bars ?? 1}
                onChange={(e) => onChange({ ...cond, params: { ...cond.params, confirmation_bars: +e.target.value } })}
                style={inputStyle}
              />
            </div>
          </>
        ) : (
          <>
            {/* Period param for non-pattern indicators */}
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={labelStyle}>Period</label>
              <input
                type="number" min={1} max={500}
                value={cond.params?.period ?? 14}
                onChange={(e) => onChange({ ...cond, params: { ...cond.params, period: +e.target.value } })}
                style={{ ...inputStyle, width: 70 }}
              />
            </div>
            {/* Operator */}
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={labelStyle}>Condition</label>
              <select
                value={cond.operator}
                onChange={(e) => onChange({ ...cond, operator: e.target.value })}
                style={inputStyle}
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* Value */}
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={labelStyle}>Value</label>
              <input
                type="number"
                value={cond.value}
                onChange={(e) => onChange({ ...cond, value: +e.target.value })}
                style={{ ...inputStyle, width: 90 }}
              />
            </div>
          </>
        )}

        {/* Remove */}
        <button
          onClick={onRemove}
          disabled={total === 1}
          title="Remove condition"
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid transparent', background: 'transparent',
            color: 'var(--text-muted)', cursor: total === 1 ? 'not-allowed' : 'pointer',
            alignSelf: 'end', marginBottom: 0,
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function FundConditionRow({
  cond, index, total, onChange, onRemove,
}: {
  cond: any; index: number; total: number;
  onChange: (u: any) => void; onRemove: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {index > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
          {['AND', 'OR'].map((op) => (
            <button
              key={op}
              onClick={() => onChange({ ...cond, logic: op })}
              style={{
                padding: '2px 10px', borderRadius: 2, cursor: 'pointer',
                fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                border: '1px solid',
                background: cond.logic === op ? 'var(--accent-primary)' : 'transparent',
                borderColor: cond.logic === op ? 'var(--accent-primary)' : 'var(--border-grid)',
                color: cond.logic === op ? 'white' : 'var(--text-muted)',
              }}
            >
              {op}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <label style={labelStyle}>Metric</label>
          <select
            value={cond.metric}
            onChange={(e) => onChange({ ...cond, metric: e.target.value })}
            style={inputStyle}
          >
            {FUND_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <label style={labelStyle}>Operator</label>
          <select
            value={cond.operator}
            onChange={(e) => onChange({ ...cond, operator: e.target.value })}
            style={inputStyle}
          >
            {['<', '>', '='].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <label style={labelStyle}>Value</label>
          <input
            type="number"
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: +e.target.value })}
            style={{ ...inputStyle, width: 90 }}
          />
        </div>
        <button
          onClick={onRemove}
          disabled={total === 1}
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid transparent', background: 'transparent',
            color: 'var(--text-muted)', cursor: total === 1 ? 'not-allowed' : 'pointer',
            alignSelf: 'end',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Style constants ─────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  border: '1px solid var(--border-grid)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
};

const sectionCardStyle: React.CSSProperties = {
  border: '1px solid var(--border-grid)',
  background: 'var(--bg-panel)',
  marginBottom: 16,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  borderBottom: '1px solid var(--border-grid)',
};

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const addBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  background: 'transparent',
  border: '1px dashed var(--border-grid)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  cursor: 'pointer',
};

// ─── Main component ──────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'edit';

export default function SetupBuilder() {
  const [view, setView] = useState<View>('list');
  const [setups, setSetups] = useState<any[]>([]);
  const [editingSetup, setEditingSetup] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Builder state
  const [name, setName] = useState('');
  const [techConds, setTechConds] = useState<any[]>([defaultTechCondition()]);
  const [fundConds, setFundConds] = useState<any[]>([defaultFundCondition()]);
  const [fundMode, setFundMode] = useState<'display_only' | 'required_for_signal'>('display_only');
  const [orderRule, setOrderRule] = useState(defaultOrderRule());

  const fetchSetups = useCallback(async () => {
    try { setSetups(await api.getSetups()); } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchSetups(); }, [fetchSetups]);

  // ── Builder helpers ──────────────────────────────────────────────────────

  const resetBuilder = () => {
    setName('');
    setTechConds([defaultTechCondition()]);
    setFundConds([defaultFundCondition()]);
    setFundMode('display_only');
    setOrderRule(defaultOrderRule());
    setEditingSetup(null);
  };

  const openCreate = () => { resetBuilder(); setView('create'); };

  const openEdit = (setup: any) => {
    setEditingSetup(setup);
    setName(setup.name);
    setTechConds(
      (setup.technicalConditions || []).map((c: any, i: number) => ({ ...c, id: i })),
    );
    setFundConds(
      (setup.fundamentalConditions || [defaultFundCondition()]).map((c: any, i: number) => ({ ...c, id: i })),
    );
    setFundMode(setup.fundamentalMode || 'display_only');
    setOrderRule({ ...defaultOrderRule(), ...(setup.orderRule || {}) });
    setView('edit');
  };

  const buildPayload = () => ({
    name,
    technicalConditions: techConds.map(({ id, ...rest }) => rest),
    fundamentalConditions: fundConds.map(({ id, ...rest }) => rest),
    fundamentalMode: fundMode,
    orderRule,
  });

  const handleSave = async (activateAfterSave = false) => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (view === 'create') {
        const created = await api.createSetup(buildPayload());
        if (activateAfterSave) await api.toggleSetupActive(created.id);
      } else if (view === 'edit' && editingSetup) {
        await api.updateSetup(editingSetup.id, buildPayload());
        if (activateAfterSave && !editingSetup.active) {
          await api.toggleSetupActive(editingSetup.id);
        }
      }
      await fetchSetups();
      setView('list');
      resetBuilder();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (setup: any) => {
    setTogglingId(setup.id);
    try {
      await api.toggleSetupActive(setup.id);
      await fetchSetups();
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDuplicate = async (setup: any) => {
    try {
      await api.duplicateSetup(setup.id);
      await fetchSetups();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this setup?')) return;
    try { await api.deleteSetup(id); await fetchSetups(); } catch (err) { console.error(err); }
  };

  // ── Tech condition helpers ─────────────────────────────────────────────

  const updateTechCond = (id: number, updated: any) =>
    setTechConds((prev) => prev.map((c) => (c.id === id ? updated : c)));
  const removeTechCond = (id: number) =>
    setTechConds((prev) => prev.filter((c) => c.id !== id));
  const addTechCond = () =>
    setTechConds((prev) => [...prev, { ...defaultTechCondition(), id: Date.now() }]);

  // ── Fund condition helpers ─────────────────────────────────────────────

  const updateFundCond = (id: number, updated: any) =>
    setFundConds((prev) => prev.map((c) => (c.id === id ? updated : c)));
  const removeFundCond = (id: number) =>
    setFundConds((prev) => prev.filter((c) => c.id !== id));
  const addFundCond = () =>
    setFundConds((prev) => [...prev, { ...defaultFundCondition(), id: Date.now() }]);

  // ── Render helpers ─────────────────────────────────────────────────────

  const condPreviewText = (setup: any) => {
    const tc = setup.technicalConditions || [];
    if (tc.length === 0) return 'No conditions';
    return tc
      .slice(0, 2)
      .map((c: any) => {
        if (c.indicator === 'breakout') return `Breakout (${c.params?.lookback_period ?? 20}B)`;
        if (c.indicator === 'breakdown') return `Breakdown (${c.params?.lookback_period ?? 20}B)`;
        return `${c.indicator} ${c.operator} ${c.value}`;
      })
      .join(', ') + (tc.length > 2 ? ` +${tc.length - 2} more` : '');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: List View
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="workspace-scroll setup-builder">
        <header className="workspace-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <span className="workspace-kicker">Strategy Library</span>
            <h2>Setups</h2>
            <p>Named, reusable condition sets. Each setup can be activated to trigger live alerts.</p>
          </div>
          <button
            onClick={openCreate}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 44, padding: '0 18px',
              background: 'var(--accent-primary)', color: 'white',
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
              textTransform: 'uppercase', border: '1px solid var(--accent-primary)',
              cursor: 'pointer',
            }}
          >
            <Plus size={16} /> New Setup
          </button>
        </header>

        {setups.length === 0 ? (
          <div style={{ border: '1px dashed var(--border-grid)', padding: 48, textAlign: 'center' }}>
            <Zap size={28} style={{ color: 'var(--accent-primary)', opacity: 0.5, marginBottom: 12 }} />
            <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              No setups yet. Create one to start scanning for signals.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--border-grid)' }}>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 100px 120px',
              gap: 0,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border-grid)',
              background: 'var(--bg-base)',
            }}>
              {['Setup Name', 'Conditions', 'Fund. Mode', 'Actions'].map((h) => (
                <span key={h} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em',
                }}>{h}</span>
              ))}
            </div>

            {setups.map((setup) => (
              <div
                key={setup.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 100px 120px',
                  alignItems: 'center',
                  gap: 0,
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border-grid)',
                  background: setup.active ? 'rgba(8,153,129,0.04)' : 'var(--bg-panel)',
                  transition: 'background 0.15s',
                }}
              >
                {/* Name + status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}>
                    {setup.name}
                  </span>
                  <StatusBadge active={setup.active} />
                </div>

                {/* Conditions preview */}
                <div style={{ paddingRight: 16 }}>
                  <ConditionPill text={condPreviewText(setup)} />
                </div>

                {/* Fund mode */}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: setup.fundamentalMode === 'required_for_signal' ? '#FFB800' : 'var(--text-muted)',
                }}>
                  {setup.fundamentalMode === 'required_for_signal' ? 'Required' : 'Display only'}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* Activate toggle */}
                  <button
                    title={setup.active ? 'Deactivate' : 'Activate'}
                    onClick={() => handleToggleActive(setup)}
                    disabled={togglingId === setup.id}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid',
                      borderColor: setup.active ? 'rgba(8,153,129,0.4)' : 'var(--border-grid)',
                      background: setup.active ? 'rgba(8,153,129,0.12)' : 'transparent',
                      color: setup.active ? '#089981' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {setup.active ? <Power size={13} /> : <PowerOff size={13} />}
                  </button>
                  {/* Edit */}
                  <button
                    title="Edit"
                    onClick={() => openEdit(setup)}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid var(--border-grid)', background: 'transparent',
                      color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >
                    <Edit3 size={13} />
                  </button>
                  {/* Duplicate */}
                  <button
                    title="Duplicate"
                    onClick={() => handleDuplicate(setup)}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid var(--border-grid)', background: 'transparent',
                      color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >
                    <Copy size={13} />
                  </button>
                  {/* Delete */}
                  <button
                    title="Delete"
                    onClick={() => handleDelete(setup.id)}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid transparent', background: 'transparent',
                      color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as any).style.color = '#F23645'; (e.currentTarget as any).style.borderColor = 'rgba(242,54,69,0.3)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as any).style.color = 'var(--text-muted)'; (e.currentTarget as any).style.borderColor = 'transparent'; }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Builder View (create / edit)
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="workspace-scroll setup-builder">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => { setView('list'); resetBuilder(); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none',
            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <ChevronLeft size={14} /> All Setups
        </button>
        <span style={{ color: 'var(--border-grid)' }}>/</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>
          {view === 'create' ? 'New Setup' : `Edit: ${editingSetup?.name}`}
        </span>
      </div>

      <div style={{ maxWidth: 860 }}>

        {/* ── Name ── */}
        <div style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionTitleStyle}><Target size={14} /> Setup Name</span>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <input
              type="text"
              placeholder="e.g. RSI Oversold + Breakout"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, width: '100%', height: 44, fontSize: 15 }}
            />
          </div>
        </div>

        {/* ── Technical Conditions ── */}
        <div style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionTitleStyle}><BarChart2 size={14} /> Technical Conditions</span>
            <button onClick={addTechCond} style={addBtnStyle}>
              <Plus size={12} /> Add Condition
            </button>
          </div>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {techConds.map((cond, i) => (
              <TechConditionRow
                key={cond.id}
                cond={cond}
                index={i}
                total={techConds.length}
                onChange={(u) => updateTechCond(cond.id, u)}
                onRemove={() => removeTechCond(cond.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Fundamental Conditions ── */}
        <div style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionTitleStyle}><Shield size={14} /> Fundamental Conditions</span>
            <button onClick={addFundCond} style={addBtnStyle}>
              <Plus size={12} /> Add Filter
            </button>
          </div>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {fundConds.map((cond, i) => (
              <FundConditionRow
                key={cond.id}
                cond={cond}
                index={i}
                total={fundConds.length}
                onChange={(u) => updateFundCond(cond.id, u)}
                onRemove={() => removeFundCond(cond.id)}
              />
            ))}
          </div>
          {/* Fund mode toggle */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-grid)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ ...labelStyle, flexShrink: 0 }}>Fundamentals role:</span>
            {[
              { v: 'display_only', label: 'Display only (informational)' },
              { v: 'required_for_signal', label: 'Required for alert' },
            ].map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setFundMode(v as any)}
                style={{
                  padding: '5px 12px', cursor: 'pointer', fontSize: 11,
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                  border: '1px solid',
                  borderColor: fundMode === v ? 'var(--accent-primary)' : 'var(--border-grid)',
                  background: fundMode === v ? 'rgba(41,98,255,0.15)' : 'transparent',
                  color: fundMode === v ? 'var(--accent-primary)' : 'var(--text-muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Order Rule ── */}
        <div style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionTitleStyle}><TrendingUp size={14} /> Order Rule</span>
          </div>
          <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {[
              { key: 'stopLossPct', label: 'Stop Loss %', type: 'number', step: 0.5 },
              { key: 'takeProfitPct', label: 'Take Profit %', type: 'number', step: 0.5 },
              { key: 'trailingStopPct', label: 'Trailing Stop %', type: 'number', step: 0.5 },
              { key: 'stopLimitPrice', label: 'Stop Limit Price', type: 'number', step: 0.01 },
            ].map(({ key, label, type, step }) => (
              <div key={key} style={{ display: 'grid', gap: 6 }}>
                <label style={labelStyle}>{label}</label>
                <input
                  type={type}
                  step={step}
                  min={0}
                  placeholder="—"
                  value={(orderRule as any)[key]}
                  onChange={(e) => setOrderRule((prev) => ({ ...prev, [key]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={labelStyle}>Time In Force</label>
              <select
                value={orderRule.timeInForce}
                onChange={(e) => setOrderRule((prev) => ({ ...prev, timeInForce: e.target.value }))}
                style={inputStyle}
              >
                {TIMEFRAMES.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
          <button
            onClick={() => handleSave(false)}
            disabled={!name.trim() || saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 44, padding: '0 22px',
              border: '1px solid var(--border-grid)', background: 'transparent',
              color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
              fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
              cursor: !name.trim() || saving ? 'not-allowed' : 'pointer',
              opacity: !name.trim() || saving ? 0.5 : 1,
            }}
          >
            <Clock size={15} />
            {view === 'create' ? 'Save as Inactive' : 'Save Changes'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={!name.trim() || saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 44, padding: '0 22px',
              background: '#089981', border: '1px solid #089981',
              color: 'white', fontFamily: 'var(--font-mono)',
              fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
              cursor: !name.trim() || saving ? 'not-allowed' : 'pointer',
              opacity: !name.trim() || saving ? 0.5 : 1,
            }}
          >
            <CheckCircle2 size={15} />
            {view === 'create' ? 'Save & Activate' : 'Save & Activate'}
          </button>
          <button
            onClick={() => { setView('list'); resetBuilder(); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 44, padding: '0 16px',
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
