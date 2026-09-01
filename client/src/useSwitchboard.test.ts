import { test, expect, vi } from "vitest";
import { useSwitchboard } from "./useSwitchboard.ts";
import { useSyncExternalStore } from "react";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  readyState = 1;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {}
  send() {}
}

vi.stubGlobal("WebSocket", MockWebSocket);

test("useSwitchboard hook file exists", async () => {
  const hook = await import("./useSwitchboard.ts");
  expect(hook.useSwitchboard).toBeDefined();
});

test("MockWebSocket captures instances", () => {
  const ws = new WebSocket("ws://127.0.0.1:4000");
  expect(MockWebSocket.instances.length).toBeGreaterThan(0);
});
