import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { HubConfig, HubSnapshot, RpcEvent, RpcInvocation, UiRequest, WorkerRecord, WorkerRequest, WorkerStatus } from "./types.ts";
import { emptyUsage, isTerminal, READ_ONLY_TOOLS } from "./types.ts";
import { RpcProcess } from "./rpc-client.ts";

const MAX_TRANSCRIPT_BYTES = 1024 * 1024;
const MAX_RESULT_BYTES = 50 * 1024;

interface Runtime {
	client?: RpcProcess;
	tempDir?: string;
	timeout?: NodeJS.Timeout;
	waiters: Set<() => void>;
}

export interface WorkerManagerOptions {
	config: HubConfig;
	artifactRoot: string;
	onChanged?: (snapshot: HubSnapshot) => void;
	onCompleted?: (worker: WorkerRecord) => void;
	onUiRequest?: (worker: WorkerRecord, request: UiRequest) => Promise<Record<string, unknown>>;
	/** Test seam; production resolves the currently running Pi executable. */
	rpcInvocation?: RpcInvocation;
	rpcEnv?: NodeJS.ProcessEnv;
}

function textFromMessage(message: unknown): string {
	if (!message || typeof message !== "object") return "";
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.filter((part): part is { type: "text"; text: string } =>
		Boolean(part) && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string",
	).map((part) => part.text).join("\n");
}

function safeSegment(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "unknown";
}

function truncateBytes(value: string, maxBytes: number): string {
	if (Buffer.byteLength(value) <= maxBytes) return value;
	let text = value.slice(0, maxBytes);
	while (Buffer.byteLength(text) > maxBytes) text = text.slice(0, -1);
	return `${text}\n[truncated]`;
}

function effectiveReadOnlyTools(request: WorkerRequest): string[] {
	const requested = request.agent.tools ?? [...READ_ONLY_TOOLS];
	const tools = requested.filter((tool) => READ_ONLY_TOOLS.has(tool));
	if (tools.length === 0) throw new Error(`Agent ${request.agent.name} has no allowed read-only tools`);
	if (request.agent.tools?.some((tool) => !READ_ONLY_TOOLS.has(tool))) {
		throw new Error(`Agent ${request.agent.name} requests unsupported tools. Agent Hub v1 is read-only.`);
	}
	return [...new Set(tools)];
}

export class WorkerManager {
	private readonly workers = new Map<string, WorkerRecord>();
	private readonly runtimes = new Map<string, Runtime>();
	private readonly queue: string[] = [];
	private generation = 0;
	private shuttingDown = false;
	private readonly options: WorkerManagerOptions;

	constructor(options: WorkerManagerOptions) {
		this.options = options;
	}

	snapshot(ownerId?: string): HubSnapshot {
		const workers = [...this.workers.values()].filter((worker) => !ownerId || worker.ownerId === ownerId);
		return {
			workers: workers.map((worker) => ({ ...worker, transcript: [...worker.transcript], _process: undefined })),
			running: workers.filter((worker) => ["starting", "running", "waiting_approval", "cancelling"].includes(worker.status)).length,
			queued: workers.filter((worker) => worker.status === "queued").length,
		};
	}

	get(id: string, ownerId?: string): WorkerRecord | undefined {
		const worker = this.workers.get(id);
		return worker && (!ownerId || worker.ownerId === ownerId) ? worker : undefined;
	}

	submit(request: WorkerRequest): WorkerRecord {
		if (this.shuttingDown) throw new Error("Agent Hub is shutting down");
		if (this.queue.length >= this.options.config.maxQueued) throw new Error("Agent Hub queue is full");
		const tools = effectiveReadOnlyTools(request);
		const worker: WorkerRecord = {
			id: `w-${randomUUID().slice(0, 8)}`,
			generation: this.generation,
			ownerId: request.ownerId,
			agent: request.agent.name,
			agentSource: request.agent.source,
			task: request.task,
			cwd: request.cwd,
			model: request.model,
			thinkingLevel: request.thinkingLevel,
			tools,
			status: "queued",
			createdAt: Date.now(),
			output: "",
			transcript: [],
			stderr: "",
			usage: emptyUsage(),
			step: request.step,
			background: request.background,
		};
		this.workers.set(worker.id, worker);
		this.pendingDefinitions.set(worker.id, request.agent);
		this.runtimes.set(worker.id, { waiters: new Set() });
		this.queue.push(worker.id);
		this.changed();
		this.pump();
		return worker;
	}

