import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

export default function SetupBuilder() {
  const [setups, setSetups] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [techCond] = useState([{ indicator: 'RSI', params: { period: 14 }, operator: '>', value: 70 }]);
  const [fundCond] = useState([{ metric: 'peRatio', operator: '<', value: 20 }]);
  const [fundMode, setFundMode] = useState('required_for_signal');
  const [orderRule] = useState({ stopLossPct: 5, takeProfitPct: 15 });

  const fetchSetups = async () => {
    try { setSetups(await api.getSetups()); } catch (error) { console.error(error); }
  };
  useEffect(() => { fetchSetups(); }, []);

  const handleCreate = async () => {
    try {
      await api.createSetup({ name, technicalConditions: techCond, fundamentalConditions: fundCond, fundamentalMode: fundMode, orderRule });
      await fetchSetups();
      setName('');
    } catch (error) { console.error(error); }
  };
  const handleDelete = async (id: string) => {
    try { await api.deleteSetup(id); await fetchSetups(); } catch (error) { console.error(error); }
  };

  return <div className="workspace-scroll setup-builder">
    <header className="workspace-heading"><span className="workspace-kicker">Strategy library</span><h2>Build a setup</h2><p>Turn a repeatable market read into a testable rule.</p></header>
    <div className="setup-grid">
      <section className="workspace-card">
        <div className="card-heading"><span>Create</span><small>New rule set</small></div>
        <label className="form-field"><span>Setup name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. RSI mean reversion" /></label>
        <label className="form-field"><span>Fundamental filter</span><select value={fundMode} onChange={(event) => setFundMode(event.target.value)}><option value="display_only">Display only</option><option value="required_for_signal">Required for signal</option></select></label>
        <div className="rule-preview"><span>Default signal</span><strong>RSI (14) &gt; 70</strong><small>Stop loss 5% · Take profit 15%</small></div>
        <button className="primary-action" onClick={handleCreate} disabled={!name}><Plus size={16} />Create setup</button>
      </section>
      <section className="workspace-card setup-list-card">
        <div className="card-heading"><span>Your setups</span><small>{setups.length} saved</small></div>
        {setups.length === 0 ? <div className="empty-card"><span>No setups saved</span><p>Create your first rule set to compare it against market history.</p></div> : <ul className="setup-list">
          {setups.map((setup) => <li key={setup.id}><div><strong>{setup.name}</strong><span>{setup.fundamentalMode === 'required_for_signal' ? 'Fundamentals required' : 'Fundamentals shown'}</span></div><button onClick={() => handleDelete(setup.id)} aria-label={`Delete ${setup.name}`}><Trash2 size={16} /></button></li>)}
        </ul>}
      </section>
    </div>
  </div>;
}
