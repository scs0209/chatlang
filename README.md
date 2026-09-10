# chatlang

**A toy programming language for agent sessions.**

Paste Claude Code / Codex / Cursor JSONL **or** write `.chatlang` source — then **Run** it.

> Status: v0.3 — grammar + parser + **interpreter** (`interpret` / playground Run).

## Monorepo

```
apps/playground/           # Vite + GitHub Pages
packages/ir/               # canonical session IR
packages/lang/             # lexer, parser, interpreter
packages/print/            # IR → chatlang text + tokens
packages/parse-claude/
packages/parse-codex/
packages/parse-cursor/
packages/fixtures/         # golden JSONL inputs
docs/grammar.md            # EBNF + runtime
```

Local package names: `@chatlang/*` (in-repo only; no npm publish yet).

## Git identity

**Commits and pushes must be `scs0209 <scs0209@users.noreply.github.com>` only** (not personal/work accounts). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Live demo

https://scs0209.github.io/chatlang/

1. Open **`.chatlang`** or click **hello.chatlang**
2. Press **Run** — transcript appears (live builtins: `Echo`, `Upper`, `Len`)
3. Or load a Claude/Codex/Cursor sample and **Run** in replay mode

## Example

```chatlang
session claude;

turn user() {
  say "ping the runtime";
}

turn agent() {
  think "use a live builtin";
  tool Echo("{\"msg\":\"hello from chatlang\"}");
  say "done";
}
```

## Roadmap

- **v0.1:** JSONL → IR → printable source
- **v0.2:** grammar + `@chatlang/lang` parser; round-trip
- **v0.3 (now):** interpreter (replay / live) + playground Run
- **Later:** packages/stdlib growth; optional Rust→WASM

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
