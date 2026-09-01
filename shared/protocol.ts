export interface ModelInfo { id: string; provider: string; }
export interface AgentRosterItem {
  id: string; displayName: string; status: string;
  model?: string; cost?: number; tokens?: number; activity?: string;
}

export interface SessionSummary {
  path: string;
  id: string;
  cwd: string;
  title?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  status?: string;
}

export type ClientMessage =
  | { type: 'prompt'; target: string; text: string }
  | { type: 'set_model'; target: string; provider: string; modelId: string }
  | { type: 'spawn'; agent: string; task: string; model?: string }
  | { type: 'list_sessions' }
  | { type: 'switch_session'; path: string; cwd: string };

export type ServerMessage =
  | { type: 'roster'; roster: AgentRosterItem[] }
  | { type: 'models'; models: ModelInfo[] }
  | { type: 'session_event'; target: string; event: any }
  | { type: 'session_messages'; target: string; messages: any[] }
  | { type: 'error'; message: string }
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'session_switched'; cwd: string; path: string };
