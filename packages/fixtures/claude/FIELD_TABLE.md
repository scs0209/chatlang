# Claude Code fixture field table

**Status:** filled — `golden.jsonl` is a **redacted** extract from a real Claude Code session (schema-faithful). Personal paths/emails scrubbed for public OSS.

## Capture source (local only, not committed)

Typical location (macOS): `~/.claude/projects/<encoded-cwd>/*.jsonl`

## Field table

| Field / path | Meaning | Required for v0.1 |
|--------------|---------|-------------------|
| `type` | Line kind: `user` \| `assistant` \| `system` (also see unsupported) | yes |
| `message.role` | `user` / `assistant` | yes |
| `message.content` | string **or** array of blocks (`text`, `thinking`, `tool_use`, `tool_result`) | yes |
| `sessionId` | Session UUID | no (meta) |
| `timestamp` | ISO timestamp | no |
| `cwd` | Workspace cwd (redacted in golden) | no |
| `uuid` / `parentUuid` | Event linkage | no |

## Detect signatures (auto-detect hits)

- Line JSON has `"type":"user"` or `"type":"assistant"` **and** `"sessionId"`
- Or `"message"` object with `"role"` + Claude-style `parentUuid` present

## Unsupported variants (v0.1)

- `attachment`, `queue-operation`, `file-history-snapshot`, `permission-mode`, `last-prompt` lines (ignored by parser)
- Non-JSONL Claude share links / HTML exports
