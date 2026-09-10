import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { emit } from "@chatlang/print";
import { cursorSignatureHit, parseCursor } from "./index.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/cursor/golden.jsonl",
);

describe("parseCursor", () => {
  it("parses golden fixture with tools", () => {
    const input = readFileSync(fixtures, "utf8");
    const r = parseCursor(input);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.session.sourceFormat, "cursor");
    assert.ok(r.session.events.some((e) => e.type === "user_message"));
    assert.ok(r.session.events.some((e) => e.type === "tool_call"));
    const { text } = emit(r.session);
    assert.match(text, /turn user\(\)/);
    assert.match(text, /tool /);
  });

  it("rejects unrelated JSON", () => {
    const r = parseCursor('{"a":1}\n');
    assert.equal(r.ok, false);
  });

  it("detects signature", () => {
    const line = readFileSync(fixtures, "utf8").split("\n").find(Boolean)!;
    assert.equal(cursorSignatureHit(line), true);
  });
});
