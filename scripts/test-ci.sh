#!/usr/bin/env bash
# Run tests and emit artifacts for CI/CD compliance.
# Produces: test-results.tap (TAP format), test-results.json (summary with timestamp).
# Exit code is the test run exit code (so the job fails when tests fail).

set -euo pipefail

cd "$(dirname "$0")/.."

node --test \
  --test-reporter=tap \
  --test-reporter-destination=test-results.tap \
  index.test.mjs

EXIT=$?

# Commit hash: use GITHUB_SHA in CI, otherwise git rev-parse
COMMIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "")}"
COMMIT_SHORT="${COMMIT_SHA:0:7}"

# Prepend commit to TAP file (TAP comments; valid in TAP format)
{
  echo "# commit: ${COMMIT_SHA}"
  echo "# commitShort: ${COMMIT_SHORT}"
  cat test-results.tap
} > test-results.tap.tmp && mv test-results.tap.tmp test-results.tap

# Summary artifact for compliance (timestamp, outcome, commit)
TIMESTAMP=$(date -Iseconds)
SUCCESS="false"
[[ $EXIT -eq 0 ]] && SUCCESS="true"
echo "{\"timestamp\":\"${TIMESTAMP}\",\"exitCode\":${EXIT},\"success\":${SUCCESS},\"commit\":\"${COMMIT_SHA}\",\"commitShort\":\"${COMMIT_SHORT}\"}" > test-results.json

exit $EXIT
