#!/usr/bin/env bash
# Merge gate: run in a worktree AFTER rebasing onto master. Prints verdict.
set -u
cd "$1" || exit 2
echo "== branch $(git branch --show-current) @ $(git rev-parse --short HEAD)"
echo "== tsc"; npx tsc --noEmit 2>&1 | tail -3
echo "== vitest"; npx vitest run 2>&1 | tail -5
echo "== build"; npm run build 2>&1 | tail -5
