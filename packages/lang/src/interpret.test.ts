import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IrSession } from "@chatlang/ir";
import { interpret, run } from "./interpret.js";

describe("interpret", () => {
  it("replays a full agent turn", () => {
    const session: IrSession = {
      sourceFormat: "claude",
      events: [
        { type: "user_message", text: "hi" },
        { type: "thinking", text: "plan" },
        {
          type: "tool_call",
          name: "Read",
          argsJson: JSON.stringify({ path: "a.ts" }),
        },
        { type: "tool_result", ok: true, summary: "contents" },
        { type: "assistant_message", text: "done" },
      ],
    };
    const r = interpret(session, { mode: "replay" });
    assert.equal(r.ok, true);
    assert.equal(r.exitCode, 0);
    assert.match(r.transcript, /→ user: hi/);
    assert.match(r.transcript, /… think: plan/);
    assert.match(r.transcript, /⚙ tool Read/);
    assert.match(r.transcript, /← ok \(replay\): contents/);
    assert.match(r.transcript, /→ agent: done/);
  });

  it("calls Echo in live mode", () => {
    const session: IrSession = {
      sourceFormat: "claude",
      events: [
        {
          type: "tool_call",
          name: "Echo",
          argsJson: JSON.stringify({ msg: "hello" }),
        },
      ],
    };
    const r = interpret(session, { mode: "live" });
    assert.equal(r.ok, true);
    assert.match(r.transcript, /← ok \(host\): hello/);
  });

  it("errors when live tool missing and no result", () => {
    const session: IrSession = {
      sourceFormat: "claude",
      events: [
        {
          type: "tool_call",
          name: "NoSuchTool",
          argsJson: "{}",
        },
      ],
    };
    const r = interpret(session, { mode: "live" });
    assert.equal(r.ok, false);
    assert.equal(r.exitCode, 1);
    assert.match(r.transcript, /no result and no host/);
  });
});

describe("run", () => {
  it("parses source then interprets", () => {
    const r = run(
      `
session claude;
turn user() { say "ping"; }
turn agent() {
  tool Echo("{\\"msg\\":\\"pong\\"}");
  say "done";
}
`,
      { mode: "live" },
    );
    assert.equal(r.ok, true);
    assert.match(r.transcript, /→ user: ping/);
    assert.match(r.transcript, /host\): pong/);
    assert.match(r.transcript, /→ agent: done/);
  });

  it("returns exit 2 on parse error", () => {
    const r = run("not valid {{{");
    assert.equal(r.exitCode, 2);
    assert.equal(r.ok, false);
  });
});
