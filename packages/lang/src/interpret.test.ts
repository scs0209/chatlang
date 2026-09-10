import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IrSession } from "@chatlang/ir";
import { interpret, run } from "./interpret.js";
import { createWorld } from "./runtime.js";

describe("interpret", () => {
  it("replays a full agent turn and hydrates world from Read", () => {
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
        { type: "tool_result", ok: true, summary: "export const x = 1" },
        { type: "assistant_message", text: "done" },
      ],
    };
    const r = interpret(session, { mode: "replay", sandbox: false });
    assert.equal(r.ok, true);
    assert.equal(r.exitCode, 0);
    assert.match(r.transcript, /→ user: hi/);
    assert.equal(r.world.files["a.ts"], "export const x = 1");
  });

  it("Write then Read mutates sandbox files (live)", () => {
    const session: IrSession = {
      sourceFormat: "claude",
      events: [
        {
          type: "tool_call",
          name: "Write",
          argsJson: JSON.stringify({
            path: "hello.txt",
            content: "hello from chatlang\n",
          }),
        },
        {
          type: "tool_call",
          name: "Read",
          argsJson: JSON.stringify({ path: "hello.txt" }),
        },
        {
          type: "tool_call",
          name: "Shell",
          argsJson: JSON.stringify({ command: "ls" }),
        },
      ],
    };
    const r = interpret(session, { mode: "live" });
    assert.equal(r.ok, true);
    assert.equal(r.world.files["hello.txt"], "hello from chatlang\n");
    assert.match(r.transcript, /host\): wrote hello\.txt/);
    assert.match(r.transcript, /hello from chatlang/);
    assert.ok(r.world.console.some((l) => l.includes("ls") || l === "hello.txt"));
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
    assert.ok(r.world.console.includes("hello"));
  });

  it("skips unknown tools without failing the run", () => {
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
    const r = interpret(session, { mode: "live", sandbox: false });
    assert.equal(r.ok, true);
    assert.match(r.transcript, /skipped: no sandbox/);
  });
});

describe("run", () => {
  it("executes Write/Read program into world", () => {
    const r = run(
      `
session claude;
turn user() { say "make a file"; }
turn agent() {
  tool Write("{\\"path\\":\\"out.txt\\",\\"content\\":\\"hi\\"}");
  tool Read("{\\"path\\":\\"out.txt\\"}");
  say "done";
}
`,
      { mode: "live", world: createWorld() },
    );
    assert.equal(r.ok, true);
    assert.equal(r.world.files["out.txt"], "hi");
  });

  it("returns exit 2 on parse error", () => {
    const r = run("not valid {{{");
    assert.equal(r.exitCode, 2);
    assert.equal(r.ok, false);
  });
});
