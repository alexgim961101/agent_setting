import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	DynamicBorder,
	getAgentDir,
	getMarkdownTheme,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, SelectList, type SelectItem, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { loadHubConfig } from "./config.ts";
import { discoverAgents, type AgentScope } from "./discovery.ts";
import type { AgentDefinition, HubSnapshot, UiRequest, WorkerRecord } from "./types.ts";
import { isTerminal } from "./types.ts";
import { WorkerManager } from "./worker-manager.ts";

const MAX_PARALLEL_TASKS = 8;
const RESULT_PREVIEW_BYTES = 16 * 1024;

const TaskItem = Type.Object({
	agent: Type.String(),
	task: Type.String(),
	cwd: Type.Optional(Type.String()),
});
const ChainItem = Type.Object({
	agent: Type.String(),
	task: Type.String(),
	cwd: Type.Optional(Type.String()),
});
const Scope = StringEnum(["user", "project", "both"] as const);

const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String()),
	task: Type.Optional(Type.String()),
	tasks: Type.Optional(Type.Array(TaskItem)),
	chain: Type.Optional(Type.Array(ChainItem)),
	background: Type.Optional(Type.Boolean({ default: false })),
	agentScope: Type.Optional(Scope),
	confirmProjectAgents: Type.Optional(Type.Boolean({ default: true })),
	cwd: Type.Optional(Type.String()),
});

const WorkerParams = Type.Object({
	action: StringEnum(["list", "status", "result", "wait", "steer", "cancel"] as const),
	workerId: Type.Optional(Type.String()),
	workerIds: Type.Optional(Type.Array(Type.String())),
	message: Type.Optional(Type.String()),
	offset: Type.Optional(Type.Integer({ minimum: 0 })),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 * 1024 })),
	timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 60_000 })),
});

interface SubagentDetails {
	mode: "single" | "parallel" | "chain";
	background: boolean;
	results: WorkerRecord[];
}

function ownerId(ctx: ExtensionContext): string {
	return ctx.sessionManager.getSessionId();
}

function formatTokens(value: number): string {
	return value < 1_000 ? `${value}` : value < 1_000_000 ? `${(value / 1_000).toFixed(1)}k` : `${(value / 1_000_000).toFixed(2)}M`;
}

function elapsed(worker: WorkerRecord): string {
	const end = worker.finishedAt ?? Date.now();
	const ms = Math.max(0, end - (worker.startedAt ?? worker.createdAt));
	return ms < 60_000 ? `${Math.round(ms / 1_000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`;
}

function usageLabel(worker: WorkerRecord): string {
	const usage = worker.usage;
	const parts = [`↑${formatTokens(usage.input)}`, `↓${formatTokens(usage.output)}`];
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	return parts.join(" ");
}

function icon(status: WorkerRecord["status"]): string {
	if (status === "completed") return "✓";
	if (status === "failed") return "✗";
	if (status === "cancelled") return "⊘";
	if (status === "queued") return "○";
	return "●";
}

function publicWorker(worker: WorkerRecord): WorkerRecord {
	return { ...worker, transcript: [...worker.transcript], _process: undefined };
}

function resultText(worker: WorkerRecord, offset = 0, limit = RESULT_PREVIEW_BYTES): string {
	const source = worker.output || worker.error || "(no output)";
	const buffer = Buffer.from(source, "utf8");
	const slice = buffer.subarray(offset, Math.min(buffer.length, offset + limit)).toString("utf8");
	return buffer.length > offset + limit ? `${slice}\n\n[truncated: next offset ${offset + limit}, total ${buffer.length} bytes]` : slice;
}

