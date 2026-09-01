import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentManager } from './agent-manager';
import type { ClientMessage, ServerMessage } from '../shared/protocol';

export const app = express();
export const server = createServer(app);
export const wss = new WebSocketServer({ server });
export const manager = new AgentManager(process.cwd());

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  // Send models
  ws.send(JSON.stringify({ type: 'models', models: manager.getModels() }));

  // Send roster
  ws.send(JSON.stringify({ type: 'roster', roster: manager.getRoster() }));

  // Send session_messages for Main
  if (manager.mainSession) {
    ws.send(
      JSON.stringify({
        type: 'session_messages',
        target: 'Main',
        messages: manager.mainSession.messages || [],
      })
    );
  }

  // Send session_messages for every other registered agent that has a live session
  for (const item of manager.registry.list()) {
    if (item.id !== 'Main' && item.id !== 'main') {
      const session = item.session ?? manager.getSession(item.id);
      if (session) {
        ws.send(
          JSON.stringify({
            type: 'session_messages',
            target: item.id,
            messages: session.messages || [],
          })
        );
      }
    }
  }

  // Handle incoming client messages
  ws.on('message', async (rawMessage) => {
    try {
      const msg = JSON.parse(rawMessage.toString()) as ClientMessage;

      if (msg.type === 'prompt') {
        const session =
          msg.target === 'main' || msg.target === 'Main'
            ? manager.mainSession
            : manager.getSession(msg.target);

        if (!session) {
          throw new Error(`Target session not found: ${msg.target}`);
        }

        if (session.isStreaming) {
          await session.steer(msg.text);
        } else {
          session.prompt(msg.text).catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            ws.send(
              JSON.stringify({
                type: 'error',
                message: errorMessage,
              })
            );
          });
        }
      } else if (msg.type === 'set_model') {
        const session =
          msg.target === 'main' || msg.target === 'Main'
            ? manager.mainSession
            : manager.getSession(msg.target);

        if (!session) {
          throw new Error(`Target session not found: ${msg.target}`);
        }

        const available = manager.mainSession.modelRegistry.getAvailable();
        const model =
          available.find(
            (m) =>
              m.id === msg.modelId &&
              (!msg.provider || m.provider === msg.provider)
          ) ??
          available.find((m) => m.id === msg.modelId);

        if (!model) {
          throw new Error(`Model not found: ${msg.provider}/${msg.modelId}`);
        }

        await session.setModel(model);
      } else if (msg.type === 'spawn') {
        const promptText = msg.model
          ? `Dispatch agent ${msg.agent} using model ${msg.model} to execute task: ${msg.task}`
          : `Dispatch agent ${msg.agent} to execute task: ${msg.task}`;

        if (manager.mainSession.isStreaming) {
          await manager.mainSession.steer(promptText);
        } else {
          manager.mainSession.prompt(promptText).catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            ws.send(
              JSON.stringify({
                type: 'error',
                message: errorMessage,
              })
            );
          });
        }
      } else if (msg.type === 'list_sessions') {
        const sessions = await manager.listAllSessions();
        ws.send(
          JSON.stringify({
            type: 'sessions',
            sessions,
          })
        );
      } else if (msg.type === 'switch_session') {
        await manager.switchToSession(msg.path, msg.cwd);
        broadcast({ type: 'models', models: manager.getModels() });
        broadcast({ type: 'roster', roster: manager.getRoster() });
        broadcast({
          type: 'session_messages',
          target: 'Main',
          messages: manager.mainSession?.messages || [],
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      ws.send(
        JSON.stringify({
          type: 'error',
          message: errorMessage,
        })
      );
    }
  });
});

export async function startServer(port = 4000, host = '127.0.0.1') {
  await manager.init();

  manager.on('roster_update', (roster) => {
    broadcast({ type: 'roster', roster });
  });

  manager.on('session_event', (target, event) => {
    broadcast({ type: 'session_event', target, event });
  });

  manager.on('session_switched', ({ cwd, path }) => {
    broadcast({ type: 'session_switched', cwd, path });
  });

  return new Promise<{ server: typeof server; wss: typeof wss; manager: typeof manager }>((resolve) => {
    server.listen(port, host, () => {
      console.log(`Switchboard server listening on http://${host}:${port}`);
      resolve({ server, wss, manager });
    });
  });
}

if (import.meta.main) {
  startServer();
}
