/**
 * CI run record — a one-line JSON summary of a CI run (schema v1).
 *
 * Uploaded beside the attestation artifacts so Athena can query every
 * run without unpacking zips or parsing text. The schema is shared
 * across repos; its contract lives in form-terra at
 * .development/plans/ci-audit-analytics.md.
 *
 * Pure functions only: attest.mjs does the file and network I/O.
 * Counts are null when not measured and 0 only when measured as zero.
 */

export const SCHEMA_VERSION = 1;
export const RUN_RECORD_FILENAME = "run-record.json";

const SEVERITIES = ["critical", "high", "moderate", "low", "info"];
const OUTCOMES = new Set(["success", "failure", "cancelled", "skipped"]);

function toInt(value) {
  return Number.parseInt(value, 10);
}

/** Node's TAP reporter ends with `# tests N`, `# pass N`, and so on. */
export function parseTapSummary(tap) {
  if (tap == null) {
    return null;
  }
  const count = (label) => {
    const match = tap.match(new RegExp(`^# ${label} (\\d+)$`, "m"));
    return match ? toInt(match[1]) : null;
  };
  const total = count("tests");
  if (total === null) {
    return null;
  }
  return {
    total,
    passed: count("pass") ?? 0,
    failed: (count("fail") ?? 0) + (count("cancelled") ?? 0),
    skipped: (count("skipped") ?? 0) + (count("todo") ?? 0),
  };
}

/** The `# exitCode: N` header that lint-ci.sh and audit-ci.sh prepend. */
export function parseHeaderExitCode(text) {
  const match = text?.match(/^# exitCode: (\d+)$/m);
  return match ? toInt(match[1]) : null;
}

/**
 * ESLint's stylish formatter ends with `✖ N problems (E errors, W warnings)`
 * and prints nothing at all for a clean run.
 */
export function parseEslintSummary(text) {
  if (text == null) {
    return null;
  }
  const match = text.match(/(\d+) errors?, (\d+) warnings?\)/);
  if (match) {
    return { errors: toInt(match[1]), warnings: toInt(match[2]) };
  }
  return parseHeaderExitCode(text) === 0 ? { errors: 0, warnings: 0 } : null;
}

/**
 * `yarn npm audit --json` prints one advisory per line:
 * `{"value":"pkg","children":{"Severity":"high",...}}`.
 * Returns null on any line it does not recognize, rather than guess.
 */
export function countAuditSeverities(ndjson) {
  if (ndjson == null) {
    return null;
  }
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const line of ndjson.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    let severity;
    try {
      severity = JSON.parse(line)?.children?.Severity;
    } catch {
      return null;
    }
    if (!(severity in counts)) {
      return null;
    }
    counts[severity] += 1;
  }
  return counts;
}

/** Workflow step outcomes, passed as `{"test":"success",...}`. */
export function parseCheckOutcomes(json) {
  if (!json) {
    return null;
  }
  return Object.entries(JSON.parse(json)).map(([name, outcome]) => ({
    name,
    outcome: OUTCOMES.has(outcome) ? outcome : "unknown",
  }));
}

/** Fallback when no workflow outcomes are available (local runs). */
export function checksFromExitCodes(exitCodes) {
  return Object.entries(exitCodes)
    .filter(([, code]) => code != null)
    .map(([name, code]) => ({ name, outcome: code === 0 ? "success" : "failure" }));
}

export function overallResult(checks) {
  if (checks.length === 0) {
    return "unknown";
  }
  return checks.every((c) => c.outcome === "success") ? "success" : "failure";
}

/**
 * Summarize the CI artifacts. `read(name)` returns a file's text, or
 * null when the file is absent.
 */
export function summarizeArtifacts(read, checkOutcomesJson) {
  const lintText = read("lint-results.txt");
  const auditText = read("audit-results.txt");

  let testExitCode = null;
  try {
    testExitCode = JSON.parse(read("test-results.json") ?? "null")?.exitCode ?? null;
  } catch {
    testExitCode = null;
  }

  const checks =
    parseCheckOutcomes(checkOutcomesJson) ??
    checksFromExitCodes({
      test: testExitCode,
      lint: parseHeaderExitCode(lintText),
      audit: parseHeaderExitCode(auditText),
    });

  // A clean audit prints nothing, and so can one that failed to reach
  // the registry. Zero advisories with a failing exit is the second.
  let vulns = countAuditSeverities(read("audit-results.json"));
  const auditExit = parseHeaderExitCode(auditText);
  if (vulns && auditExit !== 0 && Object.values(vulns).every((n) => n === 0)) {
    vulns = null;
  }

  return {
    checks,
    tests: parseTapSummary(read("test-results.tap")),
    lint: parseEslintSummary(lintText),
    vulns,
  };
}

/** Assemble a schema v1 record. Field order follows the schema table. */
export function buildRunRecord({ repo, env, s3Prefix, attestedAt, summary, evidence }) {
  return {
    schema_version: SCHEMA_VERSION,
    repo,
    repository: env.GITHUB_REPOSITORY || null,
    commit_sha: evidence.commitSha,
    head_sha: env.HEAD_SHA || evidence.commitSha,
    origin: evidence.origin ?? null,
    event: env.GITHUB_EVENT_NAME || "local",
    ref: env.GITHUB_REF || null,
    branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || null,
    run_id: env.GITHUB_RUN_ID || null,
    run_attempt: env.GITHUB_RUN_ATTEMPT ? toInt(env.GITHUB_RUN_ATTEMPT) : null,
    run_url: evidence.ciRunUrl || null,
    attested_at: attestedAt,
    s3_prefix: s3Prefix,
    result: overallResult(summary.checks),
    checks: summary.checks,
    tests: summary.tests,
    lint: summary.lint,
    vulns: summary.vulns,
    sast: null,
    coverage: null,
    artifact_checksum: `sha256:${evidence.artifactChecksum}`,
    included_files: evidence.includedFiles,
    solana_network: evidence.solanaNetwork,
    solana_tx_signature: evidence.solanaTxSignature,
    solana_error: evidence.solanaError,
  };
}
