import { test, expect } from "vitest";
import { SessionBrowser } from "./SessionBrowser.tsx";

test("SessionBrowser component exists and exports expected symbol", () => {
  expect(SessionBrowser).toBeDefined();
  expect(typeof SessionBrowser).toBe("function");
});

test("SessionBrowser handles props contract", () => {
  const dummySessions = [
    {
      id: "sess-1",
      path: "C:/test/sess1.json",
      cwd: "C:/test/proj1",
      title: "Test Project 1",
      created: "2026-09-01T10:00:00Z",
      modified: "2026-09-02T10:00:00Z",
      messageCount: 5,
      firstMessage: "Hello",
      status: "running"
    }
  ];
  let selected = false;
  let closed = false;

  const elem = SessionBrowser({
    sessions: dummySessions,
    onSelectSession: () => { selected = true; },
    onClose: () => { closed = true; }
  });

  expect(elem).toBeDefined();
  expect(elem.type).toBe("div");
});
