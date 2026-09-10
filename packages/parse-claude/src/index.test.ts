import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseClaude } from "./index.js";

describe("parseClaude", () => {
  it("is gated until fixtures exist", () => {
    const r = parseClaude("{}");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "not_ready");
  });
});
