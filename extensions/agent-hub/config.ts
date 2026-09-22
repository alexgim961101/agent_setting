import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { HubConfig } from "./types.ts";

export const DEFAULT_CONFIG: HubConfig = {
	version: 1,
	maxConcurrent: 2,
	maxQueued: 8,
	startupTimeoutMs: 30_000,
	rpcTimeoutMs: 10_000,
	taskTimeoutMs: 600_000,
	cancelGraceMs: 5_000,
	roles: {},
	agentRoles: {},
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function readRoles(value: unknown): HubConfig["roles"] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const roles: HubConfig["roles"] = {};
	for (const [name, raw] of Object.entries(value)) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
		const item = raw as Record<string, unknown>;
		if (typeof item.model !== "string" || !item.model.trim()) continue;
		roles[name] = {
			model: item.model.trim(),
			thinkingLevel: typeof item.thinkingLevel === "string" ? item.thinkingLevel : undefined,
		};
	}
	return roles;
}

function readAgentRoles(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim())),
	);
}

export function parseHubConfig(raw: unknown): HubConfig {
	const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	return {
		version: 1,
		maxConcurrent: boundedInteger(value.maxConcurrent, DEFAULT_CONFIG.maxConcurrent, 1, 4),
		maxQueued: boundedInteger(value.maxQueued, DEFAULT_CONFIG.maxQueued, 1, 32),
		startupTimeoutMs: boundedInteger(value.startupTimeoutMs, DEFAULT_CONFIG.startupTimeoutMs, 1_000, 120_000),
		rpcTimeoutMs: boundedInteger(value.rpcTimeoutMs, DEFAULT_CONFIG.rpcTimeoutMs, 1_000, 60_000),
		taskTimeoutMs: boundedInteger(value.taskTimeoutMs, DEFAULT_CONFIG.taskTimeoutMs, 5_000, 3_600_000),
		cancelGraceMs: boundedInteger(value.cancelGraceMs, DEFAULT_CONFIG.cancelGraceMs, 100, 30_000),
		roles: readRoles(value.roles),
		agentRoles: readAgentRoles(value.agentRoles),
	};
}

export function loadHubConfig(agentDir = getAgentDir()): { config: HubConfig; warning?: string; path: string } {
	const configPath = path.join(agentDir, "agent-hub.json");
	try {
		return { config: parseHubConfig(JSON.parse(fs.readFileSync(configPath, "utf8"))), path: configPath };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { config: DEFAULT_CONFIG, path: configPath };
		return { config: DEFAULT_CONFIG, warning: `agent-hub 설정을 읽지 못해 기본값을 사용합니다: ${String(error)}`, path: configPath };
	}
}
