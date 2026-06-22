#!/usr/bin/env bash
# Auto-save: commit and push any working-tree changes when a Claude Code
# session finishes a turn. Keeps web-session work from being lost by making
# sure it always lands on the remote branch.
set -u

# Run from the repo root regardless of where the hook fires.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# Only act inside a git repository.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Nothing changed -> nothing to save.
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

branch="$(git rev-parse --abbrev-ref HEAD)"

# Refuse to auto-commit when not on a real branch (e.g. detached HEAD).
[ "$branch" = "HEAD" ] && exit 0

git add -A
git commit -m "Auto-save: $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1

# Push with a few retries to ride out transient network failures.
for attempt in 1 2 3 4; do
  if git push -u origin "$branch" >/dev/null 2>&1; then
    echo "{\"systemMessage\": \"Auto-saved and pushed to '$branch'.\"}"
    exit 0
  fi
  sleep $((attempt * 2))
done

echo "{\"systemMessage\": \"Auto-save committed locally, but push to '$branch' failed. It will retry on the next save.\"}"
exit 0
