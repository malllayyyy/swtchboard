# Switchboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Switchboard, a custom web dashboard for OMP that enables orchestrator chat, live subagent roster, direct subagent steering, and live model switching over a local UI.

**Architecture:** Single-process Node/Bun app. The backend (Bun+Express+ws) creates and owns an `AgentRegistry` and the main `AgentSession`. It listens for registry changes and session events, multiplexing them over a single WebSocket to the React frontend. The frontend is a Vite SPA that renders a split pane layout without a database, relying entirely on OMP's built-in session persistence.

**Tech Stack:** Bun, Express, ws, React, Vite, TypeScript, @oh-my-pi/pi-coding-agent

**Spec:** docs/superpowers/specs/2026-09-02-switchboard-design.md

## Global Constraints

- Project root: C:/switchboard
- Runtime: Bun
- Backend: Bun + Express + `ws` (NOT Socket.IO) + `@oh-my-pi/pi-coding-agent`
- Frontend: React + Vite + TypeScript
- No database. No auth. Binds to 127.0.0.1 only.

---

### Task 1: Shared Protocol & Backend Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `shared/protocol.ts`

**Interfaces:**
- Produces: `shared/protocol.ts` containing exact WS message types.

- [ ] **Step 1: Write the failing test**

```typescript
// test_protocol.ts
import { test, expect } from "bun:test";
import type { ClientMessage } from "./shared/protocol.ts";

test("protocol types exist", () => {
  const msg: ClientMessage = { type: "prompt", target: "main", text: "hello" };
  expect(msg.type).toBe("prompt");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test_protocol.ts`
Expected: FAIL (Cannot find module './shared/protocol.ts')

- [ ] **Step 3: Write minimal implementation**

```json
// package.json
{
  "name": "switchboard",
  "type": "module",
  "dependencies": {
    "@oh-my-pi/pi-coding-agent": "latest",
    "express": "^4.21.0",
    "ws": "^8.18.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.12",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.3",
    "@vitejs/plugin-react": "^4.3.1"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["server", "client/src", "shared"]
}
```

```typescript
// shared/protocol.ts
export interface ModelInfo { id: string; provider: string; }
export interface AgentRosterItem {
  id: string; displayName: string; status: string;
  model?: string; cost?: number; tokens?: number; activity?: string;
}

export type ClientMessage =
  | { type: 'prompt'; target: string; text: string }
  | { type: 'set_model'; target: string; provider: string; modelId: string }
  | { type: 'spawn'; agent: string; task: string; model?: string };

export type ServerMessage =
  | { type: 'roster'; roster: AgentRosterItem[] }
  | { type: 'models'; models: ModelInfo[] }
  | { type: 'session_event'; target: string; event: any }
  | { type: 'session_messages'; target: string; messages: any[] }
  | { type: 'error'; message: string };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun install && bun test test_protocol.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json shared/protocol.ts test_protocol.ts bun.lockb
git commit -m "chore: setup shared protocol and dependencies"
```

### Task 2: OMP Integration (Agent Manager)

**Files:**
- Create: `server/agent-manager.ts`
- Create: `server/test_manager.ts`

**Interfaces:**
- Consumes: `@oh-my-pi/pi-coding-agent` SDK (`AgentRegistry`, `SessionManager`, `createAgentSession`)
- Produces: `AgentManager` class with `init()`, `getRoster()`, `getModels()`, and a single `EventEmitter` for WS broadcasting.

- [ ] **Step 1: Write the failing test**

```typescript
// server/test_manager.ts
import { test, expect } from "bun:test";
import { AgentManager } from "./agent-manager.ts";

test("AgentManager initializes and lists models", async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();
  const models = manager.getModels();
  expect(Array.isArray(models)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test server/test_manager.ts`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/agent-manager.ts
import { AgentRegistry, SessionManager, createAgentSession, AgentSession } from '@oh-my-pi/pi-coding-agent';
import { EventEmitter } from 'node:events';
import type { AgentRosterItem, ModelInfo } from '../shared/protocol.ts';

