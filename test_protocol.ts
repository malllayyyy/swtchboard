import { test, expect } from "bun:test";
import type { ClientMessage } from "./shared/protocol.ts";

test("protocol types exist", () => {
  const msg: ClientMessage = { type: "prompt", target: "main", text: "hello" };
  expect(msg.type).toBe("prompt");
});
