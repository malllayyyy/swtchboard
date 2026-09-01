import { expect, test } from 'bun:test';
import { app, server, wss, manager, startServer } from './index';

test('server module imports without throwing', () => {
  expect(app).toBeDefined();
  expect(server).toBeDefined();
  expect(wss).toBeDefined();
  expect(manager).toBeDefined();
  expect(typeof startServer).toBe('function');
});
