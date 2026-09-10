import type { IrEvent, IrSession } from "@chatlang/ir";
import { parseChatlang } from "./parse.js";

export type TraceStep =
  | { type: "session"; format: string }
  | { type: "user"; text: string }
  | { type: "think"; text: string }
  | { type: "tool"; name: string; argsJson: string }
  | {
      type: "result";
      ok: boolean;
      summary: string;
      source: "replay" | "host";
    }
  | { type: "say"; role: "agent"; text: string }
  | { type: "meta"; key: string; value: string }
  | { type: "error"; message: string };

export type HostTool = (argsJson: string) => { ok: boolean; summary: string };

export type InterpretMode = "replay" | "live";

export interface InterpretOptions {
  /** replay = use `result` from source; live = call host tools when registered. */
  mode?: InterpretMode;
  tools?: Record<string, HostTool>;
}

export interface InterpretResult {
  ok: boolean;
  exitCode: number;
  steps: TraceStep[];
  transcript: string;
}

/** Built-in host tools for live mode demos. */
export const builtinTools: Record<string, HostTool> = {
  Echo(argsJson) {
    try {
      const v = JSON.parse(argsJson) as unknown;
      if (v && typeof v === "object" && "msg" in v) {
        return { ok: true, summary: String((v as { msg: unknown }).msg) };
      }
      return { ok: true, summary: argsJson };
    } catch {
      return { ok: true, summary: argsJson };
    }
  },
  Upper(argsJson) {
    try {
      const v = JSON.parse(argsJson) as unknown;
      const s =
        typeof v === "string"
          ? v
          : v && typeof v === "object" && "text" in v
            ? String((v as { text: unknown }).text)
            : argsJson;
      return { ok: true, summary: s.toUpperCase() };
    } catch {
      return { ok: true, summary: argsJson.toUpperCase() };
    }
  },
  Len(argsJson) {
    try {
      const v = JSON.parse(argsJson) as unknown;
      const s =
        typeof v === "string"
          ? v
          : v && typeof v === "object" && "text" in v
            ? String((v as { text: unknown }).text)
            : argsJson;
      return { ok: true, summary: String([...s].length) };
    } catch {
      return { ok: false, summary: "Len: invalid args" };
    }
  },
};

/**
 * Interpret an IR session.
 * - **replay:** trust embedded `result` statements (session playback).
 * - **live:** call registered host tools; fall back to embedded `result` if no host.
 */
export function interpret(
  session: IrSession,
  options: InterpretOptions = {},
): InterpretResult {
  const mode = options.mode ?? "replay";
  const tools = { ...builtinTools, ...options.tools };
  const steps: TraceStep[] = [
    { type: "session", format: session.sourceFormat },
  ];

  let ok = true;
  const events = session.events;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev) continue;

    if (ev.type === "meta") {
      steps.push({ type: "meta", key: ev.key, value: ev.value });
      continue;
    }

    if (ev.type === "user_message") {
      steps.push({ type: "user", text: ev.text });
      continue;
    }

    if (ev.type === "thinking") {
      steps.push({ type: "think", text: ev.text });
      continue;
    }

    if (ev.type === "assistant_message") {
      steps.push({ type: "say", role: "agent", text: ev.text });
      continue;
    }

    if (ev.type === "tool_call") {
      steps.push({
        type: "tool",
        name: ev.name,
        argsJson: ev.argsJson,
      });

      const next = events[i + 1];
      const recorded =
        next?.type === "tool_result"
          ? (next as Extract<IrEvent, { type: "tool_result" }>)
          : undefined;

      if (mode === "live" && tools[ev.name]) {
        try {
          const out = tools[ev.name]!(ev.argsJson);
          steps.push({
            type: "result",
            ok: out.ok,
            summary: out.summary,
            source: "host",
          });
          if (!out.ok) ok = false;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          steps.push({ type: "error", message: `tool ${ev.name}: ${message}` });
          ok = false;
        }
        if (recorded) i += 1; // consume recorded result in live+host
        continue;
      }

      if (recorded) {
        steps.push({
          type: "result",
          ok: recorded.ok,
          summary: recorded.summary,
          source: "replay",
        });
        if (!recorded.ok) ok = false;
        i += 1;
        continue;
      }

      steps.push({
        type: "error",
        message: `tool ${ev.name}: no result and no host implementation`,
      });
      ok = false;
      continue;
    }

    if (ev.type === "tool_result") {
      // orphan result (no preceding tool in this walk) — still record
      steps.push({
        type: "result",
        ok: ev.ok,
        summary: ev.summary,
        source: "replay",
      });
      if (!ev.ok) ok = false;
    }
  }

  const transcript = formatTranscript(steps);
  return {
    ok,
    exitCode: ok ? 0 : 1,
    steps,
    transcript,
  };
}

/** Parse `.chatlang` source then interpret. */
export function run(
  source: string,
  options: InterpretOptions = {},
): InterpretResult {
  const parsed = parseChatlang(source);
  if (!parsed.ok) {
    const steps: TraceStep[] = [
      { type: "error", message: parsed.message },
    ];
    return {
      ok: false,
      exitCode: 2,
      steps,
      transcript: formatTranscript(steps),
    };
  }
  return interpret(parsed.session, options);
}

export function formatTranscript(steps: TraceStep[]): string {
  const lines: string[] = [];
  for (const s of steps) {
    switch (s.type) {
      case "session":
        lines.push(`# session ${s.format}`);
        break;
      case "user":
        lines.push(`→ user: ${oneLine(s.text)}`);
        break;
      case "think":
        lines.push(`… think: ${oneLine(s.text)}`);
        break;
      case "tool":
        lines.push(`⚙ tool ${s.name}(${oneLine(s.argsJson)})`);
        break;
      case "result":
        lines.push(
          `← ${s.ok ? "ok" : "err"} (${s.source}): ${oneLine(s.summary)}`,
        );
        break;
      case "say":
        lines.push(`→ agent: ${oneLine(s.text)}`);
        break;
      case "meta":
        lines.push(`# meta ${s.key}=${oneLine(s.value)}`);
        break;
      case "error":
        lines.push(`✗ ${s.message}`);
        break;
    }
  }
  return lines.join("\n");
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 200);
}
