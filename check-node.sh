#!/bin/bash

set -euo pipefail

echo "SHELL: $SHELL"
echo "PATH:  $PATH"
echo

for cmd in node npm yarn corepack volta; do
  echo "== $cmd =="
  command -v "$cmd" || echo "(not found)"
  if command -v "$cmd" >/dev/null 2>&1; then
    "$cmd" --version || true
  fi
  echo
done

echo "== brew node/yarn presence =="
brew list --versions node yarn 2>/dev/null || true
brew info node yarn 2>/dev/null | sed -n '1,12p' || true

