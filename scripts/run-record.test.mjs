/**
 * Run record tests — pure functions, no files or network.
 *
 * Fixtures mirror the real tool output: Node's TAP reporter trailer,
 * ESLint's stylish summary, and `yarn npm audit --json` NDJSON.
 */

import { test } from "node:test";
import assert from "node:assert";
import {
  buildRunRecord,
  checksFromExitCodes,
  countAuditSeverities,
  overallResult,
  parseCheckOutcomes,
  parseEslintSummary,
  parseHeaderExitCode,
  parseTapSummary,
  summarizeArtifacts,
} from "./run-record.mjs";

const TAP = `# commit: abc1234
TAP version 13
ok 1 - something
1..14
# tests 14
# suites 0
# pass 11
# fail 1
# cancelled 1
# skipped 0
# todo 1
# duration_ms 369.093
`;

const advisory = (severity) =>
  JSON.stringify({ value: "pkg", children: { ID: 1, Severity: severity } });

const header = (exitCode) => `# commit: abc\n# commitShort: abc\n# exitCode: ${exitCode}\n---\n`;

test("parseTapSummary reads the reporter trailer", () => {
  assert.deepStrictEqual(parseTapSummary(TAP), { total: 14, passed: 11, failed: 2, skipped: 1 });
});

test("parseTapSummary returns null without a trailer or file", () => {
  assert.strictEqual(parseTapSummary("TAP version 13\n"), null);
  assert.strictEqual(parseTapSummary(null), null);
});

test("parseHeaderExitCode reads the CI script header", () => {
  assert.strictEqual(parseHeaderExitCode(header(1)), 1);
  assert.strictEqual(parseHeaderExitCode("no header"), null);
  assert.strictEqual(parseHeaderExitCode(null), null);
});

test("parseEslintSummary reads the problem counts", () => {
  const text = `${header(1)}\n✖ 3 problems (2 errors, 1 warning)\n`;
  assert.deepStrictEqual(parseEslintSummary(text), { errors: 2, warnings: 1 });
});

test("parseEslintSummary treats a silent passing run as clean", () => {
  assert.deepStrictEqual(parseEslintSummary(header(0)), { errors: 0, warnings: 0 });
});

test("parseEslintSummary returns null for a silent failing run", () => {
  assert.strictEqual(parseEslintSummary(header(2)), null);
});

test("countAuditSeverities counts one advisory per line", () => {
  const ndjson = [advisory("high"), advisory("high"), advisory("critical"), ""].join("\n");
  assert.deepStrictEqual(countAuditSeverities(ndjson), {
    critical: 1,
    high: 2,
    moderate: 0,
    low: 0,
    info: 0,
  });
});

test("countAuditSeverities treats empty output as zero advisories", () => {
  assert.deepStrictEqual(countAuditSeverities(""), {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
  });
});

test("countAuditSeverities returns null on unrecognized lines", () => {
  assert.strictEqual(countAuditSeverities("not json"), null);
  assert.strictEqual(countAuditSeverities(advisory("severe")), null);
  assert.strictEqual(countAuditSeverities(null), null);
});

test("parseCheckOutcomes maps workflow outcomes and flags blanks", () => {
  assert.deepStrictEqual(parseCheckOutcomes('{"test":"success","lint":""}'), [
    { name: "test", outcome: "success" },
    { name: "lint", outcome: "unknown" },
  ]);
  assert.strictEqual(parseCheckOutcomes(""), null);
  assert.strictEqual(parseCheckOutcomes(undefined), null);
});

test("checksFromExitCodes skips checks that produced no artifact", () => {
  assert.deepStrictEqual(checksFromExitCodes({ test: 0, lint: 1, audit: null }), [
    { name: "test", outcome: "success" },
    { name: "lint", outcome: "failure" },
  ]);
});

test("overallResult needs every check to succeed", () => {
  assert.strictEqual(overallResult([{ name: "a", outcome: "success" }]), "success");
  assert.strictEqual(
    overallResult([
      { name: "a", outcome: "success" },
      { name: "b", outcome: "skipped" },
    ]),
    "failure"
  );
  assert.strictEqual(overallResult([]), "unknown");
});

