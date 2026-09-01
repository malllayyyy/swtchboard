import { useEffect, useState, useRef, useCallback } from 'react';
import type { ServerMessage, ClientMessage, AgentRosterItem, ModelInfo } from '../../shared/protocol.ts';

export function useSwitchboard() {
  const [roster, setRoster] = useState<AgentRosterItem[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [messages, setMessages] = useState<Record<string, any[]>>({});
  const [errors, setErrors] = useState<string[]>([]);
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
        setMessages(prev => ({
          ...prev,
          [msg.target]: [...(prev[msg.target] || []), { isEvent: true, data: msg.event }]
        }));
      }
      if (msg.type === 'error') {
        setErrors(prev => [...prev, msg.message]);
      }
    };
    return () => socket.close();
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  return { roster, models, messages, errors, clearErrors, connected, send };
}
