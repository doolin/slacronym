#!/usr/bin/env bash
# Run dependency audit and emit an artifact with commit hash for CI/CD compliance.
# Produces: audit-results.txt (audit output with commit header).
# Exit code is the audit exit code (job fails when vulnerabilities are found).

set -euo pipefail

cd "$(dirname "$0")/.."

# Commit hash: use GITHUB_SHA in CI, otherwise git rev-parse
COMMIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "")}"
COMMIT_SHORT="${COMMIT_SHA:0:7}"

# Run audit, capture output
yarn audit 2>&1 | tee audit-results.raw.txt
EXIT=${PIPESTATUS[0]}

# Prepend commit header
{
  echo "# commit: ${COMMIT_SHA}"
  echo "# commitShort: ${COMMIT_SHORT}"
  echo "# exitCode: ${EXIT}"
  echo "---"
  cat audit-results.raw.txt
} > audit-results.txt
rm -f audit-results.raw.txt

exit $EXIT
