import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * @typedef {{ id: string, bin: string, available: boolean }} AgentInfo
 */

export async function detectAgents() {
  const candidates = [
    { id: "claude", bin: "claude" },
    { id: "codex", bin: "codex" },
  ];
  const out = [];
  for (const c of candidates) {
    out.push({
      id: c.id,
      bin: c.bin,
      available: await which(c.bin),
    });
  }
  return out;
}

export async function runAgent(agent, prompt, detected) {
  const list = detected ?? (await detectAgents());
  const pick =
    agent === "auto"
      ? list.find((a) => a.available)
      : list.find((a) => a.id === agent && a.available);

  if (!pick) {
    const names = list.map((a) => `${a.id}${a.available ? "" : " (missing)"}`).join(", ");
    throw new Error(
      `로컬 에이전트 없음. PATH에 claude 또는 codex를 설치하세요. 감지: ${names}`,
    );
  }

  if (pick.id === "claude") {
    try {
      const text = await execCapture("claude", [
        "-p",
        prompt,
        "--output-format",
        "text",
        "--bare",
      ]);
      return { provider: "claude", model: "claude-cli", text };
    } catch {
      const text = await execCapture("claude", [
        "-p",
        prompt,
        "--output-format",
        "text",
      ]);
      return { provider: "claude", model: "claude-cli", text };
    }
  }

  if (pick.id === "codex") {
    // Codex CLI shapes vary; try exec print-style first.
    const text = await execCapture("codex", ["exec", prompt]).catch(async () =>
      execCapture("codex", [prompt]),
    );
    return { provider: "codex", model: "codex-cli", text };
  }

  throw new Error(`unsupported agent ${pick.id}`);
}

async function which(bin) {
  const paths = (process.env.PATH ?? "").split(delimiter);
  for (const p of paths) {
    try {
      await access(join(p, bin), fsConstants.X_OK);
      return true;
    } catch {
      /* continue */
    }
  }
  // Windows .cmd
  for (const p of paths) {
    try {
      await access(join(p, `${bin}.cmd`), fsConstants.F_OK);
      return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

function execCapture(cmd, args, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: process.env,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `${cmd} exited ${code}: ${stderr.trim() || stdout.trim() || "no output"}`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}
