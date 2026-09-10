# chatlang

**Your agent session, as source code.**

Paste a Claude Code / Codex / Cursor session → see it as a toy programming language (`turn`, `think`, `tool`, `say`).

> Status: v0.1 playground — paste or load a sample, see `chatlang` source.

## Monorepo

```
apps/playground/           # Vite + GitHub Pages
packages/ir/               # canonical session IR
packages/print/            # IR → chatlang text + tokens
packages/parse-claude/
packages/parse-codex/
packages/parse-cursor/
packages/fixtures/         # golden inputs (gate before parsers)
```

Local package names: `@chatlang/*` (in-repo only; no npm publish in v0.1).

## Git identity

**Commits and pushes must be `scs0209 <scs0209@users.noreply.github.com>` only** (not personal/work accounts). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Setup

```bash
pnpm install
pnpm test
pnpm dev   # playground
```

## Assignment (before parser code)

Drop real session files here:

| Path | Format |
|------|--------|
| `packages/fixtures/claude/golden.jsonl` | Claude Code |
| `packages/fixtures/codex/golden.jsonl` | Codex |
| `packages/fixtures/cursor/golden.jsonl` | Cursor |

Fill the field table in each folder’s `FIELD_TABLE.md`.

## Design

See [docs/designs/chatlang.md](docs/designs/chatlang.md).

## License

MIT
