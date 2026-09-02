import React, { useState } from 'react';
import { useSwitchboard } from './useSwitchboard.ts';
import { MessageView, AgentMessage } from './MessageView.tsx';
import { SessionBrowser } from './SessionBrowser.tsx';
import './App.css';

export function App() {
  const { connected, roster, models, messages, sessions, loadingSessions, listSessions, errors, clearErrors, send } = useSwitchboard();
  const [activeTab, setActiveTab] = useState<string>('Main');
  const [input, setInput] = useState('');
  const [spawnAgent, setSpawnAgent] = useState('scout');
  const [spawnTask, setSpawnTask] = useState('');
  const [showSessionBrowser, setShowSessionBrowser] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const subagents = roster.filter(r => r.id !== 'Main');
  const activeSubagents = subagents.filter(r => {
    const status = r.status?.toLowerCase();
    if (status === 'running' || status === 'idle') return true;
    return r.lastActivity !== undefined && Date.now() - r.lastActivity < 5 * 60 * 1000;
  });
  const historicalSubagents = subagents.filter(r => !activeSubagents.includes(r));
  const activeAgent = roster.find(r => r.id === activeTab);
  const activeMessages = messages[activeTab] || [];

  const handleSendPrompt = () => {
    if (!input.trim()) return;
    send({ type: 'prompt', target: activeTab, text: input });
    setInput('');
  };

  const handleSpawn = () => {
    if (!spawnTask.trim()) return;
    send({ type: 'spawn', agent: spawnAgent, task: spawnTask });
    setSpawnTask('');
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="header-title">
            {showSessionBrowser
              ? 'Session Browser'
              : activeTab === 'Main'
              ? 'Main Orchestrator'
              : `Agent: ${activeAgent?.displayName || activeTab}`}
          </h1>
          <span className="status-badge">
            <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <button
            className={`header-sessions-btn ${showSessionBrowser ? 'active' : ''}`}
            onClick={() => {
              const next = !showSessionBrowser;
              setShowSessionBrowser(next);
              if (next) {
                listSessions();
              }
            }}
          >
            Sessions
          </button>
        </div>
        <div className="header-right">
          {activeTab !== 'Main' && (
            <select
              className="model-select"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  send({ type: 'set_model', target: activeTab, provider: '', modelId: e.target.value });
                }
              }}
            >
              <option value="">Switch Model...</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.id}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Main Container */}
      <div className="app-main">
        {/* Left Chat Pane */}
        <section className="chat-pane">
          {errors && errors.length > 0 && (
            <div className="error-banner">
              <div>
                {errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
              <button onClick={clearErrors} className="error-banner-btn">Dismiss</button>
            </div>
          )}
          {showSessionBrowser ? (
            <SessionBrowser
              sessions={sessions}
              loading={loadingSessions}
              onSelectSession={(s) => {
                send({ type: 'switch_session', path: s.path, cwd: s.cwd });
                setActiveTab('Main');
                setShowSessionBrowser(false);
              }}
              onClose={() => setShowSessionBrowser(false)}
            />
          ) : (
            <>
              <div className="chat-messages">
                {activeMessages.length === 0 ? (
                  <div className="empty-chat">No messages yet for target "{activeTab}".</div>
                ) : (
                  activeMessages.map((m, i) => (
                    <MessageView key={i} message={m} />
                  ))
                )}
              </div>

              <div className="chat-input-bar">
                <input
                  className="chat-input"
                  placeholder={`Message ${activeTab}...`}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSendPrompt();
                  }}
                />
                <button onClick={handleSendPrompt} className="chat-send-btn">
                  Send
                </button>
              </div>
            </>
          )}
        </section>

        {/* Right Roster Sidebar */}
        <aside className="roster-pane">
          <div className="roster-header">
            <div className="roster-title">ROSTER</div>
            {historicalSubagents.length > 0 && (
              <button
                className="roster-history-toggle"
                onClick={() => setShowHistory(prev => !prev)}
              >
                {showHistory ? 'Hide history' : `Show history (${historicalSubagents.length})`}
              </button>
            )}
          </div>
          <div className="roster-cards">
            {/* Main Orchestrator Card */}
            <div
              className={`roster-card ${activeTab === 'Main' ? 'active' : ''}`}
              onClick={() => setActiveTab('Main')}
            >
              <div className="card-header">
                <span className="card-name">Main Orchestrator</span>
                <span className="status-dot connected" title="Active" />
              </div>
              <div className="card-details">
                <span>Target ID: Main</span>
              </div>
            </div>

            {/* Active Subagent Cards */}
            {activeSubagents.map(r => {
              const isRunning = r.status?.toLowerCase() === 'running';
              return (
                <div
                  key={r.id}
                  className={`roster-card ${activeTab === r.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(r.id)}
                >
                  <div className="card-header">
                    <span className="card-name">{r.displayName}</span>
                    <span
                      className={`status-dot ${isRunning ? 'connected' : 'disconnected'}`}
                      style={!isRunning ? { backgroundColor: 'var(--status-gray)' } : undefined}
                      title={r.status}
                    />
                  </div>
                  <div className="card-details">
                    <span>{r.status || 'idle'} {r.model ? `| ${r.model}` : ''}</span>
                    <span>Cost: ${(r.cost || 0).toFixed(4)} {r.tokens !== undefined ? `| ${r.tokens} tokens` : ''}</span>
                    {r.activity && <div className="card-activity" title={r.activity}>{r.activity}</div>}
                  </div>
                </div>
              );
            })}

            {/* Historical Subagent Cards */}
            {showHistory && historicalSubagents.length > 0 && (
              <>
                <div className="roster-history-divider">
                  <span>HISTORY</span>
                </div>
                {historicalSubagents.map(r => {
                  const isRunning = r.status?.toLowerCase() === 'running';
                  return (
                    <div
                      key={r.id}
                      className={`roster-card historical ${activeTab === r.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(r.id)}
                    >
                      <div className="card-header">
                        <span className="card-name">{r.displayName}</span>
                        <span
                          className={`status-dot ${isRunning ? 'connected' : 'disconnected'}`}
                          style={!isRunning ? { backgroundColor: 'var(--status-gray)' } : undefined}
                          title={r.status}
                        />
                      </div>
                      <div className="card-details">
                        <span>{r.status || 'idle'} {r.model ? `| ${r.model}` : ''}</span>
                        <span>Cost: ${(r.cost || 0).toFixed(4)} {r.tokens !== undefined ? `| ${r.tokens} tokens` : ''}</span>
                        {r.activity && <div className="card-activity" title={r.activity}>{r.activity}</div>}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <hr className="divider" />

          {/* Spawn Form */}
          <div className="spawn-section">
            <div className="roster-title">SPAWN SUBAGENT</div>
            <input
              className="spawn-input"
              placeholder="agent type (e.g. scout)"
              value={spawnAgent}
              onChange={e => setSpawnAgent(e.target.value)}
            />
            <textarea
              className="spawn-textarea"
              placeholder="task description"
              value={spawnTask}
              onChange={e => setSpawnTask(e.target.value)}
            />
            <button onClick={handleSpawn} className="spawn-btn">
              Spawn (via Main)
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
