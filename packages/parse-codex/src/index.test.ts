import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCodex } from "./index.js";

describe("parseCodex", () => {
  it("is gated until fixtures exist", () => {
    const r = parseCodex("{}");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "not_ready");
  });
});
