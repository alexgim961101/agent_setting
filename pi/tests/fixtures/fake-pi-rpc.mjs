import readline from "node:readline";

const mode = process.env.FAKE_RPC_MODE || "success";
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

rl.on("line", (line) => {
  const command = JSON.parse(line);
  if (command.type === "extension_ui_response") return;
  if (command.type === "get_state") {
    send({ id: command.id, type: "response", command: "get_state", success: true, data: { isStreaming: false } });
    return;
  }
  if (command.type === "prompt") {
    send({ id: command.id, type: "response", command: "prompt", success: true });
    if (mode === "invalid-json") {
      process.stdout.write("not json\n");
      return;
    }
    send({ type: "agent_start" });
    send({ type: "tool_execution_start", toolCallId: "t1", toolName: "read", args: { path: "x" } });
    if (mode === "approval") {
      send({ type: "extension_ui_request", id: "ui-1", method: "confirm", title: "Confirm", message: "test" });
    }
    if (mode !== "slow") {
      const text = `ok\u2028still-one-record`;
      send({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text }], stopReason: "stop", usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { total: 0.01 } } } });
      send({ type: "agent_end", messages: [], willRetry: false });
      send({ type: "agent_settled" });
    }
    return;
  }
  if (command.type === "steer" || command.type === "clear_queue" || command.type === "abort") {
    send({ id: command.id, type: "response", command: command.type, success: true, data: {} });
    if (command.type === "abort") send({ type: "agent_settled" });
  }
});
