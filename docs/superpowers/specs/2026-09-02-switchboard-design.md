# Switchboard — Design Spec

Date: 2026-09-02
Status: Approved by user, pending implementation plan.

## Problem

OMP's built-in surfaces for watching/steering agents (terminal Agent Hub,
`/collab` web client) are functional but generic and not user-owned. The user
wants their own dashboard, built as a portfolio piece, that:

1. Shows a live roster of all running subagents (status, model, cost, task).
2. Lets the user talk directly to any subagent, bypassing the orchestrator,
   to save the token/latency cost of routing small asks through a full
   orchestrator turn.
3. Lets the user switch the model of the main session or any individual
   subagent from a UI control, without editing `~/.omp/agent/config.yml` and
   restarting.
4. Runs as a real web UI (browser), not the terminal.

## Why the SDK, not RPC mode

`@oh-my-pi/pi-coding-agent` is a published MIT-licensed npm package exposing
`createAgentSession()`, `AgentRegistry`, `AgentSession.subscribe()`,
`AgentSession.setModel()`, and `SessionManager`. RPC mode
(`omp --mode rpc`, JSON-lines over a child process's stdio) exists for
cross-language or cross-process hosts. Since Switchboard's backend also runs
on Bun, embedding the SDK in-process is strictly simpler: no subprocess
lifecycle, no JSONL framing/chunk reassembly, no `switch_session` juggling to
target a specific subagent — every session (main and every subagent) is a
live object in the same process, addressable directly.

Confirmed via `npm view @oh-my-pi/pi-coding-agent license` → MIT. Free to use,
no ToS conflict: Switchboard runs entirely against the user's own OMP install
using the user's own provider API keys.

## Architecture

```
┌─────────────────────────────┐        WebSocket        ┌───────────────────────────┐
│   Frontend (React + Vite)   │ ◄──────────────────────► │  Backend (Bun + Express)  │
│                             │                          │                           │
│  - Main chat pane           │                          │  - one AgentRegistry      │
│  - Roster panel (cards)     │                          │  - main AgentSession      │
│  - Per-subagent chat tabs   │                          │  - subagent AgentSessions │
│  - Model dropdown per tab   │                          │    (same registry, held   │
└─────────────────────────────┘                          │    in a Map<id, session>) │
                                                          └───────────────────────────┘
```

### Backend responsibilities

- On startup: `createAgentSession({ cwd, sessionManager: SessionManager.create(cwd), registry })`
  for the main orchestrator session, using a private `AgentRegistry` (per SDK
  docs: the default process-global registry only admits one `"Main"` per
  generation — Switchboard needs its own).
- Subscribe to the main session's events (`session.subscribe(...)`) and to
  every subagent session's events as they appear. Forward all events over a
  single WebSocket connection to the frontend, tagged with a session id so
  the frontend can route them to the right pane.
- Discover subagents: the SDK's `AgentRegistry` is the same registry the
  built-in `task` tool populates when the main session spawns subagents (the
  same mechanism backing `Alt+A` Agent Hub and the `hub` tool today). Listen
  for registry additions/removals to keep the roster in sync — no polling.
- Expose a small message protocol over the WebSocket:
  - `{ type: "prompt", target: "main"|<subagentId>, text }` → calls
    `.prompt()` or `.steer()` on the right session object directly, in
    memory, no orchestrator involvement for subagent-targeted prompts.
  - `{ type: "set_model", target: "main"|<subagentId>, provider, modelId }`
    → `AgentSession.setModel()` on that session — live, immediate, no config
    file edit.
  - `{ type: "spawn", agent, task, model? }` → sends a short prompt to the
    **main** session asking it to dispatch via its own `task` tool. This is
    the one place Switchboard is honest about not being orchestrator-free:
    the SDK has no lower-level "create a tracked subagent" primitive outside
    a model turn invoking `task`. The UI labels this control accordingly
    ("routes through one orchestrator turn").
- No database. OMP already persists every session to
  `~/.omp/agent/sessions/**/*.jsonl`; Switchboard reads live state from the
  in-memory `AgentSession`/`AgentRegistry` objects and does not duplicate
  storage.
- No auth. Binds to `127.0.0.1` only, single-user, matches the actual use
  case (the user's own machine, their own API keys).

### Frontend responsibilities

- Single page, two-pane layout:
  - Left: main orchestrator chat (transcript + prompt box), mirrors what the
    terminal session shows today.
  - Right: roster of cards, one per subagent, live-updated from
    `subagent_lifecycle`/`subagent_progress`-equivalent events forwarded by
    the backend. Card shows: agent name/type, status, current model, cost,
    tokens, current task string.
- Clicking a card opens a chat tab for that subagent: transcript + prompt
  box + inline model dropdown (populated from the registry's available
  models) that calls `set_model` for that specific session id.
- A "Spawn agent" control (agent-type select + task text + optional model
  override) sends the `spawn` message.

## Data flow example: direct subagent message

1. User clicks the `scout-1` card, opens its chat tab, types "focus only on
   the auth module" and hits send.
2. Frontend sends `{ type: "prompt", target: "scout-1", text: "..." }`.
3. Backend looks up `subagentSessions.get("scout-1")`, calls
   `.steer(text)` (session is mid-turn) or `.prompt(text)` (idle) directly.
4. No call touches the main session. No extra orchestrator turn, no extra
   token spend beyond the subagent's own reply.
5. Backend's existing `subscribe()` listener on that session streams the
   reply back over the same WebSocket, tagged `scout-1`; frontend renders it
   in that tab.

## Error handling

- WebSocket disconnect: frontend shows a reconnect banner; backend keeps
  sessions alive regardless of socket state (sessions are not owned by the
  connection).
- `set_model` failure (bad provider/model, no credentials): surfaced as a
  toast in the relevant tab; session model unchanged (SDK call is atomic:
  either it swaps and reports success or it doesn't schedule a change).
- Subagent process/session ends: registry removal event greys out or removes
  its card; its chat tab remains readable (backend still holds the
  disposed-but-not-yet-GC'd session's transcript) but its input is disabled.
- Backend crash: no data loss — every session already persists to its own
  `.jsonl` file via `SessionManager`; restarting Switchboard re-attaches to
  the same `cwd`'s most recent session via `SessionManager.continueRecent()`.

## Scope cut for MVP (ponytail)

In:
- Main chat, live roster, direct subagent chat, live model switch (main +
  any subagent), spawn-agent control.

Out (explicitly deferred, not silently dropped):
- Auth / multi-user — single machine, single user, `127.0.0.1` only.
- Multi-project switching — one `cwd` passed as a CLI arg at startup.
- Historical analytics/cost charts — only live state, no persisted metrics
  beyond what OMP's own session files already contain.
- Mobile/responsive polish — desktop browser only.
- A genuinely orchestrator-free spawn path — not possible against the
  current SDK surface; documented as a known limitation, not hidden.

## Testing / verification plan

Smoke test only (no unit-test framework needed for an MVP dashboard):

1. Start Switchboard against a real project directory.
2. From the main chat, prompt it to spawn a `scout` subagent.
3. Confirm the scout's card appears in the roster live, with status
   transitioning `running` → `idle`/`completed`.
4. Open the scout's chat tab, send it a direct follow-up message, confirm
   the reply appears without any activity in the main chat pane (proving no
   orchestrator turn occurred).
5. Switch the scout's model via its dropdown mid-conversation, send another
   message, confirm the next reply's transcript entry reflects the new
   model (`model_change` entry / displayed model in the tab header).
