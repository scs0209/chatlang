import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { emit } from "@chatlang/print";
import { claudeSignatureHit, parseClaude } from "./index.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/claude/golden.jsonl",
);

describe("parseClaude", () => {
  it("parses golden fixture into IR and printable source", () => {
    const input = readFileSync(fixtures, "utf8");
    const r = parseClaude(input);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.session.sourceFormat, "claude");
    assert.ok(r.session.events.some((e) => e.type === "user_message"));
    assert.ok(
      r.session.events.some(
        (e) => e.type === "assistant_message" || e.type === "thinking",
      ),
    );
    const { text } = emit(r.session);
    assert.match(text, /turn user\(\)/);
    assert.match(text, /turn agent\(\)/);
  });

  it("rejects unrelated JSON", () => {
    const r = parseClaude('{"foo":1}\n{"bar":2}\n');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "format_mismatch");
  });

  it("detects signature lines", () => {
    const line = readFileSync(fixtures, "utf8").split("\n").find(Boolean)!;
    assert.equal(claudeSignatureHit(line), true);
    assert.equal(claudeSignatureHit('{"hello":true}'), false);
  });
});
