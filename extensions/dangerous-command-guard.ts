import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Conservative text matching, not a shell parser or security sandbox.
// Match paths/wrappers too; quoted examples may intentionally produce false positives.
const rules: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(?:^|[\s/;|&()])(?:sudo|doas)(?=\s|$)/m, reason: "관리자 권한 실행" },
  { pattern: /(?:^|[\s/;|&()])(?:rm|rmdir|unlink|shred)(?=\s|$)/m, reason: "파일·디렉터리 삭제" },
  { pattern: /(?:^|[\s/;|&()])(?:chmod|chown|chgrp)(?=\s|$)/m, reason: "파일 권한·소유자 변경" },
  { pattern: /(?:^|[\s/;|&()])(?:mkfs(?:\.[\w-]+)?|wipefs|dd)(?=\s|$)/m, reason: "디스크·데이터 덮어쓰기" },
  { pattern: /(?:^|[\s/;|&()])git\s+[^\n;|&]*\bpush\b/m, reason: "Git 원격 push" },
  { pattern: /(?:^|[\s/;|&()])git\s+[^\n;|&]*\b(?:reset|clean|restore)\b/m, reason: "Git 작업 내용·이력 변경 또는 삭제" },
  { pattern: /(?:^|[\s/;|&()])git\s+[^\n;|&]*\bcheckout\b[^\n;|&]*(?:\s--(?:\s|$)|\s(?:-f|--force)(?=\s|$))/m, reason: "Git 작업 내용 덮어쓰기" },
  { pattern: /(?:^|[\s/;|&()])git\s+[^\n;|&]*\b(?:branch|tag)\b[^\n;|&]*\s(?:-[dD]|--delete)(?=\s|$)/m, reason: "Git 브랜치·태그 삭제" },
  { pattern: /(?:^|[\s/;|&()])git\s+[^\n;|&]*\bstash\s+(?:drop|clear)(?=\s|$)/m, reason: "Git stash 삭제" },
  { pattern: /(?:^|[\s/;|&()])find\s+[^\n;|&]*\s-delete(?=\s|$)/m, reason: "find를 통한 파일 삭제" },
  { pattern: /(?:^|[\s/;|&()])(?:curl|wget)\s+[^\n]*\|\s*(?:\/[^\s]+\/)?(?:sh|bash|zsh)(?=\s|$)/m, reason: "다운로드한 스크립트 즉시 실행" },
];

export function getDangerReasons(command: string): string[] {
  // Handle the common shell line-continuation form without claiming full parsing.
  const normalized = command.replace(/\\\r?\n/g, "");
  return rules.filter(({ pattern }) => pattern.test(normalized)).map(({ reason }) => reason);
}

export default function dangerousCommandGuard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const command = event.input.command;
    if (typeof command !== "string") return;
    const reasons = getDangerReasons(command);
    if (reasons.length === 0) return;

    const block = { block: true, reason: "위험 명령 실행이 승인되지 않았습니다. 다른 도구로 우회하거나 자동 재시도하지 말고 사용자에게 확인하세요." };
    if (!ctx.hasUI) return { ...block, reason: `${block.reason} 확인 UI가 없어 차단했습니다.` };

    // Explicit allow is second: Enter on the default selection must not approve.
    // No remembered approvals. One decision covers this whole bash invocation.
    const allow = "이번 명령 실행 허용";
    try {
      const choice = await ctx.ui.select(
        `위험 명령 확인\n사유: ${reasons.join(", ")}\n작업 경로: ${ctx.cwd}\n\n${command}`,
        ["실행 취소", allow],
      );
      if (choice === allow) return;
    } catch {
      // UI errors must never turn into implicit approval.
    }
    return block;
  });
}
