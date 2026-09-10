# chatlang grammar (v0.2)

Toy programming language surface for agent sessions.
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

Agent events between user turns are grouped into one `turn agent() { … }` by the printer.

## Example

```chatlang
session claude;

turn user() {
  say "fix the flaky test";
}

turn agent() {
  think "check cookie expiry";
  tool Read("{\"path\":\"src/auth.test.ts\"}");
  result ok "file contents…";
  say "added null check";
}
```
