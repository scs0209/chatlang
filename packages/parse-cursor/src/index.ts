import type { IrSession } from "@chatlang/ir";

export type ParseOk = { ok: true; session: IrSession };
export type ParseErr = {
  ok: false;
  kind: "format_mismatch" | "parse_error" | "too_large" | "not_ready";
  message: string;
};
export type ParseResult = ParseOk | ParseErr;

export function parseCursor(_input: string): ParseResult {
  return {
    ok: false,
    kind: "not_ready",
    message:
      "parse-cursor: waiting on packages/fixtures/cursor golden + FIELD_TABLE.md",
  };
}

export function cursorSignatureHit(_line: string): boolean {
  return false;
}
