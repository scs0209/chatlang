import type { IrEvent, IrSession, SourceFormat } from "@chatlang/ir";
import { LexError, tokenize, type Tok } from "./tokenize.js";

export type ParseOk = { ok: true; session: IrSession };
export type ParseErr = {
  ok: false;
  kind: "parse_error" | "format_mismatch";
  message: string;
  offset?: number;
};
export type ParseResult = ParseOk | ParseErr;

const FORMATS = new Set<SourceFormat>(["claude", "codex", "cursor"]);

export class ParseError extends Error {
  constructor(
    message: string,
    readonly offset?: number,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Parse chatlang source into IR.
 * Grammar: docs/grammar.md
 */
export function parseChatlang(source: string): ParseResult {
  const text = source.trim();
  if (!text) {
    return { ok: false, kind: "parse_error", message: "empty input" };
  }

  // Quick reject for JSONL session dumps
  if (text.startsWith("{") || text.startsWith("[")) {
    return {
      ok: false,
      kind: "format_mismatch",
      message: "looks like JSON/JSONL, not chatlang source",
    };
  }

  let toks: Tok[];
  try {
    toks = tokenize(source);
  } catch (err) {
    if (err instanceof LexError) {
      return {
        ok: false,
        kind: "parse_error",
        message: err.message,
        offset: err.offset,
      };
    }
    throw err;
  }

  const p = new Parser(toks);
  try {
    const session = p.parseProgram();
    if (session.events.length === 0) {
      return {
        ok: false,
        kind: "parse_error",
        message: "no turns found in chatlang source",
      };
    }
    return { ok: true, session };
  } catch (err) {
    if (err instanceof ParseError) {
      const out: ParseErr = {
        ok: false,
        kind: "parse_error",
        message: err.message,
      };
      if (err.offset !== undefined) out.offset = err.offset;
      return out;
    }
    throw err;
  }
}

/** True if the text looks like chatlang source (not JSONL). */
export function chatlangSignatureHit(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let hits = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("//")) continue;
    if (/^session\s+\w+/.test(t)) hits += 2;
    else if (/^turn\s+(user|agent)\s*\(/.test(t)) hits += 2;
    else if (/^(say|think|tool|result|meta)\b/.test(t)) hits += 1;
  }
  return hits >= 2;
}

class Parser {
  private i = 0;

  constructor(private readonly toks: Tok[]) {}

  parseProgram(): IrSession {
    let sourceFormat: SourceFormat = "claude";
    let truncated = false;
    const events: IrEvent[] = [];

    while (!this.check("eof")) {
      if (this.check("comment")) {
        const c = this.advance().value;
        if (c.includes("truncated")) truncated = true;
        // legacy: // session · format: claude
        const m = c.match(/session\s*[·.\-:]?\s*format:\s*(\w+)/i);
        if (m && FORMATS.has(m[1] as SourceFormat)) {
          sourceFormat = m[1] as SourceFormat;
        }
        continue;
      }

      if (this.checkKw("session")) {
        this.advance();
        const fmtTok = this.expectIdentOrKw();
        if (!FORMATS.has(fmtTok.value as SourceFormat)) {
          throw new ParseError(
            `unknown session format ${fmtTok.value}`,
            fmtTok.start,
          );
        }
        sourceFormat = fmtTok.value as SourceFormat;
        this.optionalSemi();
        continue;
      }

      if (this.checkKw("meta")) {
        events.push(this.parseMeta());
        continue;
      }

      if (this.checkKw("turn")) {
        events.push(...this.parseTurn());
        continue;
      }

      const t = this.peek();
      throw new ParseError(
        `unexpected ${t.kind} ${JSON.stringify(t.value)}`,
        t.start,
      );
    }

    const session: IrSession = { sourceFormat, events };
    if (truncated) session.truncated = true;
    return session;
  }

  private parseMeta(): IrEvent {
    this.expectKw("meta");
    const key = this.expectIdentOrKw().value;
    this.expectPunct("=");
    const value = this.expectString();
    this.optionalSemi();
    return { type: "meta", key, value };
  }

  private parseTurn(): IrEvent[] {
    this.expectKw("turn");
    const roleTok = this.peek();
    if (!this.checkKw("user") && !this.checkKw("agent")) {
      throw new ParseError(`expected user or agent`, roleTok.start);
    }
    const role = this.advance().value as "user" | "agent";
    this.expectPunct("(");
    this.expectPunct(")");
    this.expectPunct("{");

    const body: IrEvent[] = [];
    while (!this.checkPunct("}") && !this.check("eof")) {
      if (this.check("comment")) {
        this.advance();
        continue;
      }
      if (this.checkKw("say")) {
        this.advance();
        const text = this.expectString();
        this.optionalSemi();
        body.push(
          role === "user"
            ? { type: "user_message", text }
            : { type: "assistant_message", text },
        );
        continue;
      }
      if (this.checkKw("think")) {
        this.advance();
        const text = this.expectString();
        this.optionalSemi();
        body.push({ type: "thinking", text });
        continue;
      }
      if (this.checkKw("tool")) {
        this.advance();
        const name = this.expectIdentOrKw().value;
        this.expectPunct("(");
        const argsJson = this.expectString();
        this.expectPunct(")");
        this.optionalSemi();
        body.push({ type: "tool_call", name, argsJson });
        continue;
      }
      if (this.checkKw("result")) {
        this.advance();
        if (!this.checkKw("ok") && !this.checkKw("err")) {
          throw new ParseError(`expected ok or err`, this.peek().start);
        }
        const ok = this.advance().value === "ok";
        const summary = this.expectString();
        this.optionalSemi();
        body.push({ type: "tool_result", ok, summary });
        continue;
      }
      throw new ParseError(
        `unexpected in turn body: ${this.peek().value}`,
        this.peek().start,
      );
    }
    this.expectPunct("}");

    if (role === "user") {
      // user turn: only user_message events (say)
      return body.filter((e) => e.type === "user_message");
    }
    return body;
  }

  private peek(): Tok {
    return this.toks[this.i] ?? this.toks[this.toks.length - 1]!;
  }

  private advance(): Tok {
    const t = this.peek();
    if (t.kind !== "eof") this.i += 1;
    return t;
  }

  private check(kind: Tok["kind"]): boolean {
    return this.peek().kind === kind;
  }

  private checkKw(value: string): boolean {
    const t = this.peek();
    return t.kind === "keyword" && t.value === value;
  }

  private checkPunct(value: string): boolean {
    const t = this.peek();
    return t.kind === "punct" && t.value === value;
  }

  private expectKw(value: string): Tok {
    if (!this.checkKw(value)) {
      throw new ParseError(`expected ${value}`, this.peek().start);
    }
    return this.advance();
  }

  private expectPunct(value: string): Tok {
    if (!this.checkPunct(value)) {
      throw new ParseError(`expected '${value}'`, this.peek().start);
    }
    return this.advance();
  }

  private expectString(): string {
    if (!this.check("string")) {
      throw new ParseError(`expected string`, this.peek().start);
    }
    return this.advance().value;
  }

  private expectIdentOrKw(): Tok {
    const t = this.peek();
    if (t.kind !== "ident" && t.kind !== "keyword") {
      throw new ParseError(`expected identifier`, t.start);
    }
    return this.advance();
  }

  private optionalSemi(): void {
    if (this.checkPunct(";")) this.advance();
  }
}