	async steer(id: string, ownerId: string, message: string): Promise<void> {
		const worker = this.requireOwned(id, ownerId);
		if (worker.status !== "running") throw new Error(`Worker ${id} is not running`);
		const client = this.runtimes.get(id)?.client;
		if (!client) throw new Error(`Worker ${id} RPC client is unavailable`);
		await client.steer(message);
		worker.lastActivity = "steering queued";
		this.changed();
	}

	async cancel(id: string, ownerId: string): Promise<WorkerRecord> {
		const worker = this.requireOwned(id, ownerId);
		if (isTerminal(worker.status)) return worker;
		if (worker.status === "queued") {
			const index = this.queue.indexOf(id);
			if (index >= 0) this.queue.splice(index, 1);
			this.finish(worker, "cancelled", "Cancelled before start");
			this.pump();
			return worker;
		}
		worker.status = "cancelling";
		this.changed();
		const runtime = this.runtimes.get(id);
		try { await runtime?.client?.clearQueue(); } catch { /* child may already be gone */ }
		try { await runtime?.client?.abort(); } catch { /* continue to process termination */ }
		this.finish(worker, "cancelled", "Cancelled");
		await runtime?.client?.terminate(this.options.config.cancelGraceMs);
		this.cleanupRuntime(worker.id);
		this.pump();
		return worker;
	}

	async wait(ids: string[], ownerId: string, timeoutMs = 30_000): Promise<WorkerRecord[]> {
		const workers = ids.map((id) => this.requireOwned(id, ownerId));
		if (workers.every((worker) => isTerminal(worker.status))) return workers;
		await new Promise<void>((resolve) => {
			let done = false;
			const wake = () => {
				if (done || !workers.every((worker) => isTerminal(worker.status))) return;
				done = true;
				clearTimeout(timer);
				for (const worker of workers) this.runtimes.get(worker.id)?.waiters.delete(wake);
				resolve();
			};
			const timer = setTimeout(() => {
				if (done) return;
				done = true;
				for (const worker of workers) this.runtimes.get(worker.id)?.waiters.delete(wake);
				resolve();
			}, Math.max(1, Math.min(timeoutMs, 60_000)));
			for (const worker of workers) this.runtimes.get(worker.id)?.waiters.add(wake);
		});
		return workers;
	}

	async reset(ownerId?: string): Promise<void> {
		this.generation++;
		const targets = [...this.workers.values()].filter((worker) => !ownerId || worker.ownerId === ownerId);
		await Promise.allSettled(targets.filter((worker) => !isTerminal(worker.status)).map((worker) => this.cancel(worker.id, worker.ownerId)));
	}

	async shutdown(): Promise<void> {
		this.shuttingDown = true;
		await this.reset();
	}

	private pump(): void {
		if (this.shuttingDown) return;
		const active = [...this.workers.values()].filter((worker) => ["starting", "running", "waiting_approval", "cancelling"].includes(worker.status)).length;
		for (let slots = this.options.config.maxConcurrent - active; slots > 0 && this.queue.length > 0; slots--) {
			const id = this.queue.shift();
			const worker = id ? this.workers.get(id) : undefined;
			if (worker?.status === "queued") void this.start(worker);
		}
	}