export class AgentManager extends EventEmitter {
  public registry = new AgentRegistry();
  public mainSession!: AgentSession;
  private subscribedSessions = new Set<string>();

  constructor(private cwd: string) { super(); }

  async init() {
    let sessionManager: SessionManager;
    try {
      sessionManager = await SessionManager.continueRecent(this.cwd);
    } catch {
      sessionManager = SessionManager.create(this.cwd);
    }
    
    const { session } = await createAgentSession({ 
      cwd: this.cwd, 
      sessionManager, 
      agentRegistry: this.registry 
    });
    this.mainSession = session;

    this.registry.onChange(() => {
      this.emit('roster_update', this.getRoster());
      this.subscribeToNewSessions();
    });
    this.subscribeToNewSessions();
  }

  private subscribeToNewSessions() {
    for (const ref of this.registry.list()) {
      if (ref.session && !this.subscribedSessions.has(ref.id)) {
        this.subscribedSessions.add(ref.id);
        ref.session.subscribe((event) => {
          this.emit('session_event', ref.id, event);
          this.emit('roster_update', this.getRoster());
        });
      }
    }
  }

  getModels(): ModelInfo[] {
    return this.mainSession.modelRegistry.getAvailable().map(m => ({
      id: m.id,
      provider: m.provider
    }));
  }

  getRoster(): AgentRosterItem[] {
    return this.registry.list().map(ref => ({
      id: ref.id,
      displayName: ref.displayName,
      status: ref.status,
      model: ref.history?.resolvedModel || ref.session?.model?.id,
      cost: ref.history?.metrics?.cost,
      tokens: ref.history?.metrics?.tokens,
      activity: ref.activity || ref.history?.activity
    }));
  }
  
