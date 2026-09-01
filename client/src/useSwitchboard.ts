import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { ServerMessage, ClientMessage, AgentRosterItem, ModelInfo } from '../../shared/protocol.ts';
import type { AgentMessage, ContentBlock } from './MessageView.tsx';

export interface InProgressMessage {
  role: string;
  content: ContentBlock[];
}

export function useSwitchboard() {
  const [roster, setRoster] = useState<AgentRosterItem[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [messages, setMessages] = useState<Record<string, AgentMessage[]>>({});
  const [inProgressMessages, setInProgressMessages] = useState<Record<string, InProgressMessage>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const inProgressRef = useRef<Record<string, InProgressMessage>>({});
  useEffect(() => {
    const socket = new WebSocket('ws://127.0.0.1:4000');
    ws.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);

    socket.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as ServerMessage;
      if (msg.type === 'roster') setRoster(msg.roster);
      if (msg.type === 'models') setModels(msg.models);
      if (msg.type === 'session_messages') {
        const target = msg.target;
        const loadedMessages = (msg.messages || []) as AgentMessage[];
        setMessages(prev => ({ ...prev, [target]: loadedMessages }));
        delete inProgressRef.current[target];
        setInProgressMessages(prev => {
          if (!prev[target]) return prev;
          const next = { ...prev };
          delete next[target];
          return next;
        });
      }
      if (msg.type === 'session_event') {
        const target = msg.target;
        const event = msg.event as Record<string, unknown> | undefined;
        if (!event || typeof event.type !== 'string') return;

        const eventType = event.type;

        if (eventType === 'message_start') {
          const msgObj = event.message as AgentMessage | undefined;
          const role = typeof event.role === 'string' ? event.role : (msgObj?.role || 'assistant');
          let initialContent: ContentBlock[] = [];
          if (msgObj?.content) {
            if (Array.isArray(msgObj.content)) {
              initialContent = [...msgObj.content] as ContentBlock[];
            } else if (typeof msgObj.content === 'string') {
              initialContent = [{ type: 'text', text: msgObj.content }];
            }
          }
          const newInProg = { role, content: initialContent };
          inProgressRef.current[target] = newInProg;
          setInProgressMessages(prev => ({
            ...prev,
            [target]: newInProg
          }));
        } else if (eventType === 'message_update') {
          const msgObj = event.message as AgentMessage | undefined;
          const assistantEvt = event.assistantMessageEvent as Record<string, unknown> | undefined;

          const current = inProgressRef.current[target] || { role: msgObj?.role || 'assistant', content: [] };
          let newContent = [...current.content];

          if (msgObj && Array.isArray(msgObj.content) && msgObj.content.length > 0) {
            newContent = [...(msgObj.content as ContentBlock[])];
          } else if (assistantEvt) {
            const deltaType = assistantEvt.type;
            const delta = (assistantEvt.delta as string) || (assistantEvt.textDelta as string) || (assistantEvt.thinkingDelta as string) || (assistantEvt.argumentsDelta as string) || '';

            if (deltaType === 'text_delta' || assistantEvt.textDelta || (deltaType === 'text' && delta)) {
              const lastIdx = newContent.length - 1;
              if (lastIdx >= 0 && newContent[lastIdx].type === 'text') {
                newContent[lastIdx] = {
                  ...newContent[lastIdx],
                  text: (newContent[lastIdx].text || '') + delta
                };
              } else {
                newContent.push({ type: 'text', text: delta });
              }
            } else if (deltaType === 'thinking_delta' || assistantEvt.thinkingDelta) {
              const lastIdx = newContent.length - 1;
              if (lastIdx >= 0 && newContent[lastIdx].type === 'thinking') {
                newContent[lastIdx] = {
                  ...newContent[lastIdx],
                  thinking: (newContent[lastIdx].thinking || '') + delta
                };
              } else {
                newContent.push({ type: 'thinking', thinking: delta });
              }
            } else if (deltaType === 'toolcall_delta' || assistantEvt.argumentsDelta) {
              const toolName = (assistantEvt.name as string) || 'tool';
              const lastIdx = newContent.length - 1;
              if (lastIdx >= 0 && newContent[lastIdx].type === 'toolCall') {
                const existingArgs = typeof newContent[lastIdx].arguments === 'string' ? newContent[lastIdx].arguments : '';
                newContent[lastIdx] = {
                  ...newContent[lastIdx],
                  arguments: existingArgs + delta
                };
              } else {
                newContent.push({ type: 'toolCall', name: toolName, arguments: delta });
              }
            }
          }

          const updatedInProg = {
            role: msgObj?.role || current.role,
            content: newContent
          };
          inProgressRef.current[target] = updatedInProg;

          setInProgressMessages(prev => ({
            ...prev,
            [target]: updatedInProg
          }));
        } else if (eventType === 'message_end') {
          const msgObj = event.message as AgentMessage | undefined;
          const inProg = inProgressRef.current[target];
          const finalizedMsg: AgentMessage | null = msgObj || (inProg ? { role: inProg.role, content: inProg.content } : null);

          delete inProgressRef.current[target];

          if (finalizedMsg) {
            setMessages(msgPrev => ({
              ...msgPrev,
              [target]: [...(msgPrev[target] || []), finalizedMsg]
            }));
          }

          setInProgressMessages(prev => {
            if (!prev[target]) return prev;
            const next = { ...prev };
            delete next[target];
            return next;
          });
        } else if (eventType === 'turn_end') {
          const toolResults = Array.isArray(event.toolResults) ? (event.toolResults as AgentMessage[]) : [];
          if (toolResults.length > 0) {
            setMessages(prev => ({
              ...prev,
              [target]: [...(prev[target] || []), ...toolResults]
            }));
          }
        }
        // Ignore noisy events (agent_start, turn_start, tool_execution_*, irc_message, notice, etc.)
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

  const combinedMessages = useMemo(() => {
    const result: Record<string, AgentMessage[]> = {};
    const allTargets = new Set([...Object.keys(messages), ...Object.keys(inProgressMessages)]);
    for (const target of allTargets) {
      const perm = messages[target] || [];
      const inProg = inProgressMessages[target];
      if (inProg && inProg.content.length > 0) {
        result[target] = [...perm, { role: inProg.role, content: inProg.content }];
      } else {
        result[target] = perm;
      }
    }
    return result;
  }, [messages, inProgressMessages]);

  return { roster, models, messages: combinedMessages, errors, clearErrors, connected, send };
}
