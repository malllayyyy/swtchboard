import { test, expect } from "vitest";

test("App file exists", async () => {
  const app = await import("./App.tsx");
  expect(app.App).toBeDefined();
});
