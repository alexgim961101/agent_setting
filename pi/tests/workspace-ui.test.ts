import assert from "node:assert/strict";
import { test } from "node:test";
import { compactHomePath, workspaceSubtitle } from "../extensions/workspace-ui-core.ts";

test("home paths are compacted without changing unrelated paths", () => {
  assert.equal(compactHomePath("/home/alex", "/home/alex"), "~");
  assert.equal(compactHomePath("/home/alex/src/pi", "/home/alex"), "~/src/pi");
  assert.equal(compactHomePath("/srv/project", "/home/alex"), "/srv/project");
  assert.equal(compactHomePath("/home/alexander", "/home/alex"), "/home/alexander");
});

test("subtitle advertises stable commands and optional thinking", () => {
  assert.equal(workspaceSubtitle("Model", undefined), "Model  ·  /agents Agent Hub  ·  /ui 기본 UI");
  assert.match(workspaceSubtitle("Model", "high"), /Model  high/);
});
