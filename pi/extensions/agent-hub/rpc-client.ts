import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { RpcEvent, RpcInvocation, RpcResponse, UiRequest } from "./types.ts";

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;

export interface RpcProcessOptions {
	cwd: string;
	args: string[];
	env?: NodeJS.ProcessEnv;
	invocation?: RpcInvocation;
	requestTimeoutMs: number;
	startupTimeoutMs: number;
	onEvent?: (event: RpcEvent) => void;
	onUiRequest?: (request: UiRequest) => Promise<Record<string, unknown>>;
	onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

type Pending = { resolve: (value: RpcResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

export function getPiInvocation(args: string[]): RpcInvocation {
	const script = process.argv[1];
	if (script && !script.startsWith("/$bunfs/root/") && fs.existsSync(script)) {
		return { command: process.execPath, args: [script, ...args] };
	}
	const executable = path.basename(process.execPath).toLowerCase();
	return /^(node|bun)(\.exe)?$/.test(executable)
		? { command: "pi", args }
		: { command: process.execPath, args };
}

export class RpcProcess {
	readonly process: ChildProcessWithoutNullStreams;
	private readonly pending = new Map<string, Pending>();
	private readonly decoder = new StringDecoder("utf8");
	private buffer = "";
	private nextId = 0;
	private closed = false;
	private stderrTail = "";
	private exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
	private readonly options: RpcProcessOptions;

	constructor(options: RpcProcessOptions) {
		this.options = options;
		const invocation = options.invocation ?? getPiInvocation(options.args);
		this.process = spawn(invocation.command, invocation.args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			shell: false,
			detached: process.platform !== "win32",
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.exitPromise = new Promise((resolve) => {
			this.process.once("close", (code, signal) => {
				this.closed = true;
				this.rejectPending(new Error(`RPC child exited (${code ?? signal ?? "unknown"})`));
				this.options.onExit?.(code, signal);
				resolve({ code, signal });
			});
		});
		this.process.once("error", (error) => this.rejectPending(error));
		this.process.stdout.on("data", (chunk: Buffer) => this.consume(chunk));
		this.process.stdout.on("end", () => {
			this.buffer += this.decoder.end();
			if (this.buffer) this.consumeLine(this.buffer.endsWith("\r") ? this.buffer.slice(0, -1) : this.buffer);
			this.buffer = "";
		});
		this.process.stderr.on("data", (chunk: Buffer) => {
			this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(-MAX_STDERR_BYTES);
		});
	}

	async start(): Promise<void> {
		await this.request("get_state", {}, this.options.startupTimeoutMs);
	}

	getStderr(): string {
		return this.stderrTail;
	}

	isClosed(): boolean {
		return this.closed;
	}

	async prompt(message: string): Promise<void> {
		await this.request("prompt", { message });
	}

	async steer(message: string): Promise<void> {
		await this.request("steer", { message });
	}

	async clearQueue(): Promise<void> {
		await this.request("clear_queue");
	}

	async abort(): Promise<void> {
		await this.request("abort");
	}

	async request(type: string, payload: Record<string, unknown> = {}, timeoutMs = this.options.requestTimeoutMs): Promise<RpcResponse> {
		if (this.closed) throw new Error("RPC child is closed");
		const id = `hub-${++this.nextId}`;
		const result = new Promise<RpcResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`RPC ${type} timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
		});
		this.write({ id, type, ...payload });
		const response = await result;
		if (!response.success) throw new Error(response.error || `RPC ${type} failed`);
		return response;
	}

	async terminate(graceMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
		if (this.closed) return this.exitPromise;
		this.kill("SIGTERM");
		const timer = setTimeout(() => this.kill("SIGKILL"), graceMs);
		try {
			return await this.exitPromise;
		} finally {
			clearTimeout(timer);
		}
	}

	private kill(signal: NodeJS.Signals): void {
		if (this.closed) return;
		try {
			if (process.platform !== "win32" && this.process.pid) process.kill(-this.process.pid, signal);
			else this.process.kill(signal);
		} catch {
			try { this.process.kill(signal); } catch { /* already gone */ }
		}
	}

	private write(value: Record<string, unknown>): void {
		if (!this.process.stdin.writable) throw new Error("RPC stdin is not writable");
		this.process.stdin.write(`${JSON.stringify(value)}\n`);
	}

	private consume(chunk: Buffer): void {
		this.buffer += this.decoder.write(chunk);
		if (Buffer.byteLength(this.buffer) > MAX_FRAME_BYTES && !this.buffer.includes("\n")) {
			this.protocolFailure(new Error(`RPC frame exceeds ${MAX_FRAME_BYTES} bytes`));
			return;
		}
		for (;;) {
			const newline = this.buffer.indexOf("\n");
			if (newline < 0) break;
			let line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			if (line.endsWith("\r")) line = line.slice(0, -1);
			if (Buffer.byteLength(line) > MAX_FRAME_BYTES) {
				this.protocolFailure(new Error(`RPC frame exceeds ${MAX_FRAME_BYTES} bytes`));
				return;
			}
			if (line) this.consumeLine(line);
		}
	}

	private consumeLine(line: string): void {
		let event: RpcEvent;
		try {
			event = JSON.parse(line) as RpcEvent;
		} catch (error) {
			this.protocolFailure(new Error(`Invalid RPC JSON: ${String(error)}`));
			return;
		}
		if (event.type === "response" && typeof event.id === "string") {
			const pending = this.pending.get(event.id);
			if (pending) {
				this.pending.delete(event.id);
				clearTimeout(pending.timer);
				pending.resolve(event as RpcResponse);
				return;
			}
		}
		if (event.type === "extension_ui_request" && typeof event.id === "string") {
			void this.handleUiRequest(event as UiRequest);
			return;
		}
		this.options.onEvent?.(event);
	}

	private async handleUiRequest(request: UiRequest): Promise<void> {
		if (!this.options.onUiRequest) {
			if (["select", "confirm", "input", "editor"].includes(request.method)) {
				this.write({ type: "extension_ui_response", id: request.id, cancelled: true });
			}
			return;
		}
		try {
			const response = await this.options.onUiRequest(request);
			if (["select", "confirm", "input", "editor"].includes(request.method)) {
				this.write({ type: "extension_ui_response", id: request.id, ...response });
			}
		} catch {
			if (["select", "confirm", "input", "editor"].includes(request.method)) {
				this.write({ type: "extension_ui_response", id: request.id, cancelled: true });
			}
		}
	}

	private protocolFailure(error: Error): void {
		this.rejectPending(error);
		this.kill("SIGTERM");
		this.options.onEvent?.({ type: "agent_hub_protocol_error", error: error.message });
	}

	private rejectPending(error: Error): void {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
}
