import { expect, test } from 'bun:test';
import { AgentManager } from './agent-manager';

test('AgentManager initializes and returns models list', async () => {
  const manager = new AgentManager(process.cwd());
  await manager.init();
  const models = manager.getModels();
  expect(Array.isArray(models)).toBe(true);
});
