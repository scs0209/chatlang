# chatlang

**Agent session → source code → roast.**

Paste Claude / Codex / Cursor JSONL. See it as `turn` / `think` / `tool` / `say`. Hit **Roast** — get a one-page takedown program.

> Status: v0.5 — **Roast** is the gimmick (`session roast; turn critic() { … }`).

## Live demo

https://scs0209.github.io/chatlang/

Opens on a Cursor sample and auto-roasts:

1. Left: raw session  
2. Right: `.chatlang` source  
3. Below: **🔥 roast title + punches + scores**  
4. Copy the critic program as code

## Example roast output

```chatlang
session roast;

// 검색중독 세션 진단서
turn critic() {
  say "도구 11번 호출. 손이 바빠야 유능해 보이는 그 심리.";
  say "Web* ×5. 검색창에 살다 온 에이전트.";
  say "한 줄 평: 리서치 인턴 모드.";
  tool Score("{\"chaos\":9,\"focus\":2,\"drama\":4}");
}
```

## Setup

```bash
pnpm install
pnpm test
pnpm dev
```

## License

MIT