  getSession(id: string): AgentSession | null {
    return this.registry.get(id)?.session || null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test server/test_manager.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/agent-manager.ts server/test_manager.ts
git commit -m "feat: agent manager wrapping OMP SDK"
```

### Task 3: WebSocket Bridging Server

**Files:**
- Create: `server/index.ts`
- Create: `server/test_server.ts`

**Interfaces:**
- Consumes: `AgentManager`, `ws`, `express`
- Produces: Running backend on `127.0.0.1:4000` answering to WS protocol.

- [ ] **Step 1: Write the failing test**

```typescript
// server/test_server.ts
import { test, expect } from "bun:test";

test("Server binds and accepts ws connections", async () => {
  // Just checking the file exists and compiles for smoke test
  const server = await import("./index.ts");
  expect(server).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test server/test_server.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/index.ts
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { AgentManager } from './agent-manager.ts';
import type { ClientMessage, ServerMessage } from '../shared/protocol.ts';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const manager = new AgentManager(process.cwd());

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

manager.init().then(() => {
  manager.on('roster_update', (roster) => {
    wss.clients.forEach(c => send(c, { type: 'roster', roster }));
  });
  manager.on('session_event', (target, event) => {
    wss.clients.forEach(c => send(c, { type: 'session_event', target, event }));
  });

  wss.on('connection', (ws) => {
    send(ws, { type: 'models', models: manager.getModels() });
    send(ws, { type: 'roster', roster: manager.getRoster() });
    send(ws, { type: 'session_messages', target: 'Main', messages: manager.mainSession.messages });
    
    // Also send messages for active subagents
    for (const ref of manager.registry.list()) {
      if (ref.id !== 'Main' && ref.session) {
        send(ws, { type: 'session_messages', target: ref.id, messages: ref.session.messages });
      }
    }

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        const session = msg.target === 'Main' || msg.target === 'main' ? manager.mainSession : manager.getSession(msg.target);
        
        if (msg.type === 'prompt' && session) {
          session.prompt(msg.text);
        } else if (msg.type === 'set_model' && session) {
          const model = manager.mainSession.modelRegistry.getAll().find(m => m.id === msg.modelId);
          if (model) session.setModel(model);
        } else if (msg.type === 'spawn') {
          const mOpt = msg.model ? `, model="${msg.model}"` : '';
          manager.mainSession.prompt(`Please spawn a subagent of type "${msg.agent}" to do: "${msg.task}"${mOpt}`);
        }
      } catch (e) {
        send(ws, { type: 'error', message: String(e) });
      }
    });
  });

  server.listen(4000, '127.0.0.1', () => console.log('Backend on 127.0.0.1:4000'));
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test server/test_server.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/test_server.ts
git commit -m "feat: backend express and ws router"
```

### Task 4: Frontend Scaffolding & State

**Files:**
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/useSwitchboard.ts`

**Interfaces:**
- Consumes: WS `127.0.0.1:4000`, `ServerMessage`
- Produces: `useSwitchboard()` hook returning `{ roster, models, messages, send }`

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/useSwitchboard.test.ts
import { test, expect } from "vitest";

test("useSwitchboard hook file exists", async () => {
  const hook = await import("./useSwitchboard.ts");
  expect(hook.useSwitchboard).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/useSwitchboard.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// client/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], server: { port: 3000 } })
```

```html
<!-- client/index.html -->
<!DOCTYPE html>
<html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
```

```typescript
// client/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

```typescript
// client/src/useSwitchboard.ts
import { useEffect, useState, useRef, useCallback } from 'react';
import type { ServerMessage, ClientMessage, AgentRosterItem, ModelInfo } from '../../shared/protocol.ts';

export function useSwitchboard() {
  const [roster, setRoster] = useState<AgentRosterItem[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [messages, setMessages] = useState<Record<string, any[]>>({});
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket('ws://127.0.0.1:4000');
    ws.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMessage;
      if (msg.type === 'roster') setRoster(msg.roster);
      if (msg.type === 'models') setModels(msg.models);
      if (msg.type === 'session_messages') {
        setMessages(prev => ({ ...prev, [msg.target]: msg.messages }));
      }
      if (msg.type === 'session_event') {
        // Very lazy: just append raw events to the transcript for the UI to stringify for now
        setMessages(prev => ({
          ...prev, 
          [msg.target]: [...(prev[msg.target] || []), { isEvent: true, data: msg.event }]
        }));
      }
    };
    return () => socket.close();
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  return { roster, models, messages, connected, send };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/useSwitchboard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/vite.config.ts client/index.html client/src/main.tsx client/src/useSwitchboard.ts client/src/useSwitchboard.test.ts
git commit -m "feat: frontend vite setup and WS hook"
```

### Task 5: Main Orchestrator UI & Subagent Roster

**Files:**
- Create: `client/src/App.tsx`
- Create: `client/src/App.test.tsx`

**Interfaces:**
- Consumes: `useSwitchboard()`
- Produces: The full split-pane UI rendering main chat, roster cards, and the "Spawn agent" form.

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/App.test.tsx
import { test, expect } from "vitest";

test("App file exists", async () => {
  const app = await import("./App.tsx");
  expect(app.App).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/App.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// client/src/App.tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/App.test.tsx
git commit -m "feat: complete split pane UI with model switcher and spawn control"
```

## Self-Review

1. **Spec coverage:** 
   - Shows live roster (Task 2 & 5)
   - Talk directly to subagent bypassing orchestrator (Task 3 routing `target !== 'Main'` direct to `getSession(target)`, UI in Task 5).
   - Switch model live (Task 3 `set_model` handler, UI in Task 5).
   - Runs as web UI (Express/Vite).
   - No DB, reads from `SessionManager` and `AgentRegistry` (Task 2).
2. **Placeholder scan:** None. All steps have code.
3. **Type consistency:** Used `AgentManager`, `ModelInfo`, `AgentRosterItem`, `ClientMessage`, `ServerMessage` consistently across backend and frontend tasks.
4. **API Limits:** Type signatures mapped against `@oh-my-pi/pi-coding-agent` via `.d.ts` inspection (`SessionManager.continueRecent`, `AgentRegistry.global` or `new AgentRegistry()`, `session.modelRegistry`). All method signatures utilized exist and match types observed.

**Plan complete and saved to `C:/switchboard/docs/superpowers/plans/2026-09-02-switchboard-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