async function approveProjectAgents(
	agents: AgentDefinition[],
	names: string[],
	confirm: boolean,
	ctx: ExtensionContext,
): Promise<void> {
	const selected = names.map((name) => agents.find((agent) => agent.name === name)).filter((agent): agent is AgentDefinition => Boolean(agent));
	const project = selected.filter((agent) => agent.source === "project");
	if (!project.length) return;
	if (!ctx.isProjectTrusted()) throw new Error("Project-local agents require a trusted project. Use /trust and restart Pi first.");
	if (!confirm) return;
	if (!ctx.hasUI) throw new Error("Project-local agents require interactive confirmation");
	const ok = await ctx.ui.confirm("Run project-local agents?", `${project.map((agent) => agent.name).join(", ")}\n${project[0].filePath}`);
	if (!ok) throw new Error("Project-local agent execution was cancelled");
}

function resolveModel(agent: AgentDefinition, config: ReturnType<typeof loadHubConfig>["config"], ctx: ExtensionContext) {
	if (agent.model) return { model: agent.model, thinkingLevel: ctx.thinkingLevel };
	const roleName = config.agentRoles[agent.name];
	const role = roleName ? config.roles[roleName] : undefined;
	return {
		model: role?.model ?? (ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined),
		thinkingLevel: role?.thinkingLevel ?? ctx.thinkingLevel,
	};
}

