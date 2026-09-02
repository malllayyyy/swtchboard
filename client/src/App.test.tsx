import { test, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App.tsx";
import * as switchboardModule from "./useSwitchboard.ts";
test("App file exists", async () => {
  expect(App).toBeDefined();
});

test("App roster filtering: active subagents rendered by default, historical hidden behind toggle", () => {
  const dummyRoster = [
    { id: "Main", displayName: "Main Orchestrator", status: "running" },
    { id: "sub-1", displayName: "Active Worker 1", status: "running" },
    { id: "sub-2", displayName: "Active Worker 2", status: "idle" },
    { id: "sub-3", displayName: "Parked Worker 1", status: "parked" },
    { id: "sub-4", displayName: "Aborted Worker 1", status: "aborted" }
  ];

  vi.spyOn(switchboardModule, "useSwitchboard").mockReturnValue({
    connected: true,
    roster: dummyRoster,
    models: [],
    messages: {},
    sessions: [],
    loadingSessions: false,
    listSessions: () => {},
    errors: [],
    clearErrors: () => {},
    send: () => {}
  });

  const html = renderToString(React.createElement(App));
  expect(html).toContain("Active Worker 1");
  expect(html).toContain("Active Worker 2");
  expect(html).toContain("Show history (2)");
  expect(html).not.toContain("Parked Worker 1");
  expect(html).not.toContain("Aborted Worker 1");

  vi.restoreAllMocks();
});

test("App roster filtering: zero active and zero historical shows only Main Orchestrator without toggle", () => {
  const dummyRoster = [
    { id: "Main", displayName: "Main Orchestrator", status: "running" }
  ];

  vi.spyOn(switchboardModule, "useSwitchboard").mockReturnValue({
    connected: true,
    roster: dummyRoster,
    models: [],
    messages: {},
    sessions: [],
    loadingSessions: false,
    listSessions: () => {},
    errors: [],
    clearErrors: () => {},
    send: () => {}
  });

  const html = renderToString(React.createElement(App));
  expect(html).toContain("Main Orchestrator");
  expect(html).not.toContain("Show history");
  expect(html).not.toContain("Hide history");

  vi.restoreAllMocks();
});

test("App roster filtering: zero active but historical agents present shows toggle button", () => {
  const dummyRoster = [
    { id: "Main", displayName: "Main Orchestrator", status: "running" },
    { id: "sub-1", displayName: "Old Parked 1", status: "parked" },
    { id: "sub-2", displayName: "Old Aborted 2", status: "aborted" }
  ];

  vi.spyOn(switchboardModule, "useSwitchboard").mockReturnValue({
    connected: true,
    roster: dummyRoster,
    models: [],
    messages: {},
    sessions: [],
    loadingSessions: false,
    listSessions: () => {},
    errors: [],
    clearErrors: () => {},
    send: () => {}
  });

  const html = renderToString(React.createElement(App));
  expect(html).toContain("Main Orchestrator");
  expect(html).toContain("Show history (2)");
  expect(html).not.toContain("Old Parked 1");
  expect(html).not.toContain("Old Aborted 2");

  vi.restoreAllMocks();
});

test("App roster filtering: case-insensitive status handling", () => {
  const dummyRoster = [
    { id: "Main", displayName: "Main Orchestrator", status: "RUNNING" },
    { id: "sub-1", displayName: "Active Worker Upper", status: "RUNNING" },
    { id: "sub-2", displayName: "Active Worker Mixed", status: "Idle" },
    { id: "sub-3", displayName: "Parked Worker Upper", status: "PARKED" }
  ];

  vi.spyOn(switchboardModule, "useSwitchboard").mockReturnValue({
    connected: true,
    roster: dummyRoster,
    models: [],
    messages: {},
    sessions: [],
    loadingSessions: false,
    listSessions: () => {},
    errors: [],
    clearErrors: () => {},
    send: () => {}
  });

  const html = renderToString(React.createElement(App));
  expect(html).toContain("Active Worker Upper");
  expect(html).toContain("Active Worker Mixed");
  expect(html).toContain("Show history (1)");
  expect(html).not.toContain("Parked Worker Upper");

  vi.restoreAllMocks();
});
test("App roster filtering: parked/aborted agent with recent lastActivity shows in active, old or missing goes to history", () => {
  const now = Date.now();
  const dummyRoster = [
    { id: "Main", displayName: "Main Orchestrator", status: "running" },
    { id: "sub-1", displayName: "Recently Finished Worker", status: "parked", lastActivity: now - 2 * 60 * 1000 },
    { id: "sub-2", displayName: "Old Finished Worker", status: "parked", lastActivity: now - 10 * 60 * 1000 },
    { id: "sub-3", displayName: "No Activity Timestamp Worker", status: "parked" }
  ];

  vi.spyOn(switchboardModule, "useSwitchboard").mockReturnValue({
    connected: true,
    roster: dummyRoster,
    models: [],
    messages: {},
    sessions: [],
    loadingSessions: false,
    listSessions: () => {},
    errors: [],
    clearErrors: () => {},
    send: () => {}
  });

  const html = renderToString(React.createElement(App));
  expect(html).toContain("Recently Finished Worker");
  expect(html).toContain("Show history (2)");
  expect(html).not.toContain("Old Finished Worker");
  expect(html).not.toContain("No Activity Timestamp Worker");

  vi.restoreAllMocks();
});
