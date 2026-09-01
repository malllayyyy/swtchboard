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

test('AgentManager getRoster filters by main session directory', async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();
  const roster = manager.getRoster();
  expect(Array.isArray(roster)).toBe(true);
});

test('getRoster returns only Main when mainSession.sessionFile is undefined', async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();
  // Mock mainSession without sessionFile
  Object.defineProperty(manager.mainSession, 'sessionFile', {
    value: undefined,
    writable: true,
    configurable: true,
  });
  // Register an extra agent session in global registry
  manager.registry.register({
    id: 'ExtraAgent',
    displayName: 'Extra Agent',
    kind: 'task',
  });
  const roster = manager.getRoster();
  expect(roster.map((r) => r.id)).toEqual(['Main']);
  manager.registry.unregister('ExtraAgent');
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
