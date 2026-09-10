# chatlang

**A toy programming language for agent sessions.**

Paste Claude Code / Codex / Cursor JSONL **or** write `.chatlang` source — `session`, `turn`, `think`, `tool`, `say`.

> Status: v0.2 — real grammar + lexer/parser (`@chatlang/lang`) + playground.

## Monorepo

```
apps/playground/           # Vite + GitHub Pages
packages/ir/               # canonical session IR
packages/lang/             # .chatlang lexer + parser → IR
packages/print/            # IR → chatlang text + tokens
packages/parse-claude/
packages/parse-codex/
packages/parse-cursor/
packages/fixtures/         # golden JSONL inputs
docs/grammar.md            # EBNF
```

Local package names: `@chatlang/*` (in-repo only; no npm publish yet).

## Git identity

**Commits and pushes must be `scs0209 <scs0209@users.noreply.github.com>` only** (not personal/work accounts). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Live demo

https://scs0209.github.io/chatlang/

Try the **`.chatlang`** tab or sample **hello.chatlang**.

## Example

```chatlang
session claude;

turn user() {
  say "fix the flaky test";
}

turn agent() {
  think "check cookie expiry";
  tool Read("{\"path\":\"src/auth.test.ts\"}");
  result ok "file contents…";
  say "added null check";
}
```

## Roadmap

- **v0.1:** JSONL → IR → printable source (TypeScript).
- **v0.2 (now):** grammar + `@chatlang/lang` parser; emit↔parse round-trip; playground `.chatlang` mode.
- **Later:** interpreter / packages; optional Rust→WASM for the source grammar.

## Setup

```bash
pnpm install
pnpm test
pnpm dev   # playground
```

## Design

See [docs/designs/chatlang.md](docs/designs/chatlang.md) and [docs/grammar.md](docs/grammar.md).

## License

MIT
