import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IrSession } from "@chatlang/ir";
import { emit, escapeChatlangString } from "./index.js";

describe("escapeChatlangString", () => {
  it("uses JSON-style escapes", () => {
    assert.equal(escapeChatlangString('a"b\n'), '"a\\"b\\n"');
  });
});

describe("emit", () => {
  it("prints a minimal user + agent turn", () => {
    const ir: IrSession = {
      sourceFormat: "claude",
      events: [
        { type: "user_message", text: "fix the flaky test" },
        { type: "thinking", text: "check cookie expiry" },
        {
          type: "tool_call",
          name: "Read",
          argsJson: JSON.stringify({ path: "src/auth.test.ts" }),
        },
        {
          type: "tool_result",
          toolName: "Read",
          ok: true,
          summary: "file contents…",
        },
        { type: "assistant_message", text: "added null check" },
      ],
    };
    const { text, tokens } = emit(ir);
    assert.match(text, /turn user\(\) \{/);
    assert.match(text, /say "fix the flaky test"/);
    assert.match(text, /turn agent\(\) \{/);
    assert.match(text, /think "check cookie expiry"/);
    assert.match(text, /tool Read\(/);
    assert.match(text, /result ok /);
    assert.match(text, /say "added null check"/);
    assert.ok(tokens.some((t) => t.type === "keyword"));
  });
});
