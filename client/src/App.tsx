import React, { useState } from 'react';
import { useSwitchboard } from './useSwitchboard.ts';

export function App() {
  const { connected, roster, models, messages, send } = useSwitchboard();
  const [activeTab, setActiveTab] = useState<string>('Main');
  const [input, setInput] = useState('');
  const [spawnAgent, setSpawnAgent] = useState('scout');
  const [spawnTask, setSpawnTask] = useState('');

  const activeMessages = messages[activeTab] || [];
  const activeAgent = roster.find(r => r.id === activeTab);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ flex: 1, padding: '1rem', borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
        <h2>{activeTab === 'Main' ? 'Main Orchestrator' : `Subagent: ${activeAgent?.displayName}`} {!connected && '(Disconnected)'}</h2>

        {activeTab !== 'Main' && (
          <div style={{ marginBottom: '1rem' }}>
            <select onChange={(e) => send({ type: 'set_model', target: activeTab, provider: '', modelId: e.target.value })}>
              <option value="">Switch Model...</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', background: '#f5f5f5', padding: '1rem', marginBottom: '1rem' }}>
          {activeMessages.map((m, i) => (
            <div key={i} style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>
              {m.isEvent ? <pre style={{fontSize: '0.8em', color: 'gray'}}>{JSON.stringify(m.data)}</pre> : <pre>{JSON.stringify(m)}</pre>}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex' }}>
          <input style={{flex: 1}} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {
            if (e.key === 'Enter') { send({ type: 'prompt', target: activeTab, text: input }); setInput(''); }
          }} />
          <button onClick={() => { send({ type: 'prompt', target: activeTab, text: input }); setInput(''); }}>Send</button>
        </div>
      </div>

      <div style={{ width: '300px', padding: '1rem', overflowY: 'auto' }}>
        <h3>Roster</h3>
        <div onClick={() => setActiveTab('Main')} style={{ padding: '1rem', cursor: 'pointer', border: '1px solid #000', marginBottom: '0.5rem', background: activeTab === 'Main' ? '#eee' : '#fff' }}>
          <strong>Main Orchestrator</strong>
        </div>

        {roster.filter(r => r.id !== 'Main').map(r => (
          <div key={r.id} onClick={() => setActiveTab(r.id)} style={{ padding: '1rem', cursor: 'pointer', border: '1px solid #ccc', marginBottom: '0.5rem', background: activeTab === r.id ? '#eee' : '#fff' }}>
            <strong>{r.displayName}</strong> <br/>
            <small>{r.status} | {r.model} | ${(r.cost || 0).toFixed(4)}</small><br/>
            <small>{r.activity}</small>
          </div>
        ))}

        <hr />
        <h4>Spawn Subagent</h4>
        <input placeholder="agent type (e.g. scout)" value={spawnAgent} onChange={e => setSpawnAgent(e.target.value)} style={{width: '100%', marginBottom: '0.5rem'}} />
        <textarea placeholder="task" value={spawnTask} onChange={e => setSpawnTask(e.target.value)} style={{width: '100%', marginBottom: '0.5rem'}} />
        <button onClick={() => { send({ type: 'spawn', agent: spawnAgent, task: spawnTask }); setSpawnTask(''); }} style={{width: '100%'}}>Spawn (via Main)</button>
      </div>
    </div>
  );
}
