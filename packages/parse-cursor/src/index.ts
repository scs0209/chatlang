import {
  gateInputSize,
  truncateEvents,
  type IrEvent,
  type IrSession,
} from "@chatlang/ir";

export type ParseOk = { ok: true; session: IrSession };
export type ParseErr = {
  ok: false;
  kind: "format_mismatch" | "parse_error" | "too_large";
  message: string;
};
export type ParseResult = ParseOk | ParseErr;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse Cursor agent-transcript JSONL into IR.
 * Fixture: packages/fixtures/cursor/golden.jsonl
 */
export function parseCursor(input: string): ParseResult {
  const sized = gateInputSize(input);
  if (!sized.ok) {
    return { ok: false, kind: "too_large", message: sized.message };
  }

  const lines = sized.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { ok: false, kind: "parse_error", message: "empty input" };
  }

  let hits = 0;
  let sawRole = false;
  const events: IrEvent[] = [];

  for (const line of lines) {
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      return { ok: false, kind: "parse_error", message: "invalid JSONL line" };
    }
    if (!isRecord(row)) continue;
    if (cursorSignatureHit(line)) hits += 1;

    const role = row.role;
    if (role === "turn_ended" || role == null) continue;
    if (role !== "user" && role !== "assistant") continue;
    sawRole = true;

    const message = row.message;
    if (!isRecord(message)) continue;
    const content = message.content;

    if (role === "user") {
      const text = flattenText(content);
      if (text.trim()) events.push({ type: "user_message", text });
      continue;
    }

    // assistant: text + tool_use parts
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!isRecord(part)) continue;
        if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
          events.push({ type: "assistant_message", text: part.text });
        } else if (part.type === "tool_use" && typeof part.name === "string") {
          events.push({
            type: "tool_call",
            name: part.name,
            argsJson: JSON.stringify(part.input ?? part.arguments ?? {}),
          });
        } else if (part.type === "tool_result") {
          const summary =
            typeof part.content === "string"
              ? part.content.slice(0, 500)
              : JSON.stringify(part.content ?? "").slice(0, 500);
          events.push({
            type: "tool_result",
            ok: part.is_error !== true,
            summary,
            ...(typeof part.name === "string" ? { toolName: part.name } : {}),
          });
        }
      }
    } else if (typeof content === "string" && content.trim()) {
      events.push({ type: "assistant_message", text: content });
    }
  }

  if (!sawRole && hits < 1) {
    return {
      ok: false,
      kind: "format_mismatch",
      message: "not a Cursor agent-transcript JSONL",
    };
  }
  if (events.length === 0) {
    return {
      ok: false,
      kind: "parse_error",
      message: "no user/assistant messages found",
    };
  }

  const { events: capped, truncated } = truncateEvents(events);
  const session: IrSession = {
    sourceFormat: "cursor",
    events: capped,
  };
  if (truncated || sized.truncatedByBytes) session.truncated = true;
  return { ok: true, session };
}

function flattenText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
      parts.push(part.text);
    }
  }
  return parts.join("\n");
}

export function cursorSignatureHit(line: string): boolean {
  try {
    const row = JSON.parse(line) as unknown;
    if (!isRecord(row)) return false;
    if (row.role === "user" || row.role === "assistant") {
      return isRecord(row.message);
    }
    return false;
  } catch {
    return false;
  }
}
