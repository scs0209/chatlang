/** Canonical session IR (v0.1). See docs/designs/chatlang.md */

export type SourceFormat = "claude" | "codex" | "cursor";

export type IrEvent =
  | { type: "user_message"; text: string }
  | { type: "assistant_message"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; name: string; argsJson: string }
  | { type: "tool_result"; toolName?: string; ok: boolean; summary: string }
  | { type: "meta"; key: string; value: string };

export interface IrSession {
  sourceFormat: SourceFormat;
  events: IrEvent[];
  /** Set when soft size cap applied (2MB / 5k events). */
  truncated?: boolean;
}

/** Soft / hard caps from the design doc. */
export const SIZE_LIMITS = {
  softBytes: 2 * 1024 * 1024,
  softEvents: 5_000,
  hardBytes: 10 * 1024 * 1024,
  hardEvents: 20_000,
} as const;

export type SizeGate =
  | { ok: true; text: string; truncatedByBytes: boolean }
  | { ok: false; message: string };

/** Hard refuse >10MB; soft truncate input to 2MB. */
export function gateInputSize(input: string): SizeGate {
  const bytes = Buffer.byteLength(input, "utf8");
  if (bytes > SIZE_LIMITS.hardBytes) {
    return {
      ok: false,
      message: `input too large (${bytes} bytes > ${SIZE_LIMITS.hardBytes})`,
    };
  }
  if (bytes > SIZE_LIMITS.softBytes) {
    // truncate by UTF-16-ish code units approx via slice on string length ratio
    let end = Math.floor(input.length * (SIZE_LIMITS.softBytes / bytes));
    while (Buffer.byteLength(input.slice(0, end), "utf8") > SIZE_LIMITS.softBytes) {
      end -= 1024;
      if (end <= 0) {
        end = 0;
        break;
      }
    }
    return { ok: true, text: input.slice(0, end), truncatedByBytes: true };
  }
  return { ok: true, text: input, truncatedByBytes: false };
}

export function truncateEvents(
  events: IrEvent[],
): { events: IrEvent[]; truncated: boolean } {
  if (events.length <= SIZE_LIMITS.softEvents) {
    return { events, truncated: false };
  }
  if (events.length > SIZE_LIMITS.hardEvents) {
    return {
      events: events.slice(0, SIZE_LIMITS.hardEvents),
      truncated: true,
    };
  }
  return { events: events.slice(0, SIZE_LIMITS.softEvents), truncated: true };
}
