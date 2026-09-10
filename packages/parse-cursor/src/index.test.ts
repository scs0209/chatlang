import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCursor } from "./index.js";

describe("parseCursor", () => {
  it("is gated until fixtures exist", () => {
    const r = parseCursor("{}");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "not_ready");
  });
});
