export type TokKind =
  | "keyword"
  | "ident"
  | "string"
  | "punct"
  | "comment"
  | "eof";

export interface Tok {
  kind: TokKind;
  value: string;
  /** UTF-16 start offset into source. */
  start: number;
  end: number;
}

const KEYWORDS = new Set([
  "session",
  "turn",
  "user",
  "agent",
  "say",
  "think",
  "tool",
  "result",
  "ok",
  "err",
  "meta",
]);

export class LexError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
    this.name = "LexError";
  }
}

/** Lexer for chatlang source (see docs/grammar.md). */
export function tokenize(source: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;

  const push = (kind: TokKind, value: string, start: number, end: number) => {
    toks.push({ kind, value, start, end });
  };

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i += 1;
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      const start = i;
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      push("comment", source.slice(start, i), start, i);
      continue;
    }

    if (ch === '"' ) {
      const start = i;
      i += 1;
      let escaped = false;
      while (i < source.length) {
        const c = source[i]!;
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (c === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      const raw = source.slice(start, i);
      try {
        const value = JSON.parse(raw) as string;
        push("string", value, start, i);
      } catch {
        throw new LexError(`invalid string literal at ${start}`, start);
      }
      continue;
    }

    if ("(){};=".includes(ch)) {
      push("punct", ch, i, i + 1);
      i += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i]!)) i += 1;
      const value = source.slice(start, i);
      push(KEYWORDS.has(value) ? "keyword" : "ident", value, start, i);
      continue;
    }

    throw new LexError(`unexpected character ${JSON.stringify(ch)} at ${i}`, i);
  }

  push("eof", "", i, i);
  return toks;
}
