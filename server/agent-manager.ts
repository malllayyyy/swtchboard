import EventEmitter from 'events';
import { dirname } from 'path';
import {
  AgentRegistry,
  AgentSession,
  createAgentSession,
  SessionManager,
} from '@oh-my-pi/pi-coding-agent';
import type {
  AgentRosterItem,
  ModelInfo,
  SessionSummary,
} from '../shared/protocol';

export class AgentManager extends EventEmitter {
  public registry = AgentRegistry.global();
  public mainSession!: AgentSession;
  private subscribedSessions = new WeakSet<AgentSession>();

  constructor(public cwd: string) {
    super();
  }

  async init(): Promise<void> {
    let sessionManager: SessionManager;
    try {
      sessionManager = await SessionManager.continueRecent(this.cwd);
    } catch {
      sessionManager = SessionManager.create(this.cwd);
    }

    const { session } = await createAgentSession({
      cwd: this.cwd,
      sessionManager,
    });
    this.mainSession = session;

    this.registry.onChange(() => {
      this.emit('roster_update', this.getRoster());
      this.subscribeToNewSessions();
    });
    this.subscribeToNewSessions();
  }

  private subscribeToNewSessions(): void {
    for (const ref of this.registry.list()) {
      if (ref.session && !this.subscribedSessions.has(ref.session)) {
        this.subscribedSessions.add(ref.session);
        const agentId = ref.id;
        ref.session.subscribe((event) => {
          this.emit('session_event', agentId, event);
          this.emit('roster_update', this.getRoster());
        });
      }
    }
  }

  getModels(): ModelInfo[] {
    return this.mainSession.modelRegistry.getAvailable().map((m) => ({
      id: m.id,
      provider: m.provider,
    }));
  }

  getRoster(): AgentRosterItem[] {
    const mainDir = this.mainSession?.sessionFile
      ? dirname(this.mainSession.sessionFile)
      : null;

    const list = this.registry.list();
    const filtered = mainDir
      ? list.filter(
          (ref) =>
            ref.id === 'Main' ||
            (ref.sessionFile && mainDir && dirname(ref.sessionFile) === mainDir)
        )
      : list;

    return filtered.map((ref) => ({
      id: ref.id,
      displayName: ref.displayName,
      status: ref.status,
      model: ref.history?.resolvedModel || ref.session?.model?.id,
      cost: ref.history?.metrics?.cost,
      tokens: ref.history?.metrics?.tokens,
      activity: ref.activity,
    }));
  }

  async listAllSessions(): Promise<SessionSummary[]> {
    const list = await SessionManager.listAll();
    const summaries: SessionSummary[] = list.map((info) => ({
      path: info.path,
      id: info.id,
      cwd: info.cwd,
      title: info.title,
      created:
        typeof info.created === 'string'
          ? info.created
          : info.created?.toISOString?.() ?? String(info.created),
      modified:
        typeof info.modified === 'string'
          ? info.modified
          : info.modified?.toISOString?.() ?? String(info.modified),
      messageCount: info.messageCount,
      firstMessage: info.firstMessage,
      status: info.status,
    }));

    summaries.sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );
    return summaries;
  }

  async switchToSession(path: string, cwd: string): Promise<void> {
    if (this.mainSession) {
      await this.mainSession.dispose();
    }
    this.registry.unregister('Main');

    const sessionManager = await SessionManager.open(path, undefined, undefined, {
      initialCwd: cwd,
    });

    const { session } = await createAgentSession({
      cwd,
      sessionManager,
    });

    this.mainSession = session;
    this.cwd = cwd;

    this.subscribeToNewSessions();
    this.emit('session_switched', { cwd, path });
  }

  getSession(id: string): AgentSession | null {
    return this.registry.get(id)?.session ?? null;
  }
}
