# Fixture notes (OSS)

These `golden.jsonl` files are **schema-faithful, redacted** extracts for parser TDD — not full private sessions.

Scrubbed before commit:

- Absolute home paths → `/Users/demo/...`
- Employer hostnames / personal emails
- Common secret patterns (`sk-`, `ghp_`, PEM, etc.)
- Overlong system instruction blobs (truncated)

Do **not** commit raw `~/.claude`, `~/.codex`, or `~/.cursor` transcripts without the same scrub.
