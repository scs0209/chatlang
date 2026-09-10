import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoastPrompt, parseRoastResponse } from "./prompt.mjs";

describe("buildRoastPrompt", () => {
  it("embeds chatlang source", () => {
    const p = buildRoastPrompt({
      chatlang: 'session claude;\nturn user() { say "hi"; }\n',
    });
    assert.match(p, /turn user/);
    assert.match(p, /JSON만 출력/);
  });
});

describe("parseRoastResponse", () => {
  it("parses JSON object", () => {
    const r = parseRoastResponse(
      JSON.stringify({
        title: "테스트",
        lines: ["a", "b", "한 줄 평: c"],
        score: { chaos: 7, focus: 3, drama: 4 },
      }),
    );
    assert.equal(r.title, "테스트");
    assert.equal(r.lines.length, 3);
    assert.equal(r.score.chaos, 7);
    assert.match(r.source, /session roast;/);
  });
});
