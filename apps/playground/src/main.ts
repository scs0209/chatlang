import "./style.css";
import type { IrSession, SourceFormat } from "@chatlang/ir";
import { parseClaude, claudeSignatureHit } from "@chatlang/parse-claude";
import { parseCodex, codexSignatureHit } from "@chatlang/parse-codex";
import { parseCursor, cursorSignatureHit } from "@chatlang/parse-cursor";
import { parseChatlang, chatlangSignatureHit } from "@chatlang/lang";
import { emit, type Token } from "@chatlang/print";

import sampleClaude from "../../../packages/fixtures/claude/golden.jsonl?raw";
import sampleCodex from "../../../packages/fixtures/codex/golden.jsonl?raw";
import sampleCursor from "../../../packages/fixtures/cursor/golden.jsonl?raw";

type InputMode = SourceFormat | "chatlang";

type UiState =
  | "empty"
  | "detecting"
  | "ok"
  | "format_mismatch"
  | "parse_error"
  | "too_large"
  | "roasted"
  | "bridge";

const BRIDGE_URL =
  import.meta.env.VITE_CHATLANG_BRIDGE ?? "http://127.0.0.1:3847";

const SAMPLE_CHATLANG = `session claude;

turn user() {
  say "이 레포 구조 파악해줘. 급해.";
}

turn agent() {
  think "일단 파일 전부 읽은 다음 웹도 보고 생각해보자. 계획은 거창하게.";
  tool Read("{\\"path\\":\\"a.ts\\"}");
  tool Read("{\\"path\\":\\"b.ts\\"}");
  tool Read("{\\"path\\":\\"c.ts\\"}");
  tool WebFetch("{\\"url\\":\\"https://example.com\\"}");
  tool WebSearch("{\\"search_term\\":\\"how to code\\"}");
  say "음… 복잡한데요.";
}
`;

const SAMPLES: Record<InputMode, string> = {
  claude: sampleClaude,
  codex: sampleCodex,
  cursor: sampleCursor,
  chatlang: SAMPLE_CHATLANG,
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

let format: InputMode = "cursor";
let lastSession: IrSession | null = null;
let lastRoastSource = "";
let bridgeOk = false;
let bridgeAgents = "";

app.innerHTML = `
  <div class="frame">
    <header>
      <h1 class="brand">chatlang</h1>
      <p class="tag">세션 → <code>.chatlang</code> → <strong>로컬 에이전트</strong>가 Roast.
        클라우드 API 키 없음. <code>pnpm bridge</code> + 로컬 <code>claude</code>/<code>codex</code>.</p>
      <div class="formats" id="formats">
        <button type="button" data-format="claude">Claude</button>
        <button type="button" data-format="codex">Codex</button>
        <button type="button" data-format="cursor" class="on">Cursor</button>
        <button type="button" data-format="chatlang">.chatlang</button>
      </div>
      <div class="bridge-bar" id="bridge-bar">bridge: checking…</div>
    </header>
    <main>
      <section class="pane">
        <div class="label">Input</div>
        <textarea id="input" placeholder="JSONL session or .chatlang source…"></textarea>
        <div class="samples" id="samples">
          <button type="button" data-sample="cursor">cursor-multifile</button>
          <button type="button" data-sample="claude">debug-claude</button>
          <button type="button" data-sample="codex">debug-codex</button>
          <button type="button" data-sample="chatlang">chaos.chatlang</button>
        </div>
        <div class="status" id="status"></div>
      </section>
      <section class="pane">
        <div class="label">Source</div>
        <div class="code" id="output">// load a sample</div>
        <div class="actions">
          <button type="button" class="primary" id="run">Roast with local agent ▶</button>
          <button type="button" id="copy-roast">Copy roast</button>
          <button type="button" id="copy">Copy source</button>
          <button type="button" id="download">Download .chatlang</button>
        </div>
        <div class="label">Roast</div>
        <div class="roast" id="roast">
          <div class="roast-title" id="roast-title">// connect bridge, then Roast</div>
          <ol class="roast-lines" id="roast-lines"></ol>
          <div class="roast-score" id="roast-score"></div>
        </div>
        <div class="label">Roast as code</div>
        <pre class="trace roast-src" id="roast-src">// critic program from your local agent</pre>
      </section>
    </main>
    <footer>MIT · roast via localhost bridge → claude/codex CLI · not cloud API keys</footer>
  </div>
`;

const input = document.querySelector<HTMLTextAreaElement>("#input")!;
const output = document.querySelector<HTMLDivElement>("#output")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const formats = document.querySelector<HTMLDivElement>("#formats")!;
const samples = document.querySelector<HTMLDivElement>("#samples")!;
const copyBtn = document.querySelector<HTMLButtonElement>("#copy")!;
const copyRoastBtn = document.querySelector<HTMLButtonElement>("#copy-roast")!;
const downloadBtn = document.querySelector<HTMLButtonElement>("#download")!;
const runBtn = document.querySelector<HTMLButtonElement>("#run")!;
const roastTitle = document.querySelector<HTMLDivElement>("#roast-title")!;
const roastLines = document.querySelector<HTMLOListElement>("#roast-lines")!;
const roastScore = document.querySelector<HTMLDivElement>("#roast-score")!;
const roastSrc = document.querySelector<HTMLPreElement>("#roast-src")!;
const bridgeBar = document.querySelector<HTMLDivElement>("#bridge-bar")!;

formats.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLButtonElement)) return;
  const next = t.dataset.format as InputMode | undefined;
  if (!next) return;
  format = next;
  for (const btn of formats.querySelectorAll("button")) {
    btn.classList.toggle("on", btn === t);
  }
  render();
});

