# chatlang

**A toy programming language for agent sessions.**

Paste Claude Code / Codex / Cursor JSONL **or** write `.chatlang` source — then **Run** it.

> Status: v0.4 — **Run mutates a virtual workspace** (Read/Write/Shell sandbox).

## Live demo

https://scs0209.github.io/chatlang/

Page opens on **hello.chatlang** and auto-runs:

1. Source shows `tool Write` / `Read` / `Shell`
2. **Transcript** shows host execution
3. **Virtual files** gains `hello.txt`
4. **Console** shows `ls` output

That’s the gimmick: the converted language *does* something.

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
