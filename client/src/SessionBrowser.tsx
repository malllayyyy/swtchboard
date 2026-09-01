import React from 'react';
import type { SessionSummary } from '../../shared/protocol.ts';

export interface SessionBrowserProps {
  sessions: SessionSummary[];
  loading?: boolean;
  onSelectSession: (session: SessionSummary) => void;
  onClose: () => void;
}

export function SessionBrowser({
  sessions,
  loading = false,
  onSelectSession,
  onClose,
}: SessionBrowserProps) {
  return (
    <div className="session-browser-pane">
      <div className="session-browser-header">
        <h2 className="session-browser-title">OMP Sessions ({sessions.length})</h2>
        <button className="session-browser-close-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="session-browser-content">
        {loading && sessions.length === 0 ? (
          <div className="session-browser-loading">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="session-browser-empty">No sessions found.</div>
        ) : (
          sessions.map((s) => {
            const titleText = s.title || (s.firstMessage ? (s.firstMessage.length > 90 ? s.firstMessage.slice(0, 90) + '...' : s.firstMessage) : 'Untitled Session');
            const isRunning = s.status?.toLowerCase() === 'running';
            const dateStr = s.modified ? new Date(s.modified).toLocaleString() : '';

            return (
              <div key={s.id || s.path} className="session-card">
                <div className="session-card-header">
                  <div className="session-title-wrap">
                    <span
                      className={`status-dot ${isRunning ? 'connected' : 'disconnected'}`}
                      style={!isRunning ? { backgroundColor: 'var(--status-gray)' } : undefined}
                      title={s.status || 'idle'}
                    />
                    <h3 className="session-card-title" title={titleText}>
                      {titleText}
                    </h3>
                  </div>
                  <button
                    className="session-open-btn"
                    onClick={() => onSelectSession(s)}
                  >
                    Open
                  </button>
                </div>
                <div className="session-card-body">
                  <div className="session-cwd">
                    <span className="session-label">Project (CWD):</span>{' '}
                    <code>{s.cwd}</code>
                  </div>
                  <div className="session-meta-row">
                    <span>{s.messageCount} messages</span>
                    {dateStr && <span>Modified: {dateStr}</span>}
                    {s.status && <span className="session-status-tag">{s.status}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
