# chatlang

**Agent session → `.chatlang` source → roast by YOUR local agent.**

No cloud API keys in the app. Roast runs through a **localhost bridge** that shells out to `claude` or `codex` on your machine.

## How roast works

```
playground (pnpm dev)
    → POST http://127.0.0.1:3847/roast
    → chatlang-bridge
    → claude -p …   or   codex exec …
    → critic JSON → session roast; turn critic() { … }
```

GitHub Pages (HTTPS) **cannot** call `http://127.0.0.1` (browser mixed-content). Use local:

```bash
pnpm install
pnpm bridge    # terminal 1 — needs claude or codex on PATH
pnpm dev       # terminal 2 — open the printed localhost URL
```

Then **Roast with local agent**.

## Live demo (parse only)

https://scs0209.github.io/chatlang/ — JSONL→source works; roast needs the local bridge.

## Monorepo

```
apps/playground/     # UI
apps/bridge/         # local agent roast server
packages/lang/       # grammar, parser, (offline heuristic kept for tests)
packages/parse-*/
docs/grammar.md
```

## Git identity

Commits/pushes: `scs0209 <scs0209@users.noreply.github.com>` only. See CONTRIBUTING.md.

## License

MIT
