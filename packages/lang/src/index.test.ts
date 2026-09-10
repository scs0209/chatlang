import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { IrSession } from "@chatlang/ir";
import { parseClaude } from "@chatlang/parse-claude";
import { emit } from "@chatlang/print";
import { chatlangSignatureHit, parseChatlang, tokenize } from "./index.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/claude/golden.jsonl",
);

describe("tokenize", () => {
  it("lexes keywords and strings", () => {
    const toks = tokenize(`session claude;\nsay "hi\\n";`);
    assert.equal(toks[0]?.value, "session");
    assert.equal(toks[1]?.value, "claude");
    assert.ok(toks.some((t) => t.kind === "string" && t.value === "hi\n"));
  });
});

describe("parseChatlang", () => {
  it("parses the grammar example", () => {
    const src = `
session claude;

turn user() {
  say "fix the flaky test";
}

turn agent() {
  think "check cookie expiry";
  tool Read("{\\"path\\":\\"src/auth.test.ts\\"}");
  result ok "file contents…";
  say "added null check";
}
`;
    const r = parseChatlang(src);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.session.sourceFormat, "claude");
    assert.equal(r.session.events.length, 5);
    assert.equal(r.session.events[0]?.type, "user_message");
    assert.equal(r.session.events[1]?.type, "thinking");
    assert.equal(r.session.events[2]?.type, "tool_call");
    assert.equal(r.session.events[3]?.type, "tool_result");
    assert.equal(r.session.events[4]?.type, "assistant_message");
  });

  it("rejects JSONL as format_mismatch", () => {
    const r = parseChatlang('{"role":"user"}\n');
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.kind, "format_mismatch");
  });

  it("detects signature", () => {
    assert.equal(chatlangSignatureHit("session claude;\nturn user() {\n"), true);
    assert.equal(chatlangSignatureHit('{"type":"user"}\n'), false);
  });
});

describe("round-trip emit → parse → emit", () => {
  it("is stable for hand-built IR", () => {
    const ir: IrSession = {
      sourceFormat: "codex",
      events: [
        { type: "user_message", text: "hello" },
        { type: "thinking", text: "plan" },
        {
          type: "tool_call",
          name: "Shell",
          argsJson: JSON.stringify({ cmd: "ls" }),
        },
        { type: "tool_result", ok: true, summary: "ok" },
        { type: "assistant_message", text: "done" },
      ],
    };
    const once = emit(ir).text;
    const parsed = parseChatlang(once);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.session.events, ir.events);
    assert.equal(parsed.session.sourceFormat, "codex");
    const twice = emit(parsed.session).text;
    assert.equal(twice, once);
  });

  it("round-trips Claude golden fixture", () => {
    const input = readFileSync(fixtures, "utf8");
    const parsedJsonl = parseClaude(input);
    assert.equal(parsedJsonl.ok, true);
    if (!parsedJsonl.ok) return;
    const src = emit(parsedJsonl.session).text;
    const back = parseChatlang(src);
    assert.equal(back.ok, true);
    if (!back.ok) return;
    assert.deepEqual(back.session.events, parsedJsonl.session.events);
    assert.equal(emit(back.session).text, src);
  });
});