function reader(files) {
  return (name) => files[name] ?? null;
}

test("summarizeArtifacts prefers workflow outcomes over exit codes", () => {
  const summary = summarizeArtifacts(
    reader({ "lint-results.txt": header(0) }),
    '{"test":"failure","lint":"success"}'
  );
  assert.deepStrictEqual(summary.checks, [
    { name: "test", outcome: "failure" },
    { name: "lint", outcome: "success" },
  ]);
});

test("summarizeArtifacts falls back to artifact exit codes", () => {
  const summary = summarizeArtifacts(
    reader({
      "test-results.json": '{"exitCode":1,"success":false}',
      "lint-results.txt": header(0),
      "audit-results.txt": header(1),
      "audit-results.json": advisory("moderate"),
    }),
    undefined
  );
  assert.deepStrictEqual(summary.checks, [
    { name: "test", outcome: "failure" },
    { name: "lint", outcome: "success" },
    { name: "audit", outcome: "failure" },
  ]);
  assert.strictEqual(summary.vulns.moderate, 1);
});

test("summarizeArtifacts distrusts zero advisories from a failing audit", () => {
  const summary = summarizeArtifacts(
    reader({ "audit-results.txt": header(1), "audit-results.json": "" }),
    undefined
  );
  assert.strictEqual(summary.vulns, null);
});

test("summarizeArtifacts keeps zero advisories from a passing audit", () => {
  const summary = summarizeArtifacts(
    reader({ "audit-results.txt": header(0), "audit-results.json": "" }),
    undefined
  );
  assert.strictEqual(summary.vulns.critical, 0);
});

test("buildRunRecord fills schema v1 from a pull request run", () => {
  const record = buildRunRecord({
    repo: "slacronym",
    env: {
      GITHUB_REPOSITORY: "doolin/slacronym",
      HEAD_SHA: "head123",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF: "refs/pull/7/merge",
      GITHUB_HEAD_REF: "feature",
      GITHUB_REF_NAME: "7/merge",
      GITHUB_RUN_ID: "42",
      GITHUB_RUN_ATTEMPT: "2",
    },
    s3Prefix: "slacronym/ci/2026/09/26/120000-merge12",
    attestedAt: "2026-09-26T12:00:00.000Z",
    summary: {
      checks: [{ name: "test", outcome: "success" }],
      tests: null,
      lint: null,
      vulns: null,
    },
    evidence: {
      commitSha: "merge123",
      origin: "ci",
      ciRunUrl: "https://github.com/doolin/slacronym/actions/runs/42",
      artifactChecksum: "ff",
      includedFiles: ["test-results.tap"],
      solanaNetwork: "devnet",
      solanaTxSignature: null,
      solanaError: "no keypair",
    },
  });

  assert.strictEqual(record.schema_version, 1);
  assert.strictEqual(record.origin, "ci");
  assert.strictEqual(record.commit_sha, "merge123");
  assert.strictEqual(record.head_sha, "head123");
  assert.strictEqual(record.branch, "feature");
  assert.strictEqual(record.run_attempt, 2);
  assert.strictEqual(record.result, "success");
  assert.strictEqual(record.artifact_checksum, "sha256:ff");
  assert.strictEqual(record.sast, null);
  assert.ok(!JSON.stringify(record).includes("\n"), "record must serialize to one line");
});

test("buildRunRecord defaults a local run", () => {
  const record = buildRunRecord({
    repo: "slacronym",
    env: {},
    s3Prefix: "p",
    attestedAt: "t",
    summary: { checks: [], tests: null, lint: null, vulns: null },
    evidence: { commitSha: "abc", origin: "local", artifactChecksum: "00", includedFiles: [] },
  });
  assert.strictEqual(record.origin, "local");
  assert.strictEqual(record.event, "local");
  assert.strictEqual(record.head_sha, "abc");
  assert.strictEqual(record.branch, null);
  assert.strictEqual(record.run_attempt, null);
  assert.strictEqual(record.result, "unknown");
});
