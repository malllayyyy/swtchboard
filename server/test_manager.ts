import { expect, spyOn, test } from 'bun:test';
import { AgentManager } from './agent-manager';

test('AgentManager initializes and returns models list', async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();
  const models = manager.getModels();
  expect(Array.isArray(models)).toBe(true);
});

test('AgentManager listAllSessions returns session summaries', async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();
  const sessions = await manager.listAllSessions();
  expect(Array.isArray(sessions)).toBe(true);
});

test('AgentManager getRoster includes subagents in artifacts directory and excludes parked agents from other sessions', async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();

  const mainFile = manager.mainSession.sessionFile!;
  expect(mainFile).toBeDefined();
  const artifactDir = mainFile.slice(0, -'.jsonl'.length);

  // Register a parked subagent for current session in artifacts dir
  const currentSubFile = `${artifactDir}/SubAgent1.jsonl`;
  manager.registry.register({
    id: 'SubAgent1',
    displayName: 'Sub Agent 1',
    kind: 'task',
    status: 'parked',
    sessionFile: currentSubFile,
  });

  // Register a parked subagent for a different session
  manager.registry.register({
    id: 'OtherSubAgent',
    displayName: 'Other Sub Agent',
    kind: 'task',
    status: 'parked',
    sessionFile: 'C:/other/path/session/OtherSubAgent.jsonl',
  });

  try {
    const roster = manager.getRoster();
    const ids = roster.map((r) => r.id);
    expect(ids).toContain('Main');
    expect(ids).toContain('SubAgent1');
    expect(ids).not.toContain('OtherSubAgent');
    const mainItem = roster.find((r) => r.id === 'Main');
    expect(typeof mainItem?.lastActivity).toBe('number');
  } finally {
    manager.registry.unregister('SubAgent1');
    manager.registry.unregister('OtherSubAgent');
  }
});

test('switchToSession preserves mainSession on failure', async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();
  const initialSession = manager.mainSession;
  expect(initialSession).toBeDefined();
  expect(manager.registry.get('Main')).toBeDefined();

  // Attempt switching with a directory path as session file, causing SessionManager.open or loadSessionFile to throw
  await expect(manager.switchToSession(process.cwd(), process.cwd())).rejects.toThrow();

  // mainSession and registry entry for Main should be intact
  expect(manager.mainSession).toBe(initialSession);
  expect(manager.registry.get('Main')?.session).toBe(initialSession);
});
test('switchToSession repairs registry Main entry if createAgentSession throws after SessionManager.open succeeds', async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();
  const initialSession = manager.mainSession;
  expect(initialSession).toBeDefined();
  expect(manager.registry.get('Main')?.session).toBe(initialSession);

  const SessionManagerModule = await import('@oh-my-pi/pi-coding-agent');
  const openSpy = spyOn(SessionManagerModule.SessionManager, 'open').mockImplementation(async () => {
    return {} as unknown as SessionManagerModule.SessionManager;
  });

  const createSpy = spyOn(SessionManagerModule, 'createAgentSession').mockImplementation(async () => {
    // Simulate SDK internal step corrupting registry Main entry before failing (unregistering or setting fake session)
    manager.registry.register({
      id: 'Main',
      displayName: 'Main',
      kind: 'main',
      session: {} as unknown as SessionManagerModule.AgentSession,
    });
    throw new Error('Extension init failure');
  });

  try {
    await expect(manager.switchToSession('some-path.jsonl', process.cwd())).rejects.toThrow('Extension init failure');

    // Verify mainSession is unchanged and registry entry for Main was repaired to point at initialSession
    expect(manager.mainSession).toBe(initialSession);
    expect(manager.registry.get('Main')?.session).toBe(initialSession);
  } finally {
    openSpy.mockRestore();
    createSpy.mockRestore();
  }
});
test('AgentManager startRosterRefresh clears previous timer when called twice', async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();

  const firstTimer = (manager as any).rosterRefreshTimer;
  expect(firstTimer).toBeDefined();

  const clearIntervalSpy = spyOn(globalThis, 'clearInterval');
  try {
    (manager as any).startRosterRefresh();
    const secondTimer = (manager as any).rosterRefreshTimer;
    expect(secondTimer).toBeDefined();
    expect(secondTimer).not.toBe(firstTimer);
    expect(clearIntervalSpy).toHaveBeenCalledWith(firstTimer);
  } finally {
    clearIntervalSpy.mockRestore();
    if ((manager as any).rosterRefreshTimer) {
      clearInterval((manager as any).rosterRefreshTimer);
    }
  }
});