	private async start(worker: WorkerRecord): Promise<void> {
		const runtime = this.runtimes.get(worker.id)!;
		worker.status = "starting";
		worker.startedAt = Date.now();
		worker.lastActivity = "starting RPC child";
		this.changed();
		try {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-hub-"));
			runtime.tempDir = tempDir;
			const promptPath = path.join(tempDir, "system.md");
			const definition = this.definitionFor(worker);
			fs.writeFileSync(promptPath, definition.systemPrompt, { encoding: "utf8", mode: 0o600 });
			const args = ["--mode", "rpc", "--no-session", "--tools", worker.tools.join(","), "--append-system-prompt", promptPath];
			if (worker.model) args.push("--model", worker.model);
			if (worker.thinkingLevel) args.push("--thinking", worker.thinkingLevel);
			const client = new RpcProcess({
				cwd: worker.cwd,
				args,
				env: { PI_AGENT_HUB_CHILD: "1", ...this.options.rpcEnv },
				invocation: this.options.rpcInvocation,
				requestTimeoutMs: this.options.config.rpcTimeoutMs,
				startupTimeoutMs: this.options.config.startupTimeoutMs,
				onEvent: (event) => this.handleEvent(worker, event),
				onExit: (code, signal) => this.handleExit(worker, code, signal),
				onUiRequest: async (request) => {
					if (!["select", "confirm", "input", "editor"].includes(request.method)) return {};
					if (!this.options.onUiRequest) return { cancelled: true };
					const before = worker.status;
					if (!isTerminal(before)) worker.status = "waiting_approval";
					this.changed();
					try { return await this.options.onUiRequest(worker, request); }
					finally {
						if (worker.status === "waiting_approval") worker.status = "running";
						this.changed();
					}
				},
			});
			runtime.client = client;
			worker._process = client.process;
			await client.start();
			if (worker.generation !== this.generation) throw new Error("Parent session changed during worker startup");
			worker.status = "running";
			worker.lastActivity = "prompt accepted";
			this.changed();
			runtime.timeout = setTimeout(() => void this.timeout(worker), this.options.config.taskTimeoutMs);
			await client.prompt(`Task: ${worker.task}`);
		} catch (error) {
			if (!isTerminal(worker.status)) this.finish(worker, "failed", String(error));
			await runtime.client?.terminate(this.options.config.cancelGraceMs).catch(() => undefined);
			this.cleanupRuntime(worker.id);
			this.pump();
		}
	}

	private definitionFor(worker: WorkerRecord) {
		return this.pendingDefinitions.get(worker.id)!;
	}

	private readonly pendingDefinitions = new Map<string, WorkerRequest["agent"]>();

	private handleEvent(worker: WorkerRecord, event: RpcEvent): void {
		if (isTerminal(worker.status) || worker.generation !== this.generation) return;
		if (event.type === "message_end" && event.message && typeof event.message === "object") {
			const message = event.message as Record<string, unknown>;
			if (message.role === "assistant") {
				const text = textFromMessage(message);
				if (text) {
					worker.output = truncateBytes(text, MAX_RESULT_BYTES);
					this.appendTranscript(worker, `assistant: ${text}`);
				}
				const usage = message.usage as Record<string, unknown> | undefined;
				if (usage) {
					worker.usage.input += Number(usage.input || 0);
					worker.usage.output += Number(usage.output || 0);
					worker.usage.cacheRead += Number(usage.cacheRead || 0);
					worker.usage.cacheWrite += Number(usage.cacheWrite || 0);
					worker.usage.cost += Number((usage.cost as { total?: unknown } | undefined)?.total || 0);
					worker.usage.contextTokens = Number(usage.totalTokens || worker.usage.contextTokens);
					worker.usage.turns++;
				}
				if (typeof message.stopReason === "string") worker.stopReason = message.stopReason;
				if (typeof message.errorMessage === "string") worker.error = message.errorMessage;
			}
		}
		if (event.type === "tool_execution_start") {
			worker.lastTool = typeof event.toolName === "string" ? event.toolName : undefined;
			worker.lastActivity = worker.lastTool ? `tool: ${worker.lastTool}` : "tool running";
			this.appendTranscript(worker, `tool: ${worker.lastTool ?? "unknown"}`);
		}
		if (event.type === "agent_hub_protocol_error") {
			this.finish(worker, "failed", typeof event.error === "string" ? event.error : "RPC protocol error");
		}
		if (event.type === "agent_settled") {
			const status = worker.status === "cancelling"
				? (worker.error ? "failed" : "cancelled")
				: (worker.error || ["error", "aborted", "length"].includes(worker.stopReason ?? "") ? "failed" : "completed");
			this.finish(worker, status, worker.error);
			const runtime = this.runtimes.get(worker.id);
			void runtime?.client?.terminate(this.options.config.cancelGraceMs).finally(() => {
				this.cleanupRuntime(worker.id);
				this.pump();
			});
		}
		this.changed();
	}

