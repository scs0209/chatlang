import type { IrEvent, IrSession } from "@chatlang/ir";
import { parseChatlang } from "./parse.js";
import {
  applyToolEffect,
  createSandboxTools,
  createWorld,
  snapshotWorld,
  type HostTool,
  type World,
} from "./runtime.js";

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

export type { HostTool, World };
export {
  createWorld,
  createSandboxTools,
  applyToolEffect,
  formatFiles,
  snapshotWorld,
} from "./runtime.js";

export type InterpretMode = "replay" | "live";

export interface InterpretOptions {
  /**
   * replay = only embedded `result` (still hydrates World from effects).
   * live = call sandbox/host tools when available; else fall back to replay.
   */
  mode?: InterpretMode;
  tools?: Record<string, HostTool>;
  /** Seed files before run (virtual workspace). */
  world?: World;
  /** Attach default Read/Write/Shell sandbox (default true in live). */
  sandbox?: boolean;
}

export interface InterpretResult {
  ok: boolean;
  exitCode: number;
  steps: TraceStep[];
  transcript: string;
  /** Visible side effects — the gimmick. */
  world: World;
}

/**
 * Interpret an IR session into a transcript + mutable World.
 */
export function interpret(
  session: IrSession,
  options: InterpretOptions = {},
): InterpretResult {
  const mode = options.mode ?? "live";
  const world = options.world ?? createWorld();
  const useSandbox = options.sandbox ?? mode === "live";
  const tools: Record<string, HostTool> = {
    ...(useSandbox ? createSandboxTools(world) : {}),
    ...options.tools,
  };

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

      const host = lookupTool(tools, ev.name);

      if (mode === "live" && host) {
        try {
          const out = host(ev.argsJson);
          // sandbox/host tools mutate world themselves
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
        if (recorded) i += 1;
        continue;
      }

      if (recorded) {
        const out = { ok: recorded.ok, summary: recorded.summary };
        applyToolEffect(world, ev.name, ev.argsJson, out);
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
        type: "result",
        ok: true,
        summary: `(skipped: no sandbox for ${ev.name})`,
        source: "host",
      });
      world.console.push(`skip ${ev.name}`);
      continue;
    }

    if (ev.type === "tool_result") {
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
    world: snapshotWorld(world),
  };
}

function lookupTool(
  tools: Record<string, HostTool>,
  name: string,
): HostTool | undefined {
  if (tools[name]) return tools[name];
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
  return tools[cleaned];
}

/** Parse `.chatlang` source then interpret. */
export function run(
  source: string,
  options: InterpretOptions = {},
): InterpretResult {
  const parsed = parseChatlang(source);
  if (!parsed.ok) {
    const steps: TraceStep[] = [{ type: "error", message: parsed.message }];
    return {
      ok: false,
      exitCode: 2,
      steps,
      transcript: formatTranscript(steps),
      world: snapshotWorld(options.world ?? createWorld()),
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
