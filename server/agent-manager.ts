import EventEmitter from 'events';
import {
  AgentRegistry,
  AgentSession,
  createAgentSession,
  SessionManager,
} from '@oh-my-pi/pi-coding-agent';
import type { AgentRosterItem, ModelInfo } from '../shared/protocol';

export class AgentManager extends EventEmitter {
  public registry = new AgentRegistry();
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
      agentRegistry: this.registry,
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
    return this.registry.list().map((ref) => ({
      id: ref.id,
      displayName: ref.displayName,
      status: ref.status,
      model: ref.history?.resolvedModel || ref.session?.model?.id,
      cost: ref.history?.metrics?.cost,
      tokens: ref.history?.metrics?.tokens,
      activity: ref.activity,
    }));
  }

  getSession(id: string): AgentSession | null {
    return this.registry.get(id)?.session ?? null;
  }
}
