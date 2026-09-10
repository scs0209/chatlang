# Contributing

## Git identity (required)

This repository is owned by **[scs0209](https://github.com/scs0209)**.

**All commits and pushes MUST use:**

```
Author:    scs0209 <scs0209@users.noreply.github.com>
Committer: scs0209 <scs0209@users.noreply.github.com>
```

Do **not** commit or push under any other GitHub account, personal name, or employer email.

### One-shot (no global git config change)

```bash
export GIT_AUTHOR_NAME="scs0209"
export GIT_AUTHOR_EMAIL="scs0209@users.noreply.github.com"
export GIT_COMMITTER_NAME="scs0209"
export GIT_COMMITTER_EMAIL="scs0209@users.noreply.github.com"
git commit -m "…"
git push
```

### Verify before push

```bash
git log -1 --format='%an <%ae> | %cn <%ce>'
# must print: scs0209 <scs0209@users.noreply.github.com> | scs0209 <scs0209@users.noreply.github.com>
```

If a commit was authored incorrectly and already pushed to `main`, fix with amend + `git push --force-with-lease` only when you own the branch and no one else has based work on it.

## AI / agent contributors

Agents must follow the same author/committer rule on every commit. Prefer the env-var form above; do not rewrite the user’s global `git config`.
