# Codex fixture field table

**Status:** filled — `golden.jsonl` is a **redacted** Codex Desktop/CLI rollout extract. `cwd` / paths scrubbed; long `base_instructions` truncated.

## Capture source (local only, not committed)

Typical location (macOS): `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`

## Field table

| Field / path | Meaning | Required for v0.1 |
|--------------|---------|-------------------|
| `type` | `session_meta` \| `turn_context` \| `response_item` \| `event_msg` | yes |
| `timestamp` | Event time | no |
| `payload` | Type-specific object | yes |
| `payload.cwd` (session_meta) | Workspace (redacted) | no |
| `payload.id` (session_meta) | Session id | no |
| `response_item` payload | Model/user items (messages / tool calls) | yes for dialogue |

## Detect signatures

- `"type":"session_meta"` with `payload.originator` / `cli_version`
- Or `"type":"response_item"` / `"type":"event_msg"` in rollout JSONL

## Unsupported variants (v0.1)

- Other Codex storage formats (SQLite, non-rollout exports)
- Huge binary/image payloads inside items (drop / summarize)
