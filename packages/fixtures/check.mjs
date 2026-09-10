import assert from "node:assert/strict";
import { access, constants, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("fixtures gate", () => {
  for (const format of ["claude", "codex", "cursor"]) {
    it(`${format}: FIELD_TABLE.md present`, async () => {
      assert.equal(await exists(join(root, format, "FIELD_TABLE.md")), true);
    });

    it(`${format}: golden.jsonl present and non-empty`, async () => {
      const p = join(root, format, "golden.jsonl");
      assert.equal(await exists(p), true);
      const text = await readFile(p, "utf8");
      assert.ok(text.trim().length > 0);
      assert.ok(!text.includes("/Users/ayaan"));
      assert.ok(!/shoplworks/i.test(text));
    });
  }
});
