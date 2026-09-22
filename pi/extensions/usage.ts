import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const FETCH_TIMEOUT_MS = 15_000;
const NEURALWATT_QUOTA_URL = "https://api.neuralwatt.com/v1/quota";
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

interface UsageResult {
	ok: boolean;
	lines: string[];
	error?: string;
}

type QuotaFetcher = (ctx: ExtensionContext) => Promise<UsageResult>;

function formatUsd(n: number): string {
	return `$${n.toFixed(2)}`;
}

function formatNumber(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatReset(epochSeconds: number): string {
	const date = new Date(epochSeconds * 1000);
	const pad = (v: number) => String(v).padStart(2, "0");
	return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWindowSeconds(seconds: number): string {
	if (seconds % 604800 === 0) return `${seconds / 604800}주`;
	if (seconds % 86400 === 0) return `${seconds / 86400}일`;
	if (seconds % 3600 === 0) return `${seconds / 3600}시간`;
	return `${Math.round(seconds / 60)}분`;
}

interface CodexAuth {
	access: string;
	accountId: string;
}

function parseCodexAuth(raw: string | undefined): CodexAuth | undefined {
	if (!raw || raw === "-") return undefined;
	try {
		const parsed = JSON.parse(raw) as Partial<CodexAuth>;
		return parsed.access && parsed.accountId ? { access: parsed.access, accountId: parsed.accountId } : undefined;
	} catch {
		return undefined;
	}
}

async function getCodexAuth(ctx: ExtensionContext): Promise<CodexAuth | undefined> {
	// Pi가 OAuth 자격을 JSON 문자열로 돌려주는 경우
	try {
		const fromRegistry = parseCodexAuth(await ctx.modelRegistry.getApiKeyForProvider("openai-codex"));
		if (fromRegistry) return fromRegistry;
	} catch {
		// fall through to auth.json
	}
	// fallback: auth.json 직접 읽기
	try {
		const authFile = JSON.parse(await readFile(join(homedir(), ".pi", "agent", "auth.json"), "utf8")) as {
			["openai-codex"]?: { type?: string; access?: string; accountId?: string };
		};
		const codex = authFile["openai-codex"];
		return codex?.type === "oauth" && codex.access && codex.accountId
			? { access: codex.access, accountId: codex.accountId }
			: undefined;
	} catch {
		return undefined;
	}
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
	const response = await fetch(url, {
		headers,
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		let message = `${response.status} ${response.statusText}`;
		try {
			const body = (await response.json()) as { error?: string; detail?: string };
			message = body.error ?? body.detail ?? message;
		} catch {
			// keep status line
		}
		throw new Error(message);
	}
	return response.json();
}

interface NeuralwattQuotas {
	balance?: { credits_remaining_usd: number; total_credits_usd: number; credits_used_usd: number };
	usage?: { current_month?: { cost_usd: number; requests: number; tokens: number } };
	key?: {
		name?: string;
		allowance?: { limit_usd: number; spent_usd: number; remaining_usd: number; blocked: boolean } | null;
	};
	subscription?: { plan: string; status: string; kwh_used: number; kwh_remaining: number } | null;
}

async function fetchNeuralwattUsage(ctx: ExtensionContext): Promise<UsageResult> {
	const apiKey = await ctx.modelRegistry.getApiKeyForProvider("neuralwatt");
	if (!apiKey) {
		return { ok: false, lines: [], error: "neuralwatt API 키가 없습니다. ~/.pi/agent/auth.json에 등록하세요." };
	}
	let data: NeuralwattQuotas;
	try {
		data = (await fetchJson(NEURALWATT_QUOTA_URL, { Authorization: `Bearer ${apiKey}` })) as NeuralwattQuotas;
	} catch (err) {
		return { ok: false, lines: [], error: `neuralwatt 사용량 조회 실패: ${err instanceof Error ? err.message : err}` };
	}

	const lines: string[] = ["neuralwatt 사용량"];
	if (data.balance) {
		lines.push(
			`크레딧  ${formatUsd(data.balance.credits_remaining_usd)} 남음 / ${formatUsd(data.balance.total_credits_usd)} (사용 ${formatUsd(data.balance.credits_used_usd)})`,
		);
	}
	const month = data.usage?.current_month;
	if (month) {
		lines.push(`이번 달  ${formatUsd(month.cost_usd)} · 요청 ${formatNumber(month.requests)} · 토큰 ${formatNumber(month.tokens)}`);
	}
	if (data.key?.allowance) {
		const a = data.key.allowance;
		lines.push(
			`키 한도  ${formatUsd(a.remaining_usd)} 남음 / ${formatUsd(a.limit_usd)}${a.blocked ? " (차단됨)" : ""}`,
		);
	}
	if (data.subscription) {
		const s = data.subscription;
		lines.push(`구독  ${s.plan} (${s.status}) · kWh ${s.kwh_used} 사용 / ${s.kwh_remaining} 남음`);
	}
	return { ok: true, lines: lines.length > 1 ? lines : [...lines, "조회 가능한 사용량 정보가 없습니다."] };
}

interface CodexRateWindow {
	used_percent: number;
	limit_window_seconds: number;
	reset_at: number;
}

interface CodexRateLimit {
	allowed: boolean;
	limit_reached: boolean;
	primary_window: CodexRateWindow | null;
	secondary_window: CodexRateWindow | null;
}

interface CodexUsage {
	plan_type?: string;
	rate_limit?: CodexRateLimit | null;
	additional_rate_limits?: {
		limit_name: string;
		rate_limit?: CodexRateLimit | null;
	}[];
	credits?: { has_credits: boolean; unlimited: boolean; balance: string };
}

function describeWindow(label: string, w: CodexRateWindow): string {
	const state = w.used_percent >= 100 ? "소진" : `${100 - w.used_percent}% 남음`;
	return `${label} (${formatWindowSeconds(w.limit_window_seconds)})  ${state} · 리셋 ${formatReset(w.reset_at)}`;
}

async function fetchCodexUsage(ctx: ExtensionContext): Promise<UsageResult> {
	const auth = await getCodexAuth(ctx);
	if (!auth) {
		return { ok: false, lines: [], error: "openai-codex 인증이 없습니다. Codex OAuth로 로그인하세요." };
	}
	let data: CodexUsage;
	try {
		data = (await fetchJson(CODEX_USAGE_URL, {
			Authorization: `Bearer ${auth.access}`,
			"chatgpt-account-id": auth.accountId,
		})) as CodexUsage;
	} catch (err) {
		return {
			ok: false,
			lines: [],
			error: `codex 사용량 조회 실패: ${err instanceof Error ? err.message : err} (토큰 만료 시 재로그인 필요)`,
		};
	}

	const lines: string[] = [`codex 사용량${data.plan_type ? ` (${data.plan_type})` : ""}`];
	const main = data.rate_limit;
	if (main?.primary_window) lines.push(describeWindow("주 윈도우", main.primary_window));
	if (main?.secondary_window) lines.push(describeWindow("보조 윈도우", main.secondary_window));
	if (main?.limit_reached) lines.push("현재 한도에 도달했습니다.");
	for (const extra of data.additional_rate_limits ?? []) {
		const w = extra.rate_limit?.primary_window;
		if (w) lines.push(describeWindow(`${extra.limit_name}`, w));
	}
	if (data.credits && !data.credits.unlimited) {
		lines.push(`크레딧  ${data.credits.has_credits ? `$${data.credits.balance}` : "없음"}`);
	}
	return { ok: true, lines: lines.length > 1 ? lines : [...lines, "조회 가능한 사용량 정보가 없습니다."] };
}

const PROVIDER_FETCHERS: Record<string, QuotaFetcher> = {
	neuralwatt: fetchNeuralwattUsage,
	"openai-codex": fetchCodexUsage,
};

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description: "현재 provider의 사용량과 잔여 한도 확인",
		handler: async (_args, ctx) => {
			const provider = ctx.model?.provider;
			const fetcher = provider ? PROVIDER_FETCHERS[provider] : undefined;
			if (!fetcher) {
				const target = provider ?? "모델 미선택";
				ctx.ui.notify(`${target}은(는) 사용량 조회를 지원하지 않습니다. 지원: neuralwatt, openai-codex`, "warning");
				return;
			}

			const result = await fetcher(ctx);
			ctx.ui.notify(
				result.ok ? result.lines.join("\n") : (result.error ?? "조회 실패"),
				result.ok ? "info" : "error",
			);
		},
	});
}
