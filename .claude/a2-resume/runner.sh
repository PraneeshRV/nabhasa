#!/usr/bin/env bash
# A2 slice runner: retry-wrapped headless GLM-5.2 max dispatch.
set -u
S=/tmp/claude-1000/-home-praneesh-Praneesh-2nd-brain/f6084f9e-c682-4057-bf3d-1b2589d78610/scratchpad
slice=$1
case $slice in p3b) wtdir=p3a;; p5b) wtdir=p5a;; *) wtdir=$slice;; esac
wt=$HOME/Praneesh/Portfolio/nabhasa-$wtdir
log=$S/logs/$slice.log
extra=()
[[ $slice == p3a ]] && extra+=(--add-dir /home/praneesh/Praneesh/2nd-brain)
cd "$wt" || { echo "no worktree" >>"$log"; exit 2; }
rm -f .a2-done .a2-blocked
for i in 1 2 3 4; do
  echo "=== attempt $i $(date +%T) ===" >>"$log"
  GLM_EFFORT=max glm -p "$(cat "$S/packets/$slice.txt")" \
    --permission-mode acceptEdits --disallowedTools Bash \
    --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
    "${extra[@]}" >>"$log" 2>&1
  rc=$?
  if [[ -f .a2-done || -f .a2-blocked ]]; then
    echo "=== MARKER present after attempt $i (rc=$rc) ===" >>"$log"; exit 0
  fi
  echo "=== attempt $i rc=$rc, no marker; retry in 20s ===" >>"$log"
  sleep 20
done
echo "=== RETRIES EXHAUSTED ===" >>"$log"; exit 1
