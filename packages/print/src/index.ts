import type { IrEvent, IrSession } from "@chatlang/ir";

export type TokenType = "keyword" | "ident" | "string" | "comment" | "punct";

export interface Token {
  /** UTF-16 code unit offset into `text` (inclusive start). */
  start: number;
  /** UTF-16 code unit offset into `text` (exclusive end). */
  end: number;
  type: TokenType;
}

export interface EmitResult {
  text: string;
  tokens: Token[];
}

const TOOL_RESULT_PRINT_CAP = 20;

/** JSON-style string literal for chatlang source. */
export function escapeChatlangString(value: string): string {
  return JSON.stringify(value);
}

class Emitter {
  text = "";
  tokens: Token[] = [];

  push(raw: string, type?: TokenType): void {
    const start = this.text.length;
    this.text += raw;
    if (type) {
      this.tokens.push({ start, end: this.text.length, type });
    }
  }

  nl(): void {
    this.text += "\n";
  }
}

function emitToolResults(
  e: Emitter,
  results: Extract<IrEvent, { type: "tool_result" }>[],
): void {
  const shown = results.slice(0, TOOL_RESULT_PRINT_CAP);
  for (const r of shown) {
    e.push("  ", undefined);
    e.push("result", "keyword");
    e.push(" ", undefined);
    e.push(r.ok ? "ok" : "err", "ident");
    e.push(" ", undefined);
    e.push(escapeChatlangString(r.summary), "string");
    e.nl();
  }
  const omitted = results.length - shown.length;
  if (omitted > 0) {
    e.push(`  // omitted: tool_result×${omitted}`, "comment");
    e.nl();
  }
}

/**
 * Print IR as chatlang source.
 * Statement terminator: newline only. tool Ident(stringLiteral) only.
 * tool_result omission is print-only (first 20).
 */
export function emit(ir: IrSession): EmitResult {
  const e = new Emitter();
  e.push(`// session · format: ${ir.sourceFormat}`, "comment");
  e.nl();
  if (ir.truncated) {
    e.push("// truncated: soft size cap applied", "comment");
    e.nl();
  }
  e.nl();

  let i = 0;
  const events = ir.events;

  while (i < events.length) {
    const ev = events[i];
    if (!ev) break;

    if (ev.type === "meta") {
      e.push(`// meta ${ev.key}=${ev.value}`, "comment");
      e.nl();
      i += 1;
      continue;
    }

    if (ev.type === "user_message") {
      e.push("turn", "keyword");
      e.push(" ", undefined);
      e.push("user", "ident");
      e.push("()", "punct");
      e.push(" {", "punct");
      e.nl();
      e.push("  ", undefined);
      e.push("say", "keyword");
      e.push(" ", undefined);
      e.push(escapeChatlangString(ev.text), "string");
      e.nl();
      e.push("}", "punct");
      e.nl();
      e.nl();
      i += 1;
      continue;
    }

    // agent turn: consume thinking / tool_call / tool_result / assistant_message until next user
    if (
      ev.type === "thinking" ||
      ev.type === "tool_call" ||
      ev.type === "tool_result" ||
      ev.type === "assistant_message"
    ) {
      e.push("turn", "keyword");
      e.push(" ", undefined);
      e.push("agent", "ident");
      e.push("()", "punct");
      e.push(" {", "punct");
      e.nl();

      const pendingResults: Extract<IrEvent, { type: "tool_result" }>[] = [];

      while (i < events.length) {
        const cur = events[i];
        if (!cur || cur.type === "user_message" || cur.type === "meta") break;

        if (cur.type === "thinking") {
          flushResults(e, pendingResults);
          e.push("  ", undefined);
          e.push("think", "keyword");
          e.push(" ", undefined);
          e.push(escapeChatlangString(cur.text), "string");
          e.nl();
        } else if (cur.type === "tool_call") {
          flushResults(e, pendingResults);
          e.push("  ", undefined);
          e.push("tool", "keyword");
          e.push(" ", undefined);
          e.push(sanitizeIdent(cur.name), "ident");
          e.push("(", "punct");
          e.push(escapeChatlangString(cur.argsJson), "string");
          e.push(")", "punct");
          e.nl();
        } else if (cur.type === "tool_result") {
          pendingResults.push(cur);
        } else if (cur.type === "assistant_message") {
          flushResults(e, pendingResults);
          e.push("  ", undefined);
          e.push("say", "keyword");
          e.push(" ", undefined);
          e.push(escapeChatlangString(cur.text), "string");
          e.nl();
        }
        i += 1;
      }

      flushResults(e, pendingResults);
      e.push("}", "punct");
      e.nl();
      e.nl();
      continue;
    }

    i += 1;
  }

  return { text: e.text, tokens: e.tokens };
}

function flushResults(
  e: Emitter,
  pending: Extract<IrEvent, { type: "tool_result" }>[],
): void {
  if (pending.length === 0) return;
  emitToolResults(e, pending.splice(0, pending.length));
}

function sanitizeIdent(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
  return cleaned.length > 0 ? cleaned : "Tool";
}
