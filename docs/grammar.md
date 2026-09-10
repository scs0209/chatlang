# chatlang grammar (v0.3)

Toy programming language for agent sessions.
Statement terminator: optional `;`. Newline is whitespace.

## EBNF

```
program     = header? stmt*
header      = "session" format ";"
format      = "claude" | "codex" | "cursor" | Ident

stmt        = turn | meta | comment

turn        = "turn" role "()" block
role        = "user" | "agent"
block       = "{" body* "}"

body        = say | think | tool | result | comment
say         = "say" string ";"?
think       = "think" string ";"?
tool        = "tool" Ident "(" string ")" ";"?
result      = "result" ("ok" | "err") string ";"?

meta        = "meta" Ident "=" string ";"?
comment     = "//" [^\n]*

string      = JSON string literal  (* \" \\ \n \t \uXXXX *)
Ident       = [A-Za-z_][A-Za-z0-9_]*
```

## Semantics → IR

| Syntax | IR |
|--------|-----|
| `session F;` | `IrSession.sourceFormat = F` |
| `turn user() { say S; }` | `user_message` |
| `think S;` | `thinking` |
| `tool N(S);` | `tool_call` (`argsJson = S`) |
| `result ok\|err S;` | `tool_result` |
| `say S;` (in agent) | `assistant_message` |
| `meta K = S;` | `meta` |

## Runtime (`interpret` / `run`)

Two modes:

| Mode | Behavior |
|------|----------|
| **replay** | Play back embedded `result` (imported JSONL sessions). |
| **live** | Call host tools when registered; else use embedded `result`; else error. |

Built-in host tools: `Echo`, `Upper`, `Len`.

Transcript lines:

```
# session claude
→ user: …
… think: …
⚙ tool Echo({"msg":"…"})
← ok (host): …
→ agent: …
```

Exit codes: `0` ok, `1` runtime error, `2` parse error (`run` only).

## Example

```chatlang
session claude;

turn user() {
  say "ping the runtime";
}

turn agent() {
  think "use a live builtin";
  tool Echo("{\"msg\":\"hello from chatlang\"}");
  say "done";
}
```
