import { emit } from "@chatlang/print";

/**
 * Build a roast prompt for the local agent.
 * Prefer compact chatlang source over raw JSONL.
 */
export function buildRoastPrompt(body) {
  let program = "";
  if (typeof body.chatlang === "string" && body.chatlang.trim()) {
    program = body.chatlang.trim();
  } else if (body.session?.events) {
    program = emit(body.session).text;
  } else if (body.sourceFormat && Array.isArray(body.events)) {
    program = emit({
      sourceFormat: body.sourceFormat,
      events: body.events,
    }).text;
  } else {
    program = String(body.text ?? "").slice(0, 12000);
  }

  // soft size cap for agent context
  if (program.length > 14000) {
    program = program.slice(0, 14000) + "\n// …truncated\n";
  }

  return `당신은 chatlang 세션을 한 페이지로 디스(roast)하는 비평가다.
아래 .chatlang 소스를 읽고, 이 세션만의 구체적인 디테일을 집어 웃기게 깐다.
규칙 템플릿 금지. 숫자·파일·툴·유저 말을 근거로 쓸 것.
한국어로. 공격은 세션/에이전트 습관에 한정 (신상 모욕 금지).

반드시 아래 JSON만 출력 (코드펜스 금지):
{
  "title": "짧은 제목",
  "lines": ["펀치1", "펀치2", "펀치3", "펀치4", "한 줄 평: …"],
  "score": { "chaos": 0, "focus": 0, "drama": 0 }
}
score는 0~10 정수. lines는 4~8개.

--- chatlang source ---
${program}
`;
}

export function parseRoastResponse(text) {
  const json = extractJson(text);
  if (!json) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
    const title = lines[0] ?? "로컬 에이전트 로스팅";
    const score = { chaos: 5, focus: 5, drama: 5 };
    return {
      title,
      lines: lines.slice(0, 8),
      score,
      source: emitCritic(title, lines, score),
      transcript: formatTranscript(title, lines, score),
    };
  }

  const title = String(json.title ?? "로컬 에이전트 로스팅");
  const lines = Array.isArray(json.lines)
    ? json.lines.map(String).slice(0, 8)
    : [];
  const score = {
    chaos: num(json.score?.chaos),
    focus: num(json.score?.focus),
    drama: num(json.score?.drama),
  };
  return {
    title,
    lines,
    score,
    source: emitCritic(title, lines, score),
    transcript: formatTranscript(title, lines, score),
  };
}

function emitCritic(title, lines, score) {
  const body = lines.map((l) => `  say ${JSON.stringify(l)};`).join("\n");
  return `session roast;

// ${title}
// chaos=${score.chaos} focus=${score.focus} drama=${score.drama}
// provider: local-agent

turn critic() {
${body}
  tool Score(${JSON.stringify(JSON.stringify(score))});
}
`;
}

function formatTranscript(title, lines, score) {
  return [
    `🔥 ${title}`,
    "",
    ...lines.map((l, i) => `${i + 1}. ${l}`),
    "",
    `score  chaos=${score.chaos}  focus=${score.focus}  drama=${score.drama}`,
  ].join("\n");
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function num(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}
