import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './SetupBuilder.css';

export default function SetupBuilder() {
  const [setups, setSetups] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [techCond] = useState([{ indicator: 'RSI', params: { period: 14 }, operator: '>', value: 70 }]);
  const [fundCond] = useState([{ metric: 'peRatio', operator: '<', value: 20 }]);
  const [fundMode, setFundMode] = useState('required_for_signal');
  const [orderRule] = useState({ stopLossPct: 5, takeProfitPct: 15 });

  useEffect(() => {
    fetchSetups();
  }, []);

  const fetchSetups = async () => {
    try {
      const res = await api.getSetups();
      setSetups(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async () => {
    try {
      await api.createSetup({
        name,
        technicalConditions: techCond,
        fundamentalConditions: fundCond,
        fundamentalMode: fundMode,
        orderRule
      });
      fetchSetups();
      setName('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteSetup(id);
      fetchSetups();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="setup-builder p-6 text-white h-full overflow-y-auto">
      <h2 className="text-2xl mb-6">Setup Builder</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl mb-4 text-accent">Create New Setup</h3>
          
          <div className="mb-4">
            <label className="block mb-2 text-sm text-gray-400">Setup Name</label>
            <input 
              className="w-full bg-gray-700 p-2 rounded text-white border border-gray-600 focus:border-accent"
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. RSI Oversold + Value Play" 
            />
          </div>

          <div className="mb-4">
            <label className="block mb-2 text-sm text-gray-400">Fundamental Mode</label>
            <select 
              className="w-full bg-gray-700 p-2 rounded text-white border border-gray-600 focus:border-accent"
              value={fundMode} 
              onChange={e => setFundMode(e.target.value)}
            >
              <option value="display_only">Display Only</option>
              <option value="required_for_signal">Required for Signal</option>
            </select>
          </div>

          <button 
            className="w-full bg-accent text-white p-2 rounded hover:bg-opacity-90 transition mt-4 font-bold"
            onClick={handleCreate}
            disabled={!name}
          >
            Create Setup
          </button>
        </div>

        <div className="card bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl mb-4 text-accent">Your Setups</h3>
          {setups.length === 0 ? (
            <p className="text-gray-400">No setups created yet.</p>
          ) : (
            <ul className="space-y-3">
              {setups.map(s => (
                <li key={s.id} className="bg-gray-700 p-3 rounded flex justify-between items-center">
                  <div>
                    <strong className="block">{s.name}</strong>
                    <span className="text-xs text-gray-400">{s.fundamentalMode}</span>
                  </div>
                  <button 
                    onClick={() => handleDelete(s.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