export default function agentHubExtension(pi: ExtensionAPI) {
	if (process.env.PI_AGENT_HUB_CHILD === "1") return;

	const loaded = loadHubConfig();
	let currentCtx: ExtensionContext | undefined;
	let currentOwner: string | undefined;
	const updateWidget = (snapshot: HubSnapshot) => {
		const ctx = currentCtx;
		if (!ctx || ctx.mode !== "tui") return;
		const visible = snapshot.workers
			.filter((worker) => (!currentOwner || worker.ownerId === currentOwner) && !isTerminal(worker.status))
			.slice(0, 4);
		if (!visible.length) {
			ctx.ui.setWidget("agent-hub", undefined);
			return;
		}
		ctx.ui.setWidget("agent-hub", (_tui, theme) => ({
			render(width: number) {
				return [
					theme.fg("muted", `Subagents · ${snapshot.running} running · ${snapshot.queued} queued`),
					...visible.map((worker) => theme.fg(worker.status === "waiting_approval" ? "warning" : "accent", `${icon(worker.status)} ${worker.agent}`) + theme.fg("dim", ` ${worker.status} · ${worker.lastActivity ?? "waiting"}`)).map((line) => line.slice(0, Math.max(0, width))),
				];
			},
			invalidate() {},
		}));
	};

	const bridgeUi = async (worker: WorkerRecord, request: UiRequest): Promise<Record<string, unknown>> => {
		const ctx = currentCtx;
		if (!ctx?.hasUI || currentOwner !== worker.ownerId) return { cancelled: true };
		const title = `[${worker.id} · ${worker.agent}] ${request.title ?? request.method}`;
		if (request.method === "confirm") return { confirmed: await ctx.ui.confirm(title, request.message ?? "") };
		if (request.method === "select") {
			const value = await ctx.ui.select(title, request.options ?? []);
			return value === undefined ? { cancelled: true } : { value };
		}
		if (request.method === "input") {
			const value = await ctx.ui.input(title, request.placeholder);
			return value === undefined ? { cancelled: true } : { value };
		}
		if (request.method === "editor") {
			const value = await ctx.ui.editor(title, request.prefill ?? "");
			return value === undefined ? { cancelled: true } : { value };
		}
		return {};
	};

	const manager = new WorkerManager({
		config: loaded.config,
		artifactRoot: path.join(getAgentDir(), "agent-hub"),
		onChanged: updateWidget,
		onUiRequest: bridgeUi,
		onCompleted(worker) {
			if (!worker.background || worker.ownerId !== currentOwner) return;
			pi.sendMessage({
				customType: "agent-hub-complete",
				content: `Worker ${worker.id} (${worker.agent}) ${worker.status}. Use worker action=result with workerId=${worker.id} to read the bounded result.`,
				display: true,
				details: { workerId: worker.id, status: worker.status },
			}, { deliverAs: "followUp", triggerTurn: true });
		},
	});

	async function submitOne(agent: AgentDefinition, task: string, cwd: string, background: boolean, step: number | undefined, ctx: ExtensionContext) {
		const selection = resolveModel(agent, loaded.config, ctx);
		return manager.submit({
			agent,
			task,
			cwd,
			ownerId: ownerId(ctx),
			model: selection.model,
			thinkingLevel: selection.thinkingLevel,
			step,
			background,
		});
	}

	async function waitForeground(worker: WorkerRecord, ctx: ExtensionContext): Promise<WorkerRecord> {
		while (!isTerminal(worker.status)) {
			if (ctx.signal?.aborted) {
				await manager.cancel(worker.id, worker.ownerId);
				break;
			}
			await manager.wait([worker.id], worker.ownerId, 60_000);
		}
		return manager.get(worker.id, worker.ownerId)!;
	}

	pi.on("session_start", (_event, ctx) => {
		currentCtx = ctx;
		currentOwner = ownerId(ctx);
		if (loaded.warning) ctx.ui.notify(loaded.warning, "warning");
		updateWidget(manager.snapshot(currentOwner));
	});
	pi.on("session_tree", async (_event, ctx) => {
		await manager.reset(ownerId(ctx));
	});
	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setWidget("agent-hub", undefined);
		currentCtx = undefined;
		currentOwner = undefined;
		await manager.reset(ownerId(ctx));
	});

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: "Delegate read-only work to isolated Pi workers. Supports foreground/background single and parallel jobs, and foreground chains.",
		parameters: SubagentParams,
		async execute(_id, params, _signal, onUpdate, ctx) {
			const scope: AgentScope = params.agentScope ?? "user";
			const discovery = discoverAgents(ctx.cwd, scope);
			const background = params.background ?? false;
			const hasSingle = Boolean(params.agent && params.task);
			const hasParallel = Boolean(params.tasks?.length);
			const hasChain = Boolean(params.chain?.length);
			if (Number(hasSingle) + Number(hasParallel) + Number(hasChain) !== 1) throw new Error("Provide exactly one of single, tasks, or chain");
			if (background && hasChain) throw new Error("Background chains are not supported in Agent Hub v1");
			const names = hasSingle ? [params.agent!] : hasParallel ? params.tasks!.map((task) => task.agent) : params.chain!.map((task) => task.agent);
			await approveProjectAgents(discovery.agents, names, params.confirmProjectAgents ?? true, ctx);
			const findAgent = (name: string) => {
				const agent = discovery.agents.find((candidate) => candidate.name === name);
				if (!agent) throw new Error(`Unknown agent ${name}. Available: ${discovery.agents.map((candidate) => candidate.name).join(", ") || "none"}`);
				return agent;
			};
			// Resolve every definition before starting a worker. Otherwise a later
			// invalid parallel item could leave earlier workers running after the
			// tool call has already failed.
			const selectedAgents = names.map(findAgent);

			let mode: SubagentDetails["mode"] = "single";
			let results: WorkerRecord[] = [];
			if (hasSingle) {
				const worker = await submitOne(selectedAgents[0], params.task!, params.cwd ?? ctx.cwd, background, undefined, ctx);
				results = [background ? worker : await waitForeground(worker, ctx)];
			} else if (hasParallel) {
				mode = "parallel";
				if (params.tasks!.length > MAX_PARALLEL_TASKS) throw new Error(`At most ${MAX_PARALLEL_TASKS} parallel tasks are allowed`);
				results = await Promise.all(params.tasks!.map((task, index) => submitOne(selectedAgents[index], task.task, task.cwd ?? ctx.cwd, background, undefined, ctx)));
				if (!background) {
					while (results.some((worker) => !isTerminal(worker.status))) {
						await manager.wait(results.map((worker) => worker.id), ownerId(ctx), 60_000);
						onUpdate?.({ content: [{ type: "text", text: `${results.filter((worker) => isTerminal(worker.status)).length}/${results.length} workers settled` }], details: { mode, background, results: results.map(publicWorker) } });
						if (ctx.signal?.aborted) {
							await Promise.allSettled(results.filter((worker) => !isTerminal(worker.status)).map((worker) => manager.cancel(worker.id, ownerId(ctx))));
							break;
						}
					}
					results = results.map((worker) => manager.get(worker.id, ownerId(ctx))!);
				}
			} else {
				mode = "chain";
				let previous = "";
				for (let index = 0; index < params.chain!.length; index++) {
					const item = params.chain![index];
					const worker = await submitOne(selectedAgents[index], item.task.replaceAll("{previous}", previous), item.cwd ?? ctx.cwd, false, index + 1, ctx);
					const result = await waitForeground(worker, ctx);
					results.push(result);
					if (result.status !== "completed") break;
					previous = result.output;
				}
			}

			const details: SubagentDetails = { mode, background, results: results.map(publicWorker) };
			if (background) return { content: [{ type: "text", text: `Started: ${results.map((worker) => worker.id).join(", ")}` }], details };
			const failures = results.filter((worker) => worker.status !== "completed");
			const body = results.map((worker) => `### [${worker.agent}] ${worker.status}\n\n${resultText(worker)}`).join("\n\n---\n\n");
			return { content: [{ type: "text", text: `${results.length - failures.length}/${results.length} completed\n\n${body}` }], details, usage: {
				input: results.reduce((sum, worker) => sum + worker.usage.input, 0),
				output: results.reduce((sum, worker) => sum + worker.usage.output, 0),
				cacheRead: results.reduce((sum, worker) => sum + worker.usage.cacheRead, 0),
				cacheWrite: results.reduce((sum, worker) => sum + worker.usage.cacheWrite, 0),
				totalTokens: results.reduce((sum, worker) => sum + worker.usage.input + worker.usage.output + worker.usage.cacheRead + worker.usage.cacheWrite, 0),
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: results.reduce((sum, worker) => sum + worker.usage.cost, 0) },
			} };
		},
		renderCall(args, theme) {
			const count = args.tasks?.length ?? args.chain?.length ?? 1;
			const mode = args.chain ? "chain" : args.tasks ? "parallel" : "single";
			return new Text(theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", `${mode} · ${count}`) + theme.fg("muted", args.background ? " · background" : ""), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as SubagentDetails | undefined;
			if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
			const container = new Container();
			for (const worker of details.results) {
				const color = worker.status === "completed" ? "success" : worker.status === "failed" ? "error" : "warning";
				container.addChild(new Text(theme.fg(color, `${icon(worker.status)} ${worker.agent}`) + theme.fg("dim", ` ${worker.id} · ${worker.status} · ${elapsed(worker)} · ${usageLabel(worker)}`), 0, 0));
				if (expanded && worker.output) container.addChild(new Markdown(resultText(worker), 1, 0, getMarkdownTheme()));
			}
			return container;
		},
	});

	pi.registerTool({
		name: "worker",
		label: "Worker",
		description: "List, inspect, wait for, steer, or cancel Agent Hub workers owned by this Pi session.",
		parameters: WorkerParams,
		async execute(_id, params, _signal, _update, ctx) {
			const owner = ownerId(ctx);
			if (params.action === "list") {
				const workers = manager.snapshot(owner).workers;
				return { content: [{ type: "text", text: workers.length ? workers.map((worker) => `${worker.id} ${worker.agent} ${worker.status} ${worker.lastActivity ?? ""}`).join("\n") : "No workers" }], details: { workers } };
			}
			if (params.action === "wait") {
				const ids = params.workerIds ?? (params.workerId ? [params.workerId] : []);
				if (!ids.length) throw new Error("wait requires workerId or workerIds");
				const workers = await manager.wait(ids, owner, params.timeoutMs ?? 30_000);
				return { content: [{ type: "text", text: workers.map((worker) => `${worker.id}: ${worker.status}`).join("\n") }], details: { workers: workers.map(publicWorker) } };
			}
			if (!params.workerId) throw new Error(`${params.action} requires workerId`);
			if (params.action === "steer") {
				if (!params.message?.trim()) throw new Error("steer requires message");
				await manager.steer(params.workerId, owner, params.message);
				return { content: [{ type: "text", text: `Steering queued for ${params.workerId}` }], details: {} };
			}
			if (params.action === "cancel") {
				const worker = await manager.cancel(params.workerId, owner);
				return { content: [{ type: "text", text: `${worker.id}: ${worker.status}` }], details: { worker: publicWorker(worker) } };
			}
			const worker = manager.get(params.workerId, owner);
			if (!worker) throw new Error(`Unknown worker: ${params.workerId}`);
			if (params.action === "result") {
				return { content: [{ type: "text", text: resultText(worker, params.offset ?? 0, params.limit ?? RESULT_PREVIEW_BYTES) }], details: { worker: publicWorker(worker) } };
			}
			return { content: [{ type: "text", text: `${worker.id} ${worker.agent} ${worker.status}\n${worker.lastActivity ?? ""}\n${usageLabel(worker)}` }], details: { worker: publicWorker(worker) } };
		},
	});

	async function openHub(ctx: ExtensionContext): Promise<void> {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Agent Hub overlay is available only in TUI mode. Use the worker tool otherwise.", "warning");
			return;
		}
		const workers = manager.snapshot(ownerId(ctx)).workers.slice().reverse();
		if (!workers.length) {
			ctx.ui.notify("No Agent Hub workers in this session", "info");
			return;
		}
		const selected = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
			container.addChild(new Text(theme.fg("accent", theme.bold("Agent Hub")) + theme.fg("dim", ` · ${workers.length} workers`), 1, 0));
			const items: SelectItem[] = workers.map((worker) => ({ value: worker.id, label: `${icon(worker.status)} ${worker.agent}`, description: `${worker.status} · ${worker.id} · ${elapsed(worker)}` }));
			const list = new SelectList(items, Math.min(12, items.length + 1), {
				selectedPrefix: (text) => theme.fg("accent", text), selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("dim", text), scrollInfo: (text) => theme.fg("muted", text), noMatch: (text) => theme.fg("warning", text),
			});
			list.onSelect = (item) => done(item.value);
			list.onCancel = () => done(null);
			container.addChild(list);
			container.addChild(new Text(theme.fg("dim", "↑↓ navigate · enter inspect · esc close"), 1, 0));
			container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
			return { render: (width) => container.render(width), invalidate: () => container.invalidate(), handleInput: (data) => { list.handleInput(data); tui.requestRender(); } };
		}, { overlay: true, overlayOptions: { anchor: "right-center", width: "60%", maxHeight: "80%", minWidth: 48, margin: 1 } });
		if (!selected) return;
		const worker = manager.get(selected, ownerId(ctx));
		if (!worker) return;
		const action = await ctx.ui.select(`${worker.id} · ${worker.agent} · ${worker.status}`, isTerminal(worker.status) ? ["결과 보기", "닫기"] : ["상태 보기", "추가 지시", "취소", "닫기"]);
		if (action === "결과 보기" || action === "상태 보기") ctx.ui.notify(`${worker.lastActivity ?? worker.status}\n${resultText(worker, 0, 2_000)}`, worker.status === "failed" ? "error" : "info");
		if (action === "추가 지시") {
			const message = await ctx.ui.input(`Steer ${worker.id}`, "추가 지시");
			if (message?.trim()) await manager.steer(worker.id, ownerId(ctx), message);
		}
		if (action === "취소" && await ctx.ui.confirm(`Cancel ${worker.id}?`, worker.task.slice(0, 300))) await manager.cancel(worker.id, ownerId(ctx));
	}

	pi.registerCommand("agents", { description: "Open Agent Hub", handler: async (_args, ctx) => openHub(ctx) });
	pi.registerShortcut("alt+a", { description: "Open Agent Hub", handler: openHub });
}
