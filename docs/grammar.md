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

Default mode is **live** against an in-memory **World** (`files` + `console`).

| Tool | Effect |
|------|--------|
| `Write` / `Edit` | creates/updates `world.files[path]` |
| `Read` | returns file contents (or hydrates from replay result) |
| `Shell` / `Bash` | sandbox: `ls`, `cat`, `echo … > file` |
| `Echo` / `Upper` / `Len` | console helpers |
| unknown | skipped (non-fatal) unless a recorded `result` exists |

Playground shows **Transcript · Virtual files · Console** after Run — the language’s side effects.

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
