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

function textsFromCodexContent(content: unknown): string[] {
  if (typeof content === "string") return content.trim() ? [content] : [];
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const part of content) {
    if (!isRecord(part)) continue;
    if (
      (part.type === "input_text" || part.type === "output_text" || part.type === "text") &&
      typeof part.text === "string" &&
      part.text.trim()
    ) {
      out.push(part.text);
    }
  }
  return out;
}

/**
 * Parse Codex rollout JSONL into IR.
 * Fixture: packages/fixtures/codex/golden.jsonl
 */
export function parseCodex(input: string): ParseResult {
  const sized = gateInputSize(input);
  if (!sized.ok) {
    return { ok: false, kind: "too_large", message: sized.message };
  }

  const lines = sized.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { ok: false, kind: "parse_error", message: "empty input" };
  }

  let hits = 0;
  let sawResponseItem = false;
  const events: IrEvent[] = [];

  for (const line of lines) {
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      return { ok: false, kind: "parse_error", message: "invalid JSONL line" };
    }
    if (!isRecord(row)) continue;
    if (codexSignatureHit(line)) hits += 1;

    if (row.type === "session_meta" && isRecord(row.payload)) {
      const id = row.payload.id;
      if (typeof id === "string") {
        events.push({ type: "meta", key: "session_id", value: id });
      }
      continue;
    }

    if (row.type !== "response_item") continue;
    const payload = row.payload;
    if (!isRecord(payload)) continue;
    if (payload.type !== "message") continue;
    sawResponseItem = true;

    const role = payload.role;
    const texts = textsFromCodexContent(payload.content);
    if (texts.length === 0) continue;
    const text = texts.join("\n");

    if (role === "user") {
      events.push({ type: "user_message", text });
    } else if (role === "assistant") {
      events.push({ type: "assistant_message", text });
    } else if (role === "developer" || role === "system") {
      // keep short stub as meta, avoid dumping huge AGENTS.md into source
      events.push({
        type: "meta",
        key: String(role),
        value: text.slice(0, 120).replace(/\s+/g, " "),
      });
    }
  }

  if (!sawResponseItem && hits < 1) {
    return {
      ok: false,
      kind: "format_mismatch",
      message: "not a Codex rollout JSONL",
    };
  }

  const dialogue = events.filter(
    (e) => e.type === "user_message" || e.type === "assistant_message",
  );
  if (dialogue.length === 0) {
    return {
      ok: false,
      kind: "parse_error",
      message: "no user/assistant messages found",
    };
  }

  const { events: capped, truncated } = truncateEvents(events);
  const session: IrSession = {
    sourceFormat: "codex",
    events: capped,
  };
  if (truncated || sized.truncatedByBytes) session.truncated = true;
  return { ok: true, session };
}

export function codexSignatureHit(line: string): boolean {
  try {
    const row = JSON.parse(line) as unknown;
    if (!isRecord(row)) return false;
    if (row.type === "session_meta") {
      return isRecord(row.payload);
    }
    if (row.type === "response_item" || row.type === "event_msg") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
