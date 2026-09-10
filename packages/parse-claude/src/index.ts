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

type ContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  id?: string;
  content?: unknown;
  is_error?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractTextBlocks(content: unknown): IrEvent[] {
  const out: IrEvent[] = [];
  if (typeof content === "string") {
    if (content.trim()) out.push({ type: "assistant_message", text: content });
    return out;
  }
  if (!Array.isArray(content)) return out;
  for (const raw of content) {
    if (!isRecord(raw)) continue;
    const b = raw as ContentBlock;
    if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
      out.push({ type: "assistant_message", text: b.text });
    } else if (b.type === "thinking") {
      const t =
        typeof b.thinking === "string"
          ? b.thinking
          : typeof b.text === "string"
            ? b.text
            : "";
      if (t.trim()) out.push({ type: "thinking", text: t });
    } else if (b.type === "tool_use" && typeof b.name === "string") {
      out.push({
        type: "tool_call",
        name: b.name,
        argsJson: JSON.stringify(b.input ?? {}),
      });
    } else if (b.type === "tool_result") {
      const summary =
        typeof b.content === "string"
          ? b.content.slice(0, 500)
          : JSON.stringify(b.content ?? "").slice(0, 500);
      const ev: IrEvent = {
        type: "tool_result",
        ok: !b.is_error,
        summary,
      };
      if (typeof b.name === "string") {
        (ev as { toolName?: string }).toolName = b.name;
      }
      out.push(ev);
    }
  }
  return out;
}

/**
 * Parse Claude Code session JSONL into IR.
 * Fixture contract: packages/fixtures/claude/golden.jsonl
 */
export function parseClaude(input: string): ParseResult {
  const sized = gateInputSize(input);
  if (!sized.ok) {
    return { ok: false, kind: "too_large", message: sized.message };
  }

  const lines = sized.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { ok: false, kind: "parse_error", message: "empty input" };
  }

  let hits = 0;
  let parsedAny = false;
  const events: IrEvent[] = [];

  for (const line of lines) {
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      return {
        ok: false,
        kind: "parse_error",
        message: "invalid JSONL line",
      };
    }
    if (!isRecord(row)) continue;
    if (claudeSignatureHit(line)) hits += 1;

    const type = row.type;
    if (type !== "user" && type !== "assistant") continue;
    parsedAny = true;

    const message = row.message;
    if (!isRecord(message)) continue;
    const role = message.role;
    const content = message.content;

    if (type === "user" || role === "user") {
      if (typeof content === "string") {
        if (content.trim()) events.push({ type: "user_message", text: content });
      } else {
        // rare: user content as blocks — flatten text
        const texts = extractTextBlocks(content)
          .filter((e) => e.type === "assistant_message")
          .map((e) => (e.type === "assistant_message" ? e.text : ""));
        const joined = texts.join("\n").trim();
        if (joined) events.push({ type: "user_message", text: joined });
      }
      continue;
    }

    // assistant
    events.push(...extractTextBlocks(content));
  }

  if (!parsedAny && hits < 1) {
    return {
      ok: false,
      kind: "format_mismatch",
      message: "not a Claude Code session JSONL",
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
    sourceFormat: "claude",
    events: capped,
  };
  if (truncated || sized.truncatedByBytes) session.truncated = true;
  return { ok: true, session };
}

/** Line-level detect signature (max one hit per line by caller). */
export function claudeSignatureHit(line: string): boolean {
  try {
    const row = JSON.parse(line) as unknown;
    if (!isRecord(row)) return false;
    if (row.type === "user" || row.type === "assistant") {
      return typeof row.sessionId === "string" || isRecord(row.message);
    }
    return typeof row.sessionId === "string" && isRecord(row.message);
  } catch {
    return false;
  }
}
