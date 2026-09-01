import { test, expect } from "vitest";

test("useSwitchboard hook file exists", async () => {
  const hook = await import("./useSwitchboard.ts");
  expect(hook.useSwitchboard).toBeDefined();
});
