import type { IrEvent, IrSession } from "@chatlang/ir";

export interface RoastScore {
  chaos: number;
  focus: number;
  drama: number;
}

export interface RoastResult {
  title: string;
  lines: string[];
  score: RoastScore;
  /** Roast as a chatlang program (shareable). */
  source: string;
  /** Plain punchlines for UI. */
  transcript: string;
}

type Stats = {
  users: string[];
  says: string[];
  thinks: string[];
  tools: string[];
  toolCounts: Map<string, number>;
  reads: number;
  writes: number;
  webs: number;
  shells: number;
  resultsOk: number;
  resultsErr: number;
  thinkChars: number;
  sayChars: number;
};

/**
 * Run the session as a roast — the gimmick:
 * your agent log becomes a one-page takedown program.
 */
export function roast(session: IrSession): RoastResult {
  const stats = collect(session.events);
  const lines = buildLines(stats);
  const score = scoreOf(stats);
  const title = titleOf(stats, score);
  const source = emitRoastSource(title, lines, score);
  const transcript = [
    `🔥 ${title}`,
    "",
    ...lines.map((l, i) => `${i + 1}. ${l}`),
    "",
    `score  chaos=${score.chaos}  focus=${score.focus}  drama=${score.drama}`,
  ].join("\n");

  return { title, lines, score, source, transcript };
}

function collect(events: IrEvent[]): Stats {
  const stats: Stats = {
    users: [],
    says: [],
    thinks: [],
    tools: [],
    toolCounts: new Map(),
    reads: 0,
    writes: 0,
    webs: 0,
    shells: 0,
    resultsOk: 0,
    resultsErr: 0,
    thinkChars: 0,
    sayChars: 0,
  };

  for (const ev of events) {
    if (ev.type === "user_message") {
      stats.users.push(ev.text);
    } else if (ev.type === "assistant_message") {
      stats.says.push(ev.text);
      stats.sayChars += ev.text.length;
    } else if (ev.type === "thinking") {
      stats.thinks.push(ev.text);
      stats.thinkChars += ev.text.length;
    } else if (ev.type === "tool_call") {
      stats.tools.push(ev.name);
      stats.toolCounts.set(ev.name, (stats.toolCounts.get(ev.name) ?? 0) + 1);
      const n = ev.name.toLowerCase();
      if (n.includes("read")) stats.reads += 1;
      else if (n.includes("write") || n.includes("edit") || n.includes("strreplace"))
        stats.writes += 1;
      else if (n.includes("web") || n.includes("fetch") || n.includes("search"))
        stats.webs += 1;
      else if (n.includes("shell") || n.includes("bash")) stats.shells += 1;
    } else if (ev.type === "tool_result") {
      if (ev.ok) stats.resultsOk += 1;
      else stats.resultsErr += 1;
    }
  }
  return stats;
}

function buildLines(s: Stats): string[] {
  const lines: string[] = [];
  const userAsk = clip(s.users[0] ?? "…(유저 발화 없음)", 80);

  lines.push(`유저: “${userAsk}”`);

  if (s.tools.length === 0) {
    lines.push("도구 0회. 손 안 대고 입만 산 철학 세션.");
  } else {
    lines.push(
      `도구 ${s.tools.length}번 호출. 손이 바빠야 유능해 보이는 그 심리.`,
    );
  }

  if (s.reads >= 3) {
    lines.push(
      `Read ×${s.reads}. 파일을 읽는 건 업무고, 이 정도는 집착이야.`,
    );
  } else if (s.reads === 1) {
    lines.push("Read 한 번. 최소한의 예의는 있네.");
  }

  if (s.webs >= 2) {
    lines.push(
      `Web* ×${s.webs}. 검색창에 살다 온 에이전트. 구글세무 신고했니.`,
    );
  }

  if (s.writes === 0 && s.tools.length >= 3) {
    lines.push("쓰기는 0. 조사만 하고 커밋은 내일의 나에게.");
  } else if (s.writes >= 1) {
    lines.push(`Write/Edit ×${s.writes}. 다행히 손끝은 움직였음.`);
  }

  const top = [...s.toolCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) {
    lines.push(
      `${top[0]}를 ${top[1]}연속. 사랑인지 무한루프인지 구분이 안 됨.`,
    );
  }

  if (s.thinkChars > 0 && s.sayChars > 0) {
    const ratio = s.thinkChars / Math.max(1, s.sayChars);
    if (ratio >= 3) {
      lines.push(
        `think ${s.thinkChars}자 vs say ${s.sayChars}자. 속마음은 소설, 답은 트윗.`,
      );
    } else if (ratio < 0.3) {
      lines.push("생각은 짧은데 말은 김. 자신감인지 근거 없는 확신인지.");
    }
  } else if (s.thinkChars > 200 && s.sayChars === 0) {
    lines.push("생각만 잔뜩 하고 say는 실종. 내면 방송국.");
  }

  if (s.resultsErr > 0) {
    lines.push(
      `tool 실패 ${s.resultsErr}회. 에러도 로그에 남겨야 성장이라더라.`,
    );
  }

  if (s.users.length >= 2) {
    lines.push(
      `유저 턴 ${s.users.length}번. 한 번에 안 끝나서 서로 피곤했을 가능성 높음.`,
    );
  }

  if (s.tools.length >= 8) {
    lines.push("한 줄 평: 오버엔지니어링의 예고편.");
  } else if (s.tools.length === 0 && s.sayChars > 100) {
    lines.push("한 줄 평: 말잔치 MVP.");
  } else if (s.webs >= 2 && s.writes === 0) {
    lines.push("한 줄 평: 리서치 인턴 모드.");
  } else {
    lines.push("한 줄 평: 평범한 에이전트 하루. 그게 제일 무섭다.");
  }

  return lines.slice(0, 8);
}

function scoreOf(s: Stats): RoastScore {
  const chaos = clamp(
    Math.round(
      s.tools.length * 0.8 +
        s.webs * 1.5 +
        s.reads * 0.6 +
        s.resultsErr * 2 +
        (s.thinkChars > s.sayChars * 3 ? 2 : 0),
    ),
    0,
    10,
  );
  const focus = clamp(
    Math.round(
      10 -
        Math.min(8, s.toolCounts.size) +
        (s.writes > 0 ? 1 : 0) -
        (s.webs > 3 ? 2 : 0),
    ),
    0,
    10,
  );
  const drama = clamp(
    Math.round(
      (s.thinkChars + s.sayChars) / 400 +
        s.users.length +
        (s.resultsErr > 0 ? 2 : 0),
    ),
    0,
    10,
  );
  return { chaos, focus, drama };
}

function titleOf(s: Stats, score: RoastScore): string {
  if (s.webs >= 3) return "검색중독 세션 진단서";
  if (s.reads >= 5) return "파일 순례자의 하루";
  if (s.tools.length === 0) return "손 안 대고 코 풀기";
  if (score.chaos >= 8) return "카오스 엔지니어링 (본의 아님)";
  if (score.focus <= 3) return "집중력 증발 리포트";
  return "에이전트 세션 부검 결과";
}

function emitRoastSource(
  title: string,
  lines: string[],
  score: RoastScore,
): string {
  const body = lines.map((l) => `  say ${JSON.stringify(l)};`).join("\n");
  return `session roast;

// ${title}
// chaos=${score.chaos} focus=${score.focus} drama=${score.drama}

turn critic() {
${body}
  tool Score(${JSON.stringify(JSON.stringify(score))});
}
`;
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