	private handleExit(worker: WorkerRecord, code: number | null, signal: NodeJS.Signals | null): void {
		worker.exitCode = code ?? undefined;
		worker.stderr = this.runtimes.get(worker.id)?.client?.getStderr() ?? worker.stderr;
		if (!isTerminal(worker.status)) this.finish(worker, "failed", `RPC child exited before settling (${code ?? signal ?? "unknown"})`);
		this.cleanupRuntime(worker.id);
		this.pump();
	}

	private async timeout(worker: WorkerRecord): Promise<void> {
		if (isTerminal(worker.status)) return;
		const runtime = this.runtimes.get(worker.id);
		worker.error = `Timed out after ${this.options.config.taskTimeoutMs}ms`;
		worker.status = "cancelling";
		this.changed();
		try { await runtime?.client?.clearQueue(); } catch { /* child may already be gone */ }
		try { await runtime?.client?.abort(); } catch { /* continue to process termination */ }
		this.finish(worker, "failed", worker.error);
		await runtime?.client?.terminate(this.options.config.cancelGraceMs).catch(() => undefined);
		this.cleanupRuntime(worker.id);
		this.pump();
	}

	private finish(worker: WorkerRecord, status: Extract<WorkerStatus, "completed" | "failed" | "cancelled">, error?: string): void {
		if (isTerminal(worker.status)) return;
		worker.status = status;
		worker.finishedAt = Date.now();
		if (error) worker.error = error;
		const runtime = this.runtimes.get(worker.id);
		if (runtime?.timeout) clearTimeout(runtime.timeout);
		for (const wake of runtime?.waiters ?? []) wake();
		this.persist(worker);
		this.changed();
		this.options.onCompleted?.(worker);
	}

	private persist(worker: WorkerRecord): void {
		try {
			const dir = path.join(this.options.artifactRoot, safeSegment(worker.ownerId), worker.id);
			fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
			const artifactPath = path.join(dir, "result.json");
			const data = { ...worker, _process: undefined, transcript: worker.transcript };
			fs.writeFileSync(artifactPath, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
			worker.artifactPath = artifactPath;
		} catch (error) {
			worker.error = worker.error ? `${worker.error}; artifact: ${String(error)}` : `artifact: ${String(error)}`;
		}
	}

	private appendTranscript(worker: WorkerRecord, value: string): void {
		worker.transcript.push(value);
		while (Buffer.byteLength(worker.transcript.join("\n")) > MAX_TRANSCRIPT_BYTES && worker.transcript.length > 1) worker.transcript.shift();
	}

	private cleanupRuntime(id: string): void {
		const runtime = this.runtimes.get(id);
		if (!runtime) return;
		if (runtime.timeout) clearTimeout(runtime.timeout);
		if (runtime.tempDir) fs.rmSync(runtime.tempDir, { recursive: true, force: true });
		this.pendingDefinitions.delete(id);
		runtime.client = undefined;
		const worker = this.workers.get(id);
		if (worker) worker._process = undefined;
	}

	private requireOwned(id: string, ownerId: string): WorkerRecord {
		const worker = this.workers.get(id);
		if (!worker || worker.ownerId !== ownerId) throw new Error(`Unknown worker: ${id}`);
		return worker;
	}

	private changed(): void {
		this.options.onChanged?.(this.snapshot());
	}

}
