#!/usr/bin/env bash
# Run ESLint and emit an artifact with commit hash for CI/CD compliance.
# Produces: lint-results.txt (ESLint output with commit header).
# Exit code is the ESLint exit code (job fails when lint fails).

set -euo pipefail

cd "$(dirname "$0")/.."

# Commit hash: use GITHUB_SHA in CI, otherwise git rev-parse
COMMIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "")}"
COMMIT_SHORT="${COMMIT_SHA:0:7}"

# Run ESLint, capture output
yarn lint 2>&1 | tee lint-results.raw.txt
EXIT=${PIPESTATUS[0]}

# Prepend commit header
{
  echo "# commit: ${COMMIT_SHA}"
  echo "# commitShort: ${COMMIT_SHORT}"
  echo "# exitCode: ${EXIT}"
  echo "---"
  cat lint-results.raw.txt
} > lint-results.txt
rm -f lint-results.raw.txt

exit $EXIT
