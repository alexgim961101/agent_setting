import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { compactHomePath, workspaceSubtitle } from "./workspace-ui-core.ts";

export default function workspaceUi(pi: ExtensionAPI) {
	let enabled = true;

	function apply(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui") return;
		if (!enabled) {
			ctx.ui.setHeader(undefined);
			ctx.ui.setWorkingIndicator();
			return;
		}
		ctx.ui.setHeader((_tui, theme) => ({
			render(width: number): string[] {
				const model = ctx.model?.name || ctx.model?.id || "모델 미선택";
				const title = theme.fg("accent", theme.bold("π pi")) + theme.fg("muted", `  ${compactHomePath(ctx.cwd, homedir())}`);
				const subtitle = theme.fg("dim", workspaceSubtitle(model, ctx.model?.reasoning ? ctx.thinkingLevel : undefined));
				return [truncateToWidth(title, width), truncateToWidth(subtitle, width), ""];
			},
			invalidate() {},
		}));
		ctx.ui.setWorkingIndicator({
			frames: [
				ctx.ui.theme.fg("dim", "·"),
				ctx.ui.theme.fg("muted", "•"),
				ctx.ui.theme.fg("accent", "●"),
				ctx.ui.theme.fg("muted", "•"),
			],
			intervalMs: 120,
		});
	}

	pi.on("session_start", (_event, ctx) => apply(ctx));
	pi.on("model_select", (_event, ctx) => apply(ctx));
	pi.on("thinking_level_select", (_event, ctx) => apply(ctx));
	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setHeader(undefined);
		ctx.ui.setWorkingIndicator();
	});
	pi.registerCommand("ui", {
		description: "OMP-inspired header/indicator와 Pi 기본 UI 전환",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			apply(ctx);
			ctx.ui.notify(enabled ? "OMP-inspired UI" : "Pi 기본 UI", "info");
		},
	});
	pi.registerShortcut("ctrl+alt+u", {
		description: "OMP-inspired UI 전환",
		handler: async (ctx) => {
			enabled = !enabled;
			apply(ctx);
		},
	});
}
