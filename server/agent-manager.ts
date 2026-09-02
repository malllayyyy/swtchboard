import EventEmitter from 'events';
import {
  AgentRegistry,
  AgentSession,
  createAgentSession,
  SessionManager,
} from '@oh-my-pi/pi-coding-agent';
import {
  ensurePersistedRoster,
  isCurrentSessionRosterRef,
} from '@oh-my-pi/pi-coding-agent/registry/persisted-agents';
import type {
  AgentRosterItem,
  ModelInfo,
  SessionSummary,
} from '../shared/protocol';

export class AgentManager extends EventEmitter {
  public registry = AgentRegistry.global();
  public mainSession!: AgentSession;
  private rootSessionFile: string | undefined;
  private subscribedSessions = new WeakSet<AgentSession>();
  private rosterRefreshTimer: ReturnType<typeof setInterval> | undefined;

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

    try {
      this.rootSessionFile =
        (await ensurePersistedRoster(this.registry, this.mainSession.sessionFile)) ??
        this.mainSession.sessionFile ??
        undefined;
    } catch (err) {
      console.warn('Failed to hydrate persisted subagent roster:', err);
      this.rootSessionFile = this.mainSession.sessionFile ?? undefined;
    }

    this.registry.onChange(() => {
      this.emit('roster_update', this.getRoster());
      this.subscribeToNewSessions();
    });
    this.subscribeToNewSessions();
    this.startRosterRefresh();
  }

  private startRosterRefresh(): void {
    if (this.rosterRefreshTimer) {
      clearInterval(this.rosterRefreshTimer);
    }
    this.rosterRefreshTimer = setInterval(async () => {
      try {
        await ensurePersistedRoster(this.registry, this.mainSession.sessionFile);
        this.subscribeToNewSessions();
        this.emit('roster_update', this.getRoster());
      } catch (err) {
        console.warn('Periodic roster refresh failed:', err);
      }
    }, 12000);
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
    return this.registry
      .list()
      .filter((ref) => isCurrentSessionRosterRef(ref, this.rootSessionFile))
      .map((ref) => ({
        id: ref.id,
        displayName: ref.displayName,
        status: ref.status,
        model: ref.history?.resolvedModel || ref.session?.model?.id,
        cost: ref.history?.metrics?.cost,
        tokens: ref.history?.metrics?.tokens,
        activity: ref.activity,
        lastActivity: ref.lastActivity,
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
    const oldSession = this.mainSession;
    const oldMainRef = this.registry.get('Main');

    const sessionManager = await SessionManager.open(path, undefined, undefined, {
      initialCwd: cwd,
    });

    let session: AgentSession;
    try {
      const res = await createAgentSession({
        cwd,
        sessionManager,
      });
      session = res.session;
    } catch (err) {
      if (this.registry.get('Main')?.session !== this.mainSession) {
        this.registry.register({
          id: 'Main',
          displayName: this.registry.get('Main')?.displayName ?? 'Main',
          kind: 'main',
          session: this.mainSession,
          sessionFile: this.mainSession.sessionFile ?? null,
        });
      }
      throw err;
    }

    if (oldSession) {
      await oldSession.dispose();
    }
    if (oldMainRef) {
      this.registry.unregister('Main', oldMainRef);
    }

    this.mainSession = session;
    this.cwd = cwd;

    try {
      this.rootSessionFile =
        (await ensurePersistedRoster(this.registry, session.sessionFile)) ??
        session.sessionFile ??
        undefined;
    } catch (err) {
      console.warn('Failed to hydrate persisted subagent roster:', err);
      this.rootSessionFile = session.sessionFile ?? undefined;
    }

    this.subscribeToNewSessions();
    this.startRosterRefresh();
    this.emit('session_switched', { cwd, path });
  }

  getSession(id: string): AgentSession | null {
    return this.registry.get(id)?.session ?? null;
  }
}
