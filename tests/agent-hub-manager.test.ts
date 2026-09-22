import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerManager } from "../extensions/agent-hub/worker-manager.ts";
import type { HubConfig, WorkerRequest } from "../extensions/agent-hub/types.ts";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-pi-rpc.mjs");
const config: HubConfig = {
  version: 1,
  maxConcurrent: 2,
  maxQueued: 8,
  startupTimeoutMs: 1_000,
  rpcTimeoutMs: 1_000,
  taskTimeoutMs: 2_000,
  cancelGraceMs: 200,
  roles: {},
  agentRoles: {},
};

function request(background = false): WorkerRequest {
  return {
    agent: { name: "reader", description: "read", tools: ["read", "grep"], systemPrompt: "read only", source: "user", filePath: "/tmp/reader.md" },
    task: "inspect",
    cwd: process.cwd(),
    ownerId: "owner-1",
    background,
  };
}

function setup(mode = "success", overrides: Partial<HubConfig> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-hub-test-"));
  const completed: string[] = [];
  const manager = new WorkerManager({
    config: { ...config, ...overrides },
    artifactRoot: root,
    rpcInvocation: { command: process.execPath, args: [fixture] },
    rpcEnv: { FAKE_RPC_MODE: mode },
    onCompleted: (worker) => completed.push(`${worker.id}:${worker.status}`),
    onUiRequest: async () => ({ confirmed: false }),
  });
  return { manager, root, completed };
}

test("worker completes only after agent_settled and persists bounded metadata", async () => {
  const { manager, root, completed } = setup();
  const worker = manager.submit(request());
  await manager.wait([worker.id], "owner-1", 2_000);
  const result = manager.get(worker.id, "owner-1")!;
  assert.equal(result.status, "completed");
  assert.equal(result.output, "ok\u2028still-one-record");
  assert.equal(result.usage.input, 10);
  assert.equal(completed.length, 1);
  assert.ok(result.artifactPath && fs.existsSync(result.artifactPath));
  await manager.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});

test("running worker can be cancelled without affecting ownership", async () => {
  const { manager, root } = setup("slow");
  const worker = manager.submit(request(true));
  for (let i = 0; i < 100 && worker.status !== "running"; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(worker.status, "running");
  await assert.rejects(manager.cancel(worker.id, "other-owner"), /Unknown worker/);
  await manager.cancel(worker.id, "owner-1");
  assert.equal(worker.status, "cancelled");
  await manager.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});

test("unsafe agent tools fail closed before spawn", () => {
  const { manager, root } = setup();
  const unsafe = request();
  unsafe.agent.tools = ["read", "bash"];
  assert.throws(() => manager.submit(unsafe), /read-only/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("task timeout is failed, not completed or cancelled", async () => {
  const { manager, root } = setup("slow", { taskTimeoutMs: 60 });
  const worker = manager.submit(request());
  await manager.wait([worker.id], "owner-1", 2_000);
  assert.equal(worker.status, "failed");
  assert.match(worker.error ?? "", /Timed out/);
  await manager.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});