samples.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLButtonElement)) return;
  const key = t.dataset.sample as InputMode | undefined;
  if (!key) return;
  format = key;
  for (const btn of formats.querySelectorAll("button")) {
    btn.classList.toggle("on", btn.getAttribute("data-format") === key);
  }
  input.value = SAMPLES[key];
  render();
});

input.addEventListener("input", () => {
  maybeAutodetect(input.value);
  render();
});

copyBtn.addEventListener("click", async () => {
  const text = output.dataset.raw ?? output.textContent ?? "";
  await navigator.clipboard.writeText(text);
  status.textContent = "Source copied.";
});

copyRoastBtn.addEventListener("click", async () => {
  const text = lastRoastSource || roastSrc.textContent || "";
  await navigator.clipboard.writeText(text);
  status.textContent = "Roast program copied.";
});

downloadBtn.addEventListener("click", () => {
  const text = lastRoastSource || output.dataset.raw || "";
  if (!text.trim()) {
    status.textContent = "Nothing to download.";
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `roast.${format}.chatlang`;
  a.click();
  URL.revokeObjectURL(url);
  status.textContent = "Downloaded roast .chatlang";
});

runBtn.addEventListener("click", () => {
  void runRoast();
});

function clearRoast(msg = "// connect bridge, then Roast"): void {
  lastRoastSource = "";
  roastTitle.textContent = msg;
  roastLines.innerHTML = "";
  roastScore.textContent = "";
  roastSrc.textContent = "// critic program from your local agent";
}

async function probeBridge(): Promise<void> {
  try {
    const r = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    const data = (await r.json()) as {
      ok?: boolean;
      agents?: { id: string; available: boolean }[];
    };
    bridgeOk = !!data.ok;
    const agents = (data.agents ?? [])
      .map((a) => `${a.id}${a.available ? "✓" : "✗"}`)
      .join(" ");
    bridgeAgents = agents;
    bridgeBar.textContent = bridgeOk
      ? `bridge online @ ${BRIDGE_URL} · ${agents || "no agents"}`
      : `bridge offline — run: pnpm bridge`;
    bridgeBar.classList.toggle("on", bridgeOk);
  } catch {
    bridgeOk = false;
    bridgeBar.textContent =
      "bridge offline — local only: pnpm bridge  (GitHub Pages cannot reach localhost)";
    bridgeBar.classList.remove("on");
  }
}

async function runRoast(): Promise<void> {
  if (!lastSession) {
    clearRoast("// nothing to roast — fix parse errors first");
    setState("parse_error", "no session to roast");
    return;
  }

  await probeBridge();
  if (!bridgeOk) {
    clearRoast("// bridge offline");
    roastLines.innerHTML = `<li>로컬에서 <code>pnpm bridge</code> 실행 후 다시 Roast</li>
      <li>PATH에 <code>claude</code> 또는 <code>codex</code> CLI 필요</li>
      <li>GitHub Pages(HTTPS)→localhost는 브라우저가 막아, <code>pnpm dev</code>에서 써야 함</li>`;
    setState("bridge", "local agent bridge required");
    return;
  }

  roastTitle.textContent = "🔥 roasting via local agent…";
  roastLines.innerHTML = "";
  roastScore.textContent = bridgeAgents;
  setState("bridge", "waiting on local agent…");
  runBtn.disabled = true;

  try {
    const chatlang = output.dataset.raw ?? emit(lastSession).text;
    const res = await fetch(`${BRIDGE_URL}/roast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "auto",
        chatlang,
        session: lastSession,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      title?: string;
      lines?: string[];
      score?: { chaos: number; focus: number; drama: number };
      source?: string;
      provider?: string;
    };

    if (!res.ok || !data.ok) {
      clearRoast("// local agent failed");
      roastLines.innerHTML = `<li>${escapeHtml(data.error ?? res.statusText)}</li>`;
      setState("parse_error", data.error ?? "roast failed");
      return;
    }

    lastRoastSource = data.source ?? "";
    roastTitle.textContent = `🔥 ${data.title ?? "roast"} · via ${data.provider ?? "local"}`;
    roastLines.innerHTML = (data.lines ?? [])
      .map((l) => `<li>${escapeHtml(l)}</li>`)
      .join("");
    const s = data.score ?? { chaos: 0, focus: 0, drama: 0 };
    roastScore.textContent = `chaos ${s.chaos} · focus ${s.focus} · drama ${s.drama} · ${data.provider}`;
    roastSrc.textContent = data.source ?? "";
    setState("roasted", `via ${data.provider} · ${(data.lines ?? []).length} punches`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    clearRoast("// bridge request failed");
    roastLines.innerHTML = `<li>${escapeHtml(message)}</li>`;
    setState("parse_error", message);
  } finally {
    runBtn.disabled = false;
  }
}

function maybeAutodetect(text: string): void {
  if (chatlangSignatureHit(text)) {
    format = "chatlang";
    for (const btn of formats.querySelectorAll("button")) {
      btn.classList.toggle("on", btn.getAttribute("data-format") === "chatlang");
    }
    return;
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 50);
  const scores: Record<SourceFormat, number> = { claude: 0, codex: 0, cursor: 0 };
  for (const line of lines) {
    if (claudeSignatureHit(line)) scores.claude += 1;
    else if (codexSignatureHit(line)) scores.codex += 1;
    else if (cursorSignatureHit(line)) scores.cursor += 1;
  }
  const ranked = (Object.entries(scores) as [SourceFormat, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const [best, bestScore] = ranked[0]!;
  const second = ranked[1]?.[1] ?? 0;
  if (bestScore >= 3 && bestScore > second) {
    format = best;
    for (const btn of formats.querySelectorAll("button")) {
      btn.classList.toggle("on", btn.getAttribute("data-format") === best);
    }
  }
}

function parseFor(fmt: InputMode, text: string) {
  if (fmt === "chatlang") return parseChatlang(text);
  if (fmt === "claude") return parseClaude(text);
  if (fmt === "codex") return parseCodex(text);
  return parseCursor(text);
}

function renderHighlighted(text: string, tokens: Token[]): string {
  if (tokens.length === 0) return escapeHtml(text);
  const parts: string[] = [];
  let cursor = 0;
  const sorted = [...tokens].sort((a, b) => a.start - b.start);
  for (const tok of sorted) {
    if (tok.start < cursor) continue;
    if (tok.start > cursor) parts.push(escapeHtml(text.slice(cursor, tok.start)));
    parts.push(
      `<span class="tok-${tok.type}">${escapeHtml(text.slice(tok.start, tok.end))}</span>`,
    );
    cursor = tok.end;
  }
  if (cursor < text.length) parts.push(escapeHtml(text.slice(cursor)));
  return parts.join("");
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function setState(state: UiState, message: string): void {
  status.textContent = `[${state}] ${message}`;
}

function render(): void {
  const text = input.value;
  if (!text.trim()) {
    lastSession = null;
    output.innerHTML = escapeHtml("// load a sample or paste a session");
    output.dataset.raw = "";
    clearRoast();
    setState("empty", "waiting for input");
    return;
  }

  setState("detecting", `format tab: ${format}`);
  try {
    const result = parseFor(format, text);
    if (!result.ok) {
      lastSession = null;
      const state: UiState =
        result.kind === "format_mismatch"
          ? "format_mismatch"
          : result.kind === "too_large"
            ? "too_large"
            : "parse_error";
      output.textContent = `// ${result.message}`;
      output.dataset.raw = output.textContent;
      clearRoast();
      setState(state, result.message);
      return;
    }

    lastSession = result.session;
    const emitted = emit(result.session);
    output.innerHTML = renderHighlighted(emitted.text, emitted.tokens);
    output.dataset.raw = emitted.text;
    const via =
      format === "chatlang" ? "parsed .chatlang" : `from ${format} JSONL`;
    setState("ok", `${result.session.events.length} events · ${via}`);
  } catch (err) {
    lastSession = null;
    const message = err instanceof Error ? err.message : String(err);
    output.textContent = `// crash: ${message}`;
    output.dataset.raw = output.textContent;
    setState("parse_error", message);
  }
}

input.value = SAMPLES.cursor;
render();
void probeBridge();
