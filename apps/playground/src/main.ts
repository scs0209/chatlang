import "./style.css";
import type { SourceFormat } from "@chatlang/ir";
import { parseClaude, claudeSignatureHit } from "@chatlang/parse-claude";
import { parseCodex, codexSignatureHit } from "@chatlang/parse-codex";
import { parseCursor, cursorSignatureHit } from "@chatlang/parse-cursor";
import { emit, type Token } from "@chatlang/print";

import sampleClaude from "../../../packages/fixtures/claude/golden.jsonl?raw";
import sampleCodex from "../../../packages/fixtures/codex/golden.jsonl?raw";
import sampleCursor from "../../../packages/fixtures/cursor/golden.jsonl?raw";

type UiState =
  | "empty"
  | "detecting"
  | "ok"
  | "format_mismatch"
  | "parse_error"
  | "too_large";

const SAMPLES: Record<SourceFormat, string> = {
  claude: sampleClaude,
  codex: sampleCodex,
  cursor: sampleCursor,
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

let format: SourceFormat = "claude";

app.innerHTML = `
  <div class="frame">
    <header>
      <h1 class="brand">chatlang</h1>
      <p class="tag">Paste a Claude / Codex / Cursor session — see it as source code.</p>
      <div class="formats" id="formats">
        <button type="button" data-format="claude" class="on">Claude</button>
        <button type="button" data-format="codex">Codex</button>
        <button type="button" data-format="cursor">Cursor</button>
      </div>
    </header>
    <main>
      <section class="pane">
        <div class="label">Input</div>
        <textarea id="input" placeholder="Drop .jsonl / paste transcript here…"></textarea>
        <div class="samples" id="samples">
          <button type="button" data-sample="claude">debug-claude</button>
          <button type="button" data-sample="codex">debug-codex</button>
          <button type="button" data-sample="cursor">cursor-multifile</button>
        </div>
        <div class="status" id="status"></div>
      </section>
      <section class="pane">
        <div class="label">Source</div>
        <div class="code" id="output">// load a sample or paste a session</div>
        <div class="actions">
          <button type="button" class="primary" id="copy">Copy as code</button>
        </div>
      </section>
    </main>
    <footer>MIT · @chatlang/parse-claude · parse-codex · parse-cursor · print</footer>
  </div>
`;

const input = document.querySelector<HTMLTextAreaElement>("#input")!;
const output = document.querySelector<HTMLDivElement>("#output")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const formats = document.querySelector<HTMLDivElement>("#formats")!;
const samples = document.querySelector<HTMLDivElement>("#samples")!;
const copyBtn = document.querySelector<HTMLButtonElement>("#copy")!;

formats.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLButtonElement)) return;
  const next = t.dataset.format as SourceFormat | undefined;
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
  const key = t.dataset.sample as SourceFormat | undefined;
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
  status.textContent = "Copied.";
});

function maybeAutodetect(text: string): void {
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

function parseFor(fmt: SourceFormat, text: string) {
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
    output.innerHTML = escapeHtml("// load a sample or paste a session");
    output.dataset.raw = "";
    setState("empty", "waiting for input");
    return;
  }

  setState("detecting", `format tab: ${format}`);
  const result = parseFor(format, text);
  if (!result.ok) {
    const state: UiState =
      result.kind === "format_mismatch"
        ? "format_mismatch"
        : result.kind === "too_large"
          ? "too_large"
          : "parse_error";
    output.textContent = `// ${result.message}`;
    output.dataset.raw = output.textContent;
    setState(state, result.message);
    return;
  }

  const emitted = emit(result.session);
  output.innerHTML = renderHighlighted(emitted.text, emitted.tokens);
  output.dataset.raw = emitted.text;
  setState("ok", `${result.session.events.length} events`);
}

// boot with Claude sample so the language is visible immediately
input.value = SAMPLES.claude;
render();
