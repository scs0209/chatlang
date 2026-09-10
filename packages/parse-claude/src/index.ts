import type { IrSession } from "@chatlang/ir";

export type ParseOk = { ok: true; session: IrSession };
export type ParseErr = {
  ok: false;
  kind: "format_mismatch" | "parse_error" | "too_large" | "not_ready";
  message: string;
};
export type ParseResult = ParseOk | ParseErr;

/**
 * Parse Claude Code session transcript into IR.
 * Implementation waits on packages/fixtures/claude/golden.* + FIELD_TABLE.md
 * (design Assignment gate).
 */
export function parseClaude(_input: string): ParseResult {
  return {
    ok: false,
    kind: "not_ready",
    message:
      "parse-claude: waiting on packages/fixtures/claude golden + FIELD_TABLE.md",
  };
}

/** Line-level detect signature hits (filled after fixture capture). */
export function claudeSignatureHit(_line: string): boolean {
  return false;
}
