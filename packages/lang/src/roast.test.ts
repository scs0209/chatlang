import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IrSession } from "@chatlang/ir";
import { roast } from "./roast.js";

describe("roast", () => {
  it("roasts a tool-heavy session", () => {
    const session: IrSession = {
      sourceFormat: "cursor",
      events: [
        { type: "user_message", text: "이 레포 어때?" },
        { type: "thinking", text: "x".repeat(400) },
        {
          type: "tool_call",
          name: "WebFetch",
          argsJson: "{}",
        },
        {
          type: "tool_call",
          name: "WebFetch",
          argsJson: "{}",
        },
        {
          type: "tool_call",
          name: "WebSearch",
          argsJson: "{}",
        },
        {
          type: "tool_call",
          name: "Read",
          argsJson: JSON.stringify({ path: "a" }),
        },
        {
          type: "tool_call",
          name: "Read",
          argsJson: JSON.stringify({ path: "b" }),
        },
        {
          type: "tool_call",
          name: "Read",
          argsJson: JSON.stringify({ path: "c" }),
        },
        { type: "assistant_message", text: "글쎄요" },
      ],
    };
    const r = roast(session);
    assert.ok(r.lines.length >= 4);
    assert.match(r.transcript, /유저:/);
    assert.match(r.source, /session roast;/);
    assert.match(r.source, /turn critic/);
    assert.ok(r.score.chaos >= 5);
  });

  it("roasts a talk-only session", () => {
    const session: IrSession = {
      sourceFormat: "claude",
      events: [
        { type: "user_message", text: "엑셀 가능?" },
        {
          type: "assistant_message",
          text: "네 가능합니다. ".repeat(20),
        },
      ],
    };
    const r = roast(session);
    assert.match(r.transcript, /도구 0회|말잔치/);
  });
});
