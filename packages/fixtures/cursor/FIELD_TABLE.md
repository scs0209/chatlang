# Cursor fixture field table

**Status:** filled — `golden.jsonl` is a **redacted** Cursor agent-transcript extract (`~/.cursor/projects/.../agent-transcripts/`).

## Capture source (local only, not committed)

Typical location (macOS): `~/.cursor/projects/<project-id>/agent-transcripts/<uuid>/<uuid>.jsonl`

## Field table

| Field / path | Meaning | Required for v0.1 |
|--------------|---------|-------------------|
| `role` | `user` \| `assistant` \| `turn_ended` (and possibly others) | yes |
| `message` | Object or null | yes for user/assistant |
| `message.content` | Array of content parts (often `{type:"text", text:"..."}`) | yes |

## Detect signatures

- `"role":"user"` / `"role":"assistant"` with `"message":{"content":...}`
- Path/name containing `agent-transcripts` is a capture hint only (not in-file)

## Unsupported variants (v0.1)

- Composer DB / workspaceStorage blobs other than agent-transcripts JSONL
- Subagent transcript folders (separate files) — v0.1 = one golden file shape only
- `turn_ended` lines may be ignored by parser (not printed as turns)
