import assert from "node:assert/strict";
import { access, constants } from "node:fs/promises";
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

    it(`${format}: golden file placeholder documented (optional until capture)`, async () => {
      const jsonl = await exists(join(root, format, "golden.jsonl"));
      const json = await exists(join(root, format, "golden.json"));
      const readme = await exists(join(root, format, "PLACE_GOLDEN_HERE.md"));
      assert.ok(
        jsonl || json || readme,
        "expected golden.* or PLACE_GOLDEN_HERE.md",
      );
    });
  }
});
