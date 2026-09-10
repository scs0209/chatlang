import "./style.css";
import type { IrSession, SourceFormat } from "@chatlang/ir";
import { parseClaude, claudeSignatureHit } from "@chatlang/parse-claude";
import { parseCodex, codexSignatureHit } from "@chatlang/parse-codex";
import { parseCursor, cursorSignatureHit } from "@chatlang/parse-cursor";
import {
  parseChatlang,
  chatlangSignatureHit,
  interpret,
  createWorld,
  formatFiles,
} from "@chatlang/lang";
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
  | "ran";

const SAMPLE_CHATLANG = `session claude;

turn user() {
  say "create hello.txt and prove the program runs";
}

turn agent() {
  think "write, read, list via sandbox";
  tool Write("{\\"path\\":\\"hello.txt\\",\\"content\\":\\"hello from chatlang\\\\n\\"}");
  tool Read("{\\"path\\":\\"hello.txt\\"}");
  tool Shell("{\\"command\\":\\"ls\\"}");
  say "file exists in the virtual workspace";
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

let format: InputMode = "chatlang";
let lastSession: IrSession | null = null;

app.innerHTML = `
  <div class="frame">
    <header>
      <h1 class="brand">chatlang</h1>
      <p class="tag">Paste an agent session → get a program → <strong>Run</strong> it. Tools write a virtual workspace.</p>
      <div class="formats" id="formats">
        <button type="button" data-format="claude">Claude</button>
        <button type="button" data-format="codex">Codex</button>
        <button type="button" data-format="cursor">Cursor</button>
        <button type="button" data-format="chatlang" class="on">.chatlang</button>
      </div>
    </header>
    <main>
      <section class="pane">
        <div class="label">Input</div>
        <textarea id="input" placeholder="JSONL session or .chatlang source…"></textarea>
        <div class="samples" id="samples">
          <button type="button" data-sample="chatlang">hello.chatlang</button>
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
          <button type="button" class="primary" id="run">Run ▶</button>
          <button type="button" id="copy">Copy as code</button>
          <button type="button" id="download">Download .chatlang</button>
        </div>
        <div class="effect-grid">
          <div>
            <div class="label">Transcript</div>
            <pre class="trace" id="trace">// press Run</pre>
          </div>
          <div>
            <div class="label">Virtual files</div>
            <pre class="trace files" id="files">(empty)</pre>
          </div>
        </div>
        <div class="label">Console</div>
        <pre class="trace console" id="console">(empty)</pre>
      </section>
    </main>
    <footer>MIT · Run executes Read/Write/Shell in a sandbox · docs/grammar.md</footer>
  </div>
`;

const input = document.querySelector<HTMLTextAreaElement>("#input")!;
const output = document.querySelector<HTMLDivElement>("#output")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const formats = document.querySelector<HTMLDivElement>("#formats")!;
const samples = document.querySelector<HTMLDivElement>("#samples")!;
const copyBtn = document.querySelector<HTMLButtonElement>("#copy")!;
const downloadBtn = document.querySelector<HTMLButtonElement>("#download")!;
const runBtn = document.querySelector<HTMLButtonElement>("#run")!;
const trace = document.querySelector<HTMLPreElement>("#trace")!;
const filesEl = document.querySelector<HTMLPreElement>("#files")!;
const consoleEl = document.querySelector<HTMLPreElement>("#console")!;

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
  runProgram();
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

downloadBtn.addEventListener("click", () => {
  const text = output.dataset.raw ?? "";
  if (!text.trim()) {
    status.textContent = "Nothing to download.";
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `session.${format}.chatlang`;
  a.click();
  URL.revokeObjectURL(url);
  status.textContent = "Downloaded .chatlang";
});

runBtn.addEventListener("click", () => runProgram());

function clearEffects(): void {
  trace.textContent = "// press Run";
  filesEl.textContent = "(empty)";
  consoleEl.textContent = "(empty)";
}

function runProgram(): void {
  if (!lastSession) {
    trace.textContent = "// nothing to run — fix parse errors first";
    filesEl.textContent = "(empty)";
    consoleEl.textContent = "(empty)";
    setState("parse_error", "no session to run");
    return;
  }

  // Always execute against sandbox. Unknown tools fall back to replay results
  // and still hydrate Virtual files when possible.
  const seed =
    format === "cursor"
      ? {
          "/Users/demo/project": "# demo workspace\n(package.json, src/, …)\n",
          "/Users/demo/project/README.md": "# demo project\n",
        }
      : {};

  const result = interpret(lastSession, {
    mode: "live",
    world: createWorld(seed),
  });

  trace.textContent = `${result.transcript}\n\n# exit ${result.exitCode}`;
  filesEl.textContent = formatFiles(result.world);
  consoleEl.textContent =
    result.world.console.length > 0
      ? result.world.console.join("\n")
      : "(empty)";

  const fileCount = Object.keys(result.world.files).length;
  setState(
    "ran",
    `exit ${result.exitCode} · ${result.steps.length} steps · ${fileCount} files`,
  );
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
    clearEffects();
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
      clearEffects();
      setState(state, result.message);
      return;
    }

    lastSession = result.session;
    const emitted = emit(result.session);
    output.innerHTML = renderHighlighted(emitted.text, emitted.tokens);
    output.dataset.raw = emitted.text;
    const via =
      format === "chatlang" ? "parsed .chatlang" : `from ${format} JSONL`;
    setState("ok", `${result.session.events.length} events · ${via} · press Run`);
  } catch (err) {
    lastSession = null;
    const message = err instanceof Error ? err.message : String(err);
    output.textContent = `// crash: ${message}`;
    output.dataset.raw = output.textContent;
    setState("parse_error", message);
  }
}

// Boot on the executable demo so the gimmick is obvious
input.value = SAMPLES.chatlang;
render();
runProgram();
