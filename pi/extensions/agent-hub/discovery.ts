import * as fs from "node:fs";
import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import type { AgentDefinition } from "./types.ts";
import { READ_ONLY_TOOLS } from "./types.ts";

export type AgentScope = "user" | "project" | "both";

interface Frontmatter {
	name?: unknown;
	description?: unknown;
	tools?: unknown;
	model?: unknown;
}

function parseTools(value: unknown): string[] | undefined {
	const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	const tools = raw.filter((tool): tool is string => typeof tool === "string").map((tool) => tool.trim()).filter(Boolean);
	return tools.length ? tools : undefined;
}

function loadDir(dir: string, source: AgentDefinition["source"]): AgentDefinition[] {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
	const agents: AgentDefinition[] = [];
	for (const entry of entries) {
		if (!entry.name.endsWith(".md") || (!entry.isFile() && !entry.isSymbolicLink())) continue;
		const filePath = path.join(dir, entry.name);
		try {
			const { frontmatter, body } = parseFrontmatter<Frontmatter>(fs.readFileSync(filePath, "utf8"));
			if (typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string") continue;
			agents.push({
				name: frontmatter.name,
				description: frontmatter.description,
				tools: parseTools(frontmatter.tools),
				model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
				systemPrompt: body,
				source,
				filePath,
			});
		} catch {
			// One malformed or unreadable definition must not hide the others.
		}
	}
	return agents;
}

function nearestProjectAgents(cwd: string): string | null {
	for (let current = path.resolve(cwd); ; current = path.dirname(current)) {
		const candidate = path.join(current, CONFIG_DIR_NAME, "agents");
		try {
			if (fs.statSync(candidate).isDirectory()) return candidate;
		} catch {
			// keep walking
		}
		const parent = path.dirname(current);
		if (parent === current) return null;
	}
}

export function discoverAgents(cwd: string, scope: AgentScope): { agents: AgentDefinition[]; projectAgentsDir: string | null } {
	const projectAgentsDir = nearestProjectAgents(cwd);
	const user = scope === "project" ? [] : loadDir(path.join(getAgentDir(), "agents"), "user");
	const project = scope === "user" || !projectAgentsDir ? [] : loadDir(projectAgentsDir, "project");
	const byName = new Map<string, AgentDefinition>();
	for (const agent of user) byName.set(agent.name, agent);
	for (const agent of project) byName.set(agent.name, agent); // project overrides user only when explicitly enabled
	return { agents: [...byName.values()], projectAgentsDir };
}

export function effectiveReadOnlyTools(agent: AgentDefinition): string[] {
	const requested = agent.tools ?? [...READ_ONLY_TOOLS];
	const tools = requested.filter((tool) => READ_ONLY_TOOLS.has(tool));
	if (tools.length === 0) throw new Error(`Agent ${agent.name} has no allowed read-only tools`);
	if (agent.tools?.some((tool) => !READ_ONLY_TOOLS.has(tool))) {
		throw new Error(`Agent ${agent.name} requests unsupported tools. Agent Hub v1 allows only read, grep, find, and ls.`);
	}
	return [...new Set(tools)];
}
