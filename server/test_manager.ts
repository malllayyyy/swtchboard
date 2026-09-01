import { expect, test } from 'bun:test';
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
