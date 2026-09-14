import { homedir } from "node:os";
import { sep } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const CONTEXT_WARNING_PERCENT = 70;
const CONTEXT_CRITICAL_PERCENT = 90;

function singleLine(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").trim();
}

function formatTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatDuration(startMs: number, nowMs: number): string {
	const minutes = Math.floor((nowMs - startMs) / 60_000);
	if (minutes < 1) return "<1m";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

function alignRow(left: string, right: string, width: number): string {
	const rightWidth = visibleWidth(right);
	if (width <= rightWidth + 2) return truncateToWidth(right, width);

	const shortened = truncateToWidth(left, width - rightWidth - 2);
	return shortened + " ".repeat(width - visibleWidth(shortened) - rightWidth) + right;
}

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let sessionStartedAt: number | undefined;

	function apply(ctx: ExtensionContext) {
		if (ctx.mode !== "tui") return;
		if (!enabled) {
			ctx.ui.setFooter(undefined);
			return;
		}

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					if (width < 1) return [];
					const home = homedir();
					const cwd = ctx.cwd === home ? "~" : ctx.cwd.startsWith(home + sep) ? "~" + ctx.cwd.slice(home.length) : ctx.cwd;
					const branch = footerData.getGitBranch();
					const location = theme.fg("accent", singleLine(cwd));
					const branchLabel = branch ? theme.fg("muted", ` · ${singleLine(branch)}`) : "";
					const model = ctx.model;
					const modelLabel = model ? `${model.provider} · ${model.name || model.id}` : "모델 미선택";
					const thinking = model?.reasoning ? ` · ${ctx.thinkingLevel ?? "off"}` : "";
					const percent = ctx.getContextUsage()?.percent;
					const contextLabel = percent == null ? "컨텍스트 ?" : `컨텍스트 ${percent.toFixed(0)}%`;
					const contextColor = percent != null && percent > CONTEXT_CRITICAL_PERCENT ? "error"
						: percent != null && percent > CONTEXT_WARNING_PERCENT ? "warning" : "muted";
					let input = 0;
					let output = 0;
					let cacheRead = 0;
					let cacheWrite = 0;
					let cost = 0;
					for (const entry of ctx.sessionManager.getBranch()) {
						if (entry.type === "message" && entry.message.role === "assistant") {
							const usage = (entry.message as {
								usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: { total: number } };
							}).usage;
							input += usage.input;
							output += usage.output;
							cacheRead += usage.cacheRead;
							cacheWrite += usage.cacheWrite;
							cost += usage.cost.total;
						}
					}

					const leftParts = [singleLine(modelLabel + thinking)];
					if (sessionStartedAt != null) leftParts.push(formatDuration(sessionStartedAt, Date.now()));
					const leftLabel = theme.fg("muted", leftParts.join(" · "));

					const usageParts: string[] = [];
					if (input > 0) usageParts.push(`↑${formatTokens(input)}`);
					if (output > 0) usageParts.push(`↓${formatTokens(output)}`);
					if (cacheRead > 0 || cacheWrite > 0) usageParts.push(`cache ${formatTokens(cacheRead + cacheWrite)}`);
					if (cost > 0) usageParts.push(`$${cost.toFixed(3)}`);
					const rightLabel =
						theme.fg("muted", usageParts.length > 0 ? `${usageParts.join(" ")} · ` : "") + theme.fg(contextColor, contextLabel);
					const lines = [
						truncateToWidth(location + branchLabel, width),
						alignRow(leftLabel, rightLabel, width),
					];

					// 뉴럴와트 등 다른 확장이 제공하는 상태를 함께 표시한다.
					for (const [, status] of [...footerData.getExtensionStatuses()].sort(([a], [b]) => a.localeCompare(b))) {
						const text = singleLine(status);
						if (text) lines.push(truncateToWidth(text, width));
					}
					return lines;
				},
			};
		});
	}

	function toggle(ctx: ExtensionContext) {
		if (ctx.mode !== "tui") return;
		enabled = !enabled;
		apply(ctx);
		ctx.ui.notify(enabled ? "간결한 상태 표시줄" : "기본 상태 표시줄", "info");
	}

	pi.on("session_start", (_event, ctx) => {
		sessionStartedAt = Date.now();
		apply(ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.mode === "tui" && enabled) ctx.ui.setFooter(undefined);
	});
	pi.registerCommand("ui", {
		description: "간결한 상태 표시줄과 기본 표시줄 전환",
		handler: async (_args, ctx) => toggle(ctx),
	});
	pi.registerShortcut("ctrl+alt+u", {
		description: "상태 표시줄 전환",
		handler: async (ctx) => toggle(ctx),
	});
}
