/** In-browser sandbox world — what Run *does* to make the language feel real. */

export interface World {
  files: Record<string, string>;
  console: string[];
}

export function createWorld(seed: Record<string, string> = {}): World {
  return {
    files: { ...seed },
    console: [],
  };
}

export function snapshotWorld(world: World): World {
  return {
    files: { ...world.files },
    console: [...world.console],
  };
}

export function formatFiles(world: World): string {
  const keys = Object.keys(world.files).sort();
  if (keys.length === 0) return "(empty)";
  return keys
    .map((k) => {
      const body = world.files[k] ?? "";
      const preview = body.length > 400 ? `${body.slice(0, 400)}…` : body;
      return `── ${k} ──\n${preview}`;
    })
    .join("\n\n");
}

function asRecord(argsJson: string): Record<string, unknown> {
  try {
    const v = JSON.parse(argsJson) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function pathOf(args: Record<string, unknown>): string | undefined {
  for (const key of ["path", "file_path", "filePath", "target_file"]) {
    const v = args[key];
    if (typeof v === "string" && v.trim()) return normalizePath(v);
  }
  return undefined;
}

function contentOf(args: Record<string, unknown>): string | undefined {
  for (const key of ["content", "new_string", "contents", "text"]) {
    const v = args[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * After a tool finishes (host or replay), mutate the world so Run has a visible effect.
 * - Write/Edit: files change from args
 * - Read (+ result): hydrate file cache from summary when missing
 * - Shell/Bash: console log
 */
export function applyToolEffect(
  world: World,
  toolName: string,
  argsJson: string,
  result: { ok: boolean; summary: string },
): void {
  const name = toolName.replace(/[^A-Za-z0-9_]/g, "");
  const args = asRecord(argsJson);
  const path = pathOf(args);

  if (
    name === "Write" ||
    name === "write" ||
    name === "Edit" ||
    name === "StrReplace" ||
    name === "search_replace"
  ) {
    if (path) {
      const content = contentOf(args);
      if (content !== undefined) {
        if (name === "StrReplace" || name === "search_replace") {
          const old = typeof args.old_string === "string" ? args.old_string : "";
          const prev = world.files[path] ?? "";
          world.files[path] =
            old && prev.includes(old) ? prev.replace(old, content) : content;
        } else {
          world.files[path] = content;
        }
        world.console.push(`wrote ${path} (${world.files[path].length} bytes)`);
        return;
      }
    }
  }

  if (name === "Read" || name === "read_file" || name === "ReadFile") {
    if (path && result.ok && !(path in world.files)) {
      world.files[path] = result.summary;
      world.console.push(`cached ${path} from tool result`);
    }
    return;
  }

  if (name === "Shell" || name === "Bash" || name === "shell" || name === "bash") {
    const cmd =
      typeof args.command === "string"
        ? args.command
        : typeof args.cmd === "string"
          ? args.cmd
          : argsJson;
    world.console.push(`$ ${oneLine(cmd)}`);
    if (result.ok) world.console.push(oneLine(result.summary));
    else world.console.push(`(exit err) ${oneLine(result.summary)}`);
    return;
  }

  if (name === "Echo") {
    world.console.push(oneLine(result.summary));
  }
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 240);
}

export type HostTool = (argsJson: string) => { ok: boolean; summary: string };

/** Host tools that actually mutate `world` (live execute). */
export function createSandboxTools(world: World): Record<string, HostTool> {
  const read: HostTool = (argsJson) => {
    const path = pathOf(asRecord(argsJson));
    if (!path) return { ok: false, summary: "Read: missing path" };
    if (!(path in world.files)) {
      return { ok: false, summary: `Read: ${path} not found` };
    }
    return { ok: true, summary: world.files[path]! };
  };

  const write: HostTool = (argsJson) => {
    const args = asRecord(argsJson);
    const path = pathOf(args);
    const content = contentOf(args);
    if (!path || content === undefined) {
      return { ok: false, summary: "Write: need path + content" };
    }
    world.files[path] = content;
    world.console.push(`wrote ${path}`);
    return { ok: true, summary: `wrote ${path} (${content.length} bytes)` };
  };

  const list: HostTool = () => {
    const keys = Object.keys(world.files).sort();
    return { ok: true, summary: keys.length ? keys.join("\n") : "(empty)" };
  };

  const shell: HostTool = (argsJson) => {
    const args = asRecord(argsJson);
    const cmd = String(args.command ?? args.cmd ?? "").trim();
    world.console.push(`$ ${cmd}`);
    if (!cmd) return { ok: false, summary: "empty command" };

    if (cmd === "ls" || cmd.startsWith("ls ")) {
      const keys = Object.keys(world.files).sort();
      const out = keys.join("\n") || "(empty)";
      world.console.push(out);
      return { ok: true, summary: out };
    }
    if (cmd.startsWith("cat ")) {
      const path = normalizePath(cmd.slice(4).trim());
      if (!(path in world.files)) {
        const msg = `cat: ${path}: no such file`;
        world.console.push(msg);
        return { ok: false, summary: msg };
      }
      world.console.push(world.files[path]!);
      return { ok: true, summary: world.files[path]! };
    }
    if (cmd.startsWith("echo ")) {
      const rest = cmd.slice(5);
      const m = rest.match(/^(..*?)\s*>\s*(.+)$/);
      if (m) {
        const path = normalizePath(m[2]!.trim());
        const text = m[1]!.replace(/^["']|["']$/g, "");
        world.files[path] = text + "\n";
        world.console.push(`wrote ${path}`);
        return { ok: true, summary: `wrote ${path}` };
      }
      world.console.push(rest);
      return { ok: true, summary: rest };
    }

    const msg = `sandbox: unsupported command (try ls, cat, echo … > file)`;
    world.console.push(msg);
    return { ok: false, summary: msg };
  };

  const echo: HostTool = (argsJson) => {
    const args = asRecord(argsJson);
    const msg = String(args.msg ?? args.text ?? argsJson);
    world.console.push(msg);
    return { ok: true, summary: msg };
  };

  const upper: HostTool = (argsJson) => {
    const args = asRecord(argsJson);
    const s = String(args.text ?? args.msg ?? argsJson).toUpperCase();
    world.console.push(s);
    return { ok: true, summary: s };
  };

  const len: HostTool = (argsJson) => {
    const args = asRecord(argsJson);
    const s = String(args.text ?? args.msg ?? argsJson);
    const n = String([...s].length);
    world.console.push(`len=${n}`);
    return { ok: true, summary: n };
  };

  return {
    Read: read,
    read_file: read,
    ReadFile: read,
    Write: write,
    write: write,
    Edit: write,
    List: list,
    Glob: list,
    LS: list,
    Shell: shell,
    Bash: shell,
    shell: shell,
    bash: shell,
    Echo: echo,
    Upper: upper,
    Len: len,
  };
}
