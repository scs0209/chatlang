/**
 * Local agent roast bridge.
 * Playground (localhost) → http://127.0.0.1:3847 → claude/codex CLI.
 *
 * Note: GitHub Pages (HTTPS) cannot call http://127.0.0.1 (mixed content).
 * Use `pnpm dev` + `pnpm bridge` for the real roast.
 */

import { createServer } from "node:http";
import { roast as heuristicRoast } from "@chatlang/lang";
import { buildRoastPrompt, parseRoastResponse } from "./prompt.mjs";
import { detectAgents, runAgent } from "./agents.mjs";

const PORT = Number(process.env.CHATLANG_BRIDGE_PORT ?? 3847);
const HOST = process.env.CHATLANG_BRIDGE_HOST ?? "127.0.0.1";

export function startBridge(port = PORT, host = HOST) {
  const server = createServer(async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (req.method === "GET" && req.url === "/health") {
        const agents = await detectAgents();
        json(res, 200, {
          ok: true,
          service: "chatlang-bridge",
          agents,
          hint: "POST /roast with { sourceFormat, events } or { chatlang }",
        });
        return;
      }

      if (req.method === "POST" && req.url === "/roast") {
        const body = await readJson(req);
        const agent = body.agent ?? "auto";
        const prompt = buildRoastPrompt(body);
        const detected = await detectAgents();

        let result;
        try {
          result = await runAgent(agent, prompt, detected);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // optional fallback only if explicitly requested
          if (body.allowHeuristic) {
            const h = heuristicFromBody(body);
            json(res, 200, {
              ok: true,
              provider: "heuristic",
              warning: message,
              ...h,
            });
            return;
          }
          json(res, 503, {
            ok: false,
            error: message,
            agents: detected,
          });
          return;
        }

        const parsed = parseRoastResponse(result.text);
        json(res, 200, {
          ok: true,
          provider: result.provider,
          model: result.model,
          raw: result.text,
          ...parsed,
        });
        return;
      }

      json(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: message });
    }
  });

  server.listen(port, host, () => {
    console.log(`chatlang bridge on http://${host}:${port}`);
    console.log(`  GET  /health`);
    console.log(`  POST /roast`);
  });

  return server;
}

function heuristicFromBody(body) {
  if (body.session && Array.isArray(body.session.events)) {
    return heuristicRoast(body.session);
  }
  if (body.sourceFormat && Array.isArray(body.events)) {
    return heuristicRoast({
      sourceFormat: body.sourceFormat,
      events: body.events,
    });
  }
  return {
    title: "heuristic unavailable",
    lines: ["세션 IR가 없어 규칙 기반 폴백도 불가"],
    score: { chaos: 0, focus: 0, drama: 0 },
    source: "",
    transcript: "",
  };
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// allow importing without auto-listen (tests)
