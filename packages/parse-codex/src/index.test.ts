import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { emit } from "@chatlang/print";
import { codexSignatureHit, parseCodex } from "./index.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/codex/golden.jsonl",
);

describe("parseCodex", () => {
  it("parses golden fixture", () => {
    const input = readFileSync(fixtures, "utf8");
    const r = parseCodex(input);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.session.sourceFormat, "codex");
    assert.ok(r.session.events.some((e) => e.type === "user_message"));
    const { text } = emit(r.session);
    assert.match(text, /turn user\(\)/);
  });

  it("rejects unrelated JSON", () => {
    const r = parseCodex("{}\n");
    assert.equal(r.ok, false);
  });

  it("detects signature", () => {
    const line = readFileSync(fixtures, "utf8").split("\n").find(Boolean)!;
    assert.equal(codexSignatureHit(line), true);
  });
});
