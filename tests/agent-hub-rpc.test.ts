import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RpcProcess } from "../extensions/agent-hub/rpc-client.ts";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-pi-rpc.mjs");

function client(mode = "success", handlers: Record<string, unknown> = {}) {
  return new RpcProcess({
    cwd: process.cwd(),
    args: [],
    env: { FAKE_RPC_MODE: mode },
    invocation: { command: process.execPath, args: [fixture] },
    requestTimeoutMs: 1_000,
    startupTimeoutMs: 1_000,
    ...handlers,
  });
}

test("strict JSONL keeps U+2028 inside one message and settles", async () => {
  const events: Array<Record<string, unknown>> = [];
  const rpc = client("success", { onEvent: (event: Record<string, unknown>) => events.push(event) });
  await rpc.start();
  await rpc.prompt("test");
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("settle timeout")), 1_000);
    const check = () => {
      if (events.some((event) => event.type === "agent_settled")) {
        clearTimeout(timeout);
        resolve();
      } else setTimeout(check, 10);
    };
    check();
  });
  const message = events.find((event) => event.type === "message_end")?.message as { content: Array<{ text: string }> };
  assert.equal(message.content[0].text, "ok\u2028still-one-record");
  await rpc.terminate(200);
});

test("invalid JSON becomes a protocol error", async () => {
  const events: Array<Record<string, unknown>> = [];
  const rpc = client("invalid-json", { onEvent: (event: Record<string, unknown>) => events.push(event) });
  await rpc.start();
  await rpc.prompt("test");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(events.some((event) => event.type === "agent_hub_protocol_error"));
  await rpc.terminate(200);
});

test("UI confirmation is bridged explicitly", async () => {
  let requestMethod = "";
  const rpc = client("approval", {
    onUiRequest: async (request: { method: string }) => {
      requestMethod = request.method;
      return { confirmed: false };
    },
  });
  await rpc.start();
  await rpc.prompt("test");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(requestMethod, "confirm");
  await rpc.terminate(200);
});

test("request timeout is bounded", async () => {
  const rpc = client("slow");
  await rpc.start();
  await assert.rejects(rpc.request("unknown", {}, 30), /timed out/);
  await rpc.terminate(200);
});
