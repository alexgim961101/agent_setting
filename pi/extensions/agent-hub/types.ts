import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type WorkerStatus =
	| "queued"
	| "starting"
	| "running"
	| "waiting_approval"
	| "cancelling"
	| "completed"
	| "failed"
	| "cancelled";

export type TerminalWorkerStatus = Extract<WorkerStatus, "completed" | "failed" | "cancelled">;

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
	contextTokens: number;
}

export interface HubConfig {
	version: 1;
	maxConcurrent: number;
	maxQueued: number;
	startupTimeoutMs: number;
	rpcTimeoutMs: number;
	taskTimeoutMs: number;
	cancelGraceMs: number;
	roles: Record<string, { model: string; thinkingLevel?: string }>;
	agentRoles: Record<string, string>;
}

export interface AgentDefinition {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

export interface WorkerRequest {
	agent: AgentDefinition;
	task: string;
	cwd: string;
	ownerId: string;
	model?: string;
	thinkingLevel?: string;
	step?: number;
	background: boolean;
}

export interface WorkerRecord {
	id: string;
	generation: number;
	ownerId: string;
	agent: string;
	agentSource: AgentDefinition["source"];
	task: string;
	cwd: string;
	model?: string;
	thinkingLevel?: string;
	tools: string[];
	status: WorkerStatus;
	createdAt: number;
	startedAt?: number;
	finishedAt?: number;
	lastActivity?: string;
	lastTool?: string;
	output: string;
	transcript: string[];
	stderr: string;
	error?: string;
	stopReason?: string;
	exitCode?: number;
	usage: UsageStats;
	step?: number;
	artifactPath?: string;
	background: boolean;
	_process?: ChildProcessWithoutNullStreams;
}

export interface HubSnapshot {
	workers: WorkerRecord[];
	running: number;
	queued: number;
}

export interface RpcResponse {
	id?: string;
	type: "response";
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

export type RpcEvent = Record<string, unknown> & { type: string };

export interface UiRequest extends RpcEvent {
	type: "extension_ui_request";
	id: string;
	method: string;
	title?: string;
	message?: string;
	options?: string[];
	placeholder?: string;
	prefill?: string;
	timeout?: number;
}

export interface RpcInvocation {
	command: string;
	args: string[];
}

export const TERMINAL_STATUSES = new Set<WorkerStatus>(["completed", "failed", "cancelled"]);
export const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);

export function emptyUsage(): UsageStats {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0, contextTokens: 0 };
}

export function isTerminal(status: WorkerStatus): status is TerminalWorkerStatus {
	return TERMINAL_STATUSES.has(status);
}
