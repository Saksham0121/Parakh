import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleDashed, Plus, Radar, Save, Shield, Target, Trash2, TrendingUp, X, XCircle, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import type { FundamentalCondition, ScanResponse, Setup, SetupInput, TechnicalCondition } from '../../lib/types';
import { INDICATORS, METRICS, OPERATORS, TEMPLATES, TIMEFRAMES, defaultParams, describeCondition, indicatorDef, metricDef, metricLabel, newCondition } from '../../lib/catalog';
import { useWatchlistStore } from '../../store/watchlistStore';
import { toast } from '../../store/toastStore';
import { displaySymbol, fmtPct, fmtPrice, toneOf } from '../../lib/format';
import { Segmented, Spinner } from '../ui/primitives';

const GROUPS = ['Pattern', 'Price', 'Trend', 'Momentum', 'Volatility', 'Volume'] as const;
const SERIES = INDICATORS.filter((i) => !i.pattern);

function IndicatorSelect({ id, value, onChange, seriesOnly }: { id: string; value: string; onChange: (v: string) => void; seriesOnly?: boolean }) {
  return (
    <select id={id} className="select select-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {GROUPS.filter((g) => !(seriesOnly && g === 'Pattern')).map((g) => (
        <optgroup key={g} label={g}>
          {(seriesOnly ? SERIES : INDICATORS).filter((i) => i.group === g).map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function ParamInputs({ indicator, params, onChange, prefix }: { indicator: string; params?: Record<string, number>; onChange: (p: Record<string, number>) => void; prefix: string }) {
  const def = indicatorDef(indicator);
  return (
    <>
      {def.params.map((p) => (
        <div className="field w-sm" key={p.key}>
          <label htmlFor={`${prefix}-${p.key}`}>{p.label}</label>
          <input id={`${prefix}-${p.key}`} className="input input-sm num" type="number" inputMode="decimal" step={p.step ?? 1} min={p.min}
            value={params?.[p.key] ?? p.def}
            onChange={(e) => onChange({ ...params, [p.key]: e.target.value === '' ? p.def : Number(e.target.value) })} />
        </div>
      ))}
    </>
  );
}

function RuleEditor({ c, i, onChange, onRemove }: { c: TechnicalCondition; i: number; onChange: (c: TechnicalCondition) => void; onRemove: () => void }) {
  const def = indicatorDef(c.indicator);
  const vsInd = c.compareTo === 'indicator';
  return (
    <div className="rule">
      <div className="rule-row">
        <div className="field" style={{ flex: '2 1 200px' }}>
          <label htmlFor={`r${i}-ind`}>Indicator</label>
          <IndicatorSelect id={`r${i}-ind`} value={c.indicator} onChange={(v) => onChange({ ...c, indicator: v, params: defaultParams(v) })} />
        </div>
        <ParamInputs indicator={c.indicator} params={c.params} onChange={(params) => onChange({ ...c, params })} prefix={`r${i}`} />
        <button type="button" className="btn btn-ghost btn-sm btn-icon btn-danger" onClick={onRemove} aria-label="Remove condition" style={{ marginLeft: 'auto' }}><Trash2 size={14} /></button>
      </div>
      {def.pattern ? (
        <p className="hint">{def.hint}</p>
      ) : (
        <div className="rule-row">
          <div className="field">
            <label htmlFor={`r${i}-op`}>Condition</label>
            <select id={`r${i}-op`} className="select select-sm" value={c.operator ?? 'gt'} onChange={(e) => onChange({ ...c, operator: e.target.value })}>
              {OPERATORS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <span className="label">Compare with</span>
            <Segmented value={vsInd ? 'indicator' : 'value'} options={[{ id: 'value', label: 'Value' }, { id: 'indicator', label: 'Indicator' }]}
              onChange={(v) => onChange(v === 'indicator'
                ? { ...c, compareTo: 'indicator', compareIndicator: c.compareIndicator ?? 'SMA', compareParams: c.compareParams ?? defaultParams(c.compareIndicator ?? 'SMA') }
                : { ...c, compareTo: 'value' })} />
          </div>
          {vsInd ? (
            <>
              <div className="field" style={{ flex: '2 1 160px' }}>
                <label htmlFor={`r${i}-cmp`}>Indicator</label>
                <IndicatorSelect id={`r${i}-cmp`} seriesOnly value={c.compareIndicator ?? 'SMA'} onChange={(v) => onChange({ ...c, compareIndicator: v, compareParams: defaultParams(v) })} />
              </div>
              <ParamInputs indicator={c.compareIndicator ?? 'SMA'} params={c.compareParams} onChange={(compareParams) => onChange({ ...c, compareParams })} prefix={`r${i}c`} />
            </>
          ) : (
            <div className="field w-sm">
              <label htmlFor={`r${i}-val`}>Value</label>
              <input id={`r${i}-val`} className="input input-sm num" type="number" inputMode="decimal" value={c.value ?? 0}
                onChange={(e) => onChange({ ...c, value: Number(e.target.value) })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const toInput = (s?: Setup | null): SetupInput => s ? {
  name: s.name, technicalConditions: s.technicalConditions ?? [], fundamentalConditions: s.fundamentalConditions ?? [],
  fundamentalMode: s.fundamentalMode === 'display_only' ? 'display_only' : 'required_for_signal',
  orderRule: { side: 'LONG', ...(s.orderRule ?? {}) }, timeframe: s.timeframe || 'D', universe: s.universe ?? [],
} : {
  name: '', technicalConditions: [{ ...newCondition('BREAKOUT') }], fundamentalConditions: [],
  fundamentalMode: 'required_for_signal', orderRule: { side: 'LONG', stopLossPct: 5, takeProfitPct: 10 }, timeframe: 'D', universe: [],
};

export default function SetupEditor({ setup, onDone }: { setup: Setup | null; onDone: (saved?: Setup) => void }) {
  const [form, setForm] = useState<SetupInput>(() => toInput(setup));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScanResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [symbolDraft, setSymbolDraft] = useState('');
  const watchlist = useWatchlistStore((s) => s.watchlist);

  const set = <K extends keyof SetupInput>(k: K, v: SetupInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setRule = (i: number, c: TechnicalCondition) => set('technicalConditions', form.technicalConditions.map((x, j) => (j === i ? c : x)));
  const setFund = (i: number, c: FundamentalCondition) => set('fundamentalConditions', form.fundamentalConditions.map((x, j) => (j === i ? c : x)));
  const universe = form.universe.length ? form.universe : watchlist.map((w) => w.symbol);
  const summary = useMemo(() => form.technicalConditions.map(describeCondition), [form.technicalConditions]);

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => setForm((f) => ({ ...t.setup, universe: f.universe, name: f.name || t.setup.name }));

  const addSymbols = () => {
    const parts = symbolDraft.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!parts.length) return;
    set('universe', Array.from(new Set([...form.universe, ...parts])));
    setSymbolDraft('');
  };

  const runPreview = async () => {
    setPreviewing(true); setError(null);
    try {
      setPreview(await api.runScan({ ...form, symbols: universe }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const save = async (activate: boolean) => {
    if (!form.name.trim()) { setError('Give the setup a name.'); return; }
    if (!form.technicalConditions.length) { setError('Add at least one technical condition.'); return; }
    setSaving(true); setError(null);
    try {
      let saved = setup ? await api.updateSetup(setup.id, form) : await api.createSetup(form);
      if (activate && !saved.active) saved = await api.toggleSetupActive(saved.id);
      toast(setup ? 'Setup saved' : 'Setup created', activate ? 'Monitoring is on — you’ll get an alert when a symbol matches.' : undefined, 'up');
      onDone(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-inner">
      <div className="view-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => onDone()} aria-label="Back to setups"><ArrowLeft size={18} /></button>
          <div>
            <h1>{setup ? 'Edit setup' : 'New setup'}</h1>
            <p>Describe the trade you look for. Parakh watches your symbols and tells you when one has it.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => save(false)} disabled={saving}><Save size={15} /> Save</button>
          <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>{saving ? <Spinner size={14} /> : <Zap size={15} />} Save & monitor</button>
        </div>
      </div>

      {error && <div className="notice notice-error" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="builder">
        <div className="builder-col">
          <section className="card">
            <div className="block-body">
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="s-name">Setup name</label>
                  <input id="s-name" className="input" placeholder="e.g. Breakout with fair valuation" value={form.name} onChange={(e) => set('name', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="s-tf">Timeframe</label>
                  <select id="s-tf" className="select" value={form.timeframe} onChange={(e) => set('timeframe', e.target.value)}>
                    {TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.long}</option>)}
                  </select>
                </div>
              </div>
              {!setup && (
                <div className="field">
                  <span className="label">Start from a template</span>
                  <div className="templates">
                    {TEMPLATES.map((t) => <button key={t.name} type="button" className="btn btn-sm" title={t.blurb} onClick={() => applyTemplate(t)}>{t.name}</button>)}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="block-head">
              <div><h2><TrendingUp size={16} className="muted" /> Technical conditions</h2><p>Evaluated on each {TIMEFRAMES.find((t) => t.id === form.timeframe)?.long.toLowerCase()} bar’s close.</p></div>
            </div>
            <div className="block-body">
              {form.technicalConditions.map((c, i) => (
                <div key={i} style={{ display: 'contents' }}>
                  {i > 0 && (
                    <div className="joiner">
                      <Segmented value={c.logic ?? 'AND'} options={[{ id: 'AND', label: 'AND' }, { id: 'OR', label: 'OR' }]} onChange={(v) => setRule(i, { ...c, logic: v })} />
                    </div>
                  )}
                  <RuleEditor c={c} i={i} onChange={(nc) => setRule(i, nc)} onRemove={() => set('technicalConditions', form.technicalConditions.filter((_, j) => j !== i))} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm" onClick={() => set('technicalConditions', [...form.technicalConditions, newCondition('RSI')])}><Plus size={14} /> Add condition</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('technicalConditions', [...form.technicalConditions, newCondition('VOLUME_SPIKE')])}><Plus size={14} /> Volume confirmation</button>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="block-head">
              <div><h2><Shield size={16} className="muted" /> Fundamental filters</h2><p>Checked after the technicals pass, using the latest reported numbers.</p></div>
              {form.fundamentalConditions.length > 0 && (
                <Segmented value={form.fundamentalMode} onChange={(v) => set('fundamentalMode', v)}
                  options={[{ id: 'required_for_signal', label: 'Must pass' }, { id: 'display_only', label: 'Info only' }]} />
              )}
            </div>
            <div className="block-body">
              {form.fundamentalConditions.map((f, i) => {
                const m = metricDef(f.metric);
                return (
                  <div className="rule-row" key={i}>
                    <div className="field" style={{ flex: '2 1 180px' }}>
                      <label htmlFor={`f${i}-m`}>Metric</label>
                      <select id={`f${i}-m`} className="select select-sm" value={f.metric}
                        onChange={(e) => { const d = metricDef(e.target.value); setFund(i, { metric: d.id, operator: d.op, value: d.def }); }}>
                        {METRICS.map((x) => <option key={x.id} value={x.id}>{metricLabel(x.id)}</option>)}
                      </select>
                    </div>
                    <div className="field w-sm">
                      <label htmlFor={`f${i}-op`}>Is</label>
                      <select id={`f${i}-op`} className="select select-sm" value={f.operator} onChange={(e) => setFund(i, { ...f, operator: e.target.value })}>
                        <option value="lt">below</option><option value="lte">at most</option><option value="gt">above</option><option value="gte">at least</option>
                      </select>
                    </div>
                    <div className="field w-sm">
                      <label htmlFor={`f${i}-v`}>Value{m.unit ? ` (${m.unit})` : ''}</label>
                      <input id={`f${i}-v`} className="input input-sm num" type="number" inputMode="decimal" value={f.value} onChange={(e) => setFund(i, { ...f, value: Number(e.target.value) })} />
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon btn-danger" onClick={() => set('fundamentalConditions', form.fundamentalConditions.filter((_, j) => j !== i))} aria-label="Remove filter"><Trash2 size={14} /></button>
                  </div>
                );
              })}
              <div>
                <button type="button" className="btn btn-sm" onClick={() => set('fundamentalConditions', [...form.fundamentalConditions, { metric: 'pe_ratio', operator: 'lt', value: 30 }])}><Plus size={14} /> Add filter</button>
              </div>
              {form.fundamentalConditions.length > 0 && (
                <p className="hint">{form.fundamentalMode === 'required_for_signal'
                  ? 'A symbol only matches when every filter passes. Missing data counts as a fail.'
                  : 'Filters are shown next to each match but don’t block it.'}</p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="block-head"><div><h2><Target size={16} className="muted" /> Trade plan</h2><p>Used by the backtester to manage each simulated trade.</p></div></div>
            <div className="block-body">
              <Segmented className="seg-up" value={form.orderRule.side ?? 'LONG'} onChange={(v) => set('orderRule', { ...form.orderRule, side: v })}
                options={[{ id: 'LONG', label: 'Long' }, { id: 'SHORT', label: 'Short' }]} />
              <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                {([['stopLossPct', 'Stop loss %'], ['takeProfitPct', 'Take profit %'], ['trailingStopPct', 'Trailing stop %'], ['maxHoldBars', 'Max bars held']] as const).map(([k, label]) => (
                  <div className="field" key={k}>
                    <label htmlFor={`o-${k}`}>{label}</label>
                    <input id={`o-${k}`} className="input input-sm num" type="number" inputMode="decimal" min={0} placeholder="Off"
                      value={form.orderRule[k] ?? ''} onChange={(e) => set('orderRule', { ...form.orderRule, [k]: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="builder-col sticky-col">
          <section className="card">
            <div className="block-head"><div><h2><Radar size={16} className="muted" /> Symbols to watch</h2><p>{form.universe.length ? `${form.universe.length} custom symbols` : `Your watchlist (${watchlist.length})`}</p></div></div>
            <div className="block-body">
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input input-sm" placeholder="Add symbols, e.g. TCS.NS INFY.NS" value={symbolDraft}
                  onChange={(e) => setSymbolDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSymbols(); } }} />
                <button className="btn btn-sm" onClick={addSymbols}>Add</button>
              </div>
              <div className="chips">
                {form.universe.map((s) => (
                  <span className="chip" key={s}>{displaySymbol(s)}<button className="btn btn-ghost btn-sm btn-icon" style={{ width: 20, height: 20 }} aria-label={`Remove ${s}`} onClick={() => set('universe', form.universe.filter((x) => x !== s))}><X size={12} /></button></span>
                ))}
                {!form.universe.length && <span className="hint">Leave empty to scan your watchlist — it stays in sync as you add stocks.</span>}
              </div>
              {form.universe.length > 0 && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set('universe', [])}>Use my watchlist instead</button>}
            </div>
          </section>

          <section className="card">
            <div className="block-head">
              <div><h2>Preview</h2><p>{summary.length ? summary.join(form.technicalConditions.some((c) => c.logic === 'OR') ? ' · ' : ' AND ') : 'No conditions yet'}</p></div>
            </div>
            <div className="block-body">
              <button className="btn btn-primary" onClick={runPreview} disabled={previewing || !universe.length || !form.technicalConditions.length}>
                {previewing ? <Spinner size={14} /> : <Radar size={15} />} Test on {universe.length} symbols now
              </button>
              {preview && (
                <>
                  <div className="hint">{preview.matched} of {preview.scanned} match right now · {(preview.durationMs / 1000).toFixed(1)}s</div>
                  <div className="checks">
                    {preview.results.slice(0, 12).map((r) => (
                      <div className="check" key={r.symbol} title={r.technical.map((t) => `${t.passed ? '✓' : '✗'} ${t.label}`).join('\n')}>
                        {r.matched ? <CheckCircle2 size={15} className="up" /> : r.error ? <CircleDashed size={15} className="muted" /> : <XCircle size={15} className="muted" />}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span className="mono" style={{ fontWeight: 600 }}>{displaySymbol(r.symbol)}</span>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {r.error ?? `${r.technical.filter((t) => t.passed).length}/${r.technical.length} technical${r.fundamentalsChecked ? ` · ${r.fundamental.filter((t) => t.passed).length}/${r.fundamental.length} fund.` : ''}`}
                          </span>
                          <span className={`num ${toneOf(r.changePct)}`} style={{ fontSize: 12 }}>{r.close != null ? fmtPrice(r.close) : ''} {fmtPct(r.changePct)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
