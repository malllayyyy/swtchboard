import React from 'react';

export interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  toolName?: string;
  arguments?: unknown;
  args?: unknown;
  toolCallId?: string;
  content?: unknown;
  result?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export interface AgentMessage {
  role?: string;
  content?: string | ContentBlock[] | Record<string, unknown>;
  attribution?: unknown;
  timestamp?: string | number;
  [key: string]: unknown;
}

function RenderContentBlock({ block, index }: { block: ContentBlock | unknown; index: number }) {
  if (typeof block === 'string') {
    return <p key={index} className="message-text-paragraph">{block}</p>;
  }

  if (!block || typeof block !== 'object') {
    return <p key={index} className="message-text-paragraph">{String(block)}</p>;
  }

  const blockObj = block as ContentBlock;

  // 1. Thinking block
  if (blockObj.type === 'thinking' || blockObj.thinking !== undefined) {
    const thinkingText = typeof blockObj.thinking === 'string'
      ? blockObj.thinking
      : typeof blockObj.text === 'string'
      ? blockObj.text
      : typeof blockObj.content === 'string'
      ? blockObj.content
      : JSON.stringify(blockObj.content ?? blockObj.thinking ?? '');
    return (
      <details key={index} className="details-box thinking-box">
        <summary className="details-summary thinking-summary">
          <span className="summary-icon">🧠</span>
          <span className="summary-title">Reasoning</span>
        </summary>
        <pre className="details-content code-block">{thinkingText}</pre>
      </details>
    );
  }

  // 2. Tool call block
  if (blockObj.type === 'toolCall' || blockObj.type === 'tool_call' || blockObj.arguments !== undefined || blockObj.args !== undefined) {
    const toolName = blockObj.name || blockObj.toolName || 'tool';
    const toolArgs = blockObj.arguments ?? blockObj.args ?? blockObj.content ?? {};
    const formattedArgs = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs, null, 2);
    return (
      <details key={index} className="details-box tool-call-box">
        <summary className="details-summary tool-summary">
          <span className="tool-chip">🔧 {toolName}</span>
        </summary>
        <pre className="details-content code-block">{formattedArgs}</pre>
      </details>
    );
  }

  // 3. Tool result block
  if (blockObj.type === 'toolResult' || blockObj.type === 'tool_result' || blockObj.result !== undefined) {
    const toolName = blockObj.name || blockObj.toolName || 'Result';
    const resData = blockObj.result ?? blockObj.content ?? blockObj;
    const formattedResult = typeof resData === 'string' ? resData : JSON.stringify(resData, null, 2);
    return (
      <details key={index} className="details-box tool-result-box">
        <summary className="details-summary tool-result-summary">
          <span className="tool-chip tool-result-chip">📋 Result: {toolName}</span>
        </summary>
        <pre className="details-content code-block">{formattedResult}</pre>
      </details>
    );
  }

  // 4. Text block
  if (blockObj.type === 'text' || blockObj.text !== undefined || typeof blockObj.content === 'string') {
    const textContent = blockObj.text ?? blockObj.content ?? '';
    return (
      <div key={index} className="message-text-paragraph">
        {typeof textContent === 'string' ? textContent : JSON.stringify(textContent)}
      </div>
    );
  }

  // Generic fallback block
  return (
    <details key={index} className="details-box generic-box">
      <summary className="details-summary generic-summary">
        <span>📦 Data Block ({blockObj.type || 'unknown'})</span>
      </summary>
      <pre className="details-content code-block">{JSON.stringify(blockObj, null, 2)}</pre>
    </details>
  );
}

export function MessageView({ message }: { message: AgentMessage }) {
  const role = (message.role || 'assistant').toLowerCase();
  const isUser = role === 'user';
  const isTool = role === 'toolresult' || role === 'tool';
  const content = message.content;

  const roleDisplay = isUser ? 'User' : isTool ? 'Tool Result' : (role.charAt(0).toUpperCase() + role.slice(1));

  return (
    <div className={`message-row ${isUser ? 'user-row' : isTool ? 'tool-row' : 'assistant-row'}`}>
      <div className={`message-bubble ${isUser ? 'user-bubble' : isTool ? 'tool-bubble' : 'assistant-bubble'}`}>
        <div className="message-meta">
          <span className="message-role-tag">{roleDisplay}</span>
          {message.timestamp && (
            <span className="message-timestamp">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
        <div className="message-content-wrapper">
          {typeof content === 'string' ? (
            <div className="message-text-paragraph">{content}</div>
          ) : Array.isArray(content) ? (
            content.map((block, i) => <RenderContentBlock key={i} block={block} index={i} />)
          ) : content && typeof content === 'object' ? (
            <details className="details-box generic-box">
              <summary className="details-summary generic-summary">Payload</summary>
              <pre className="details-content code-block">{JSON.stringify(content, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
