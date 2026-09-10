# Agent notes (chatlang)

- GitHub owner: **scs0209** only (`https://github.com/scs0209/chatlang`).
- Every `git commit` / `git push` MUST use author and committer:
  `scs0209 <scs0209@users.noreply.github.com>`.
- Set via env for the commit (do not change global git config):

```bash
export GIT_AUTHOR_NAME="scs0209"
export GIT_AUTHOR_EMAIL="scs0209@users.noreply.github.com"
export GIT_COMMITTER_NAME="scs0209"
export GIT_COMMITTER_EMAIL="scs0209@users.noreply.github.com"
```

- See [CONTRIBUTING.md](CONTRIBUTING.md).
- Design: [docs/designs/chatlang.md](docs/designs/chatlang.md).
- Do not implement parsers until golden fixtures + FIELD_TABLE.md are filled under `packages/fixtures/`.
