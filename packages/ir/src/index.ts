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
