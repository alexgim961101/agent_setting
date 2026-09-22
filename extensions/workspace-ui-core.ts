import * as path from "node:path";

export function compactHomePath(cwd: string, home: string): string {
	return cwd === home ? "~" : cwd.startsWith(`${home}${path.sep}`) ? `~${cwd.slice(home.length)}` : cwd;
}

export function workspaceSubtitle(model: string, thinking: string | undefined): string {
	return `${model}${thinking ? `  ${thinking}` : ""}  ·  /agents Agent Hub  ·  /ui 기본 UI`;
}
