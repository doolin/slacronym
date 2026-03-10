#!/usr/bin/env node

/**
 * CI/CD Attestation Pipeline
 *
 * Zips CI artifacts, computes SHA-256, anchors the checksum on the Solana
 * blockchain via a memo transaction, generates a PDF attestation report,
 * and uploads everything to S3.
 *
 * Environment variables:
 *   GITHUB_SHA            — commit hash (falls back to git rev-parse HEAD)
 *   S3_BUCKET             — S3 compliance bucket name
 *   SOLANA_KEYPAIR_PATH   — path to 64-byte JSON array keypair file
 *   SOLANA_NETWORK        — "devnet" or "mainnet-beta" (default: devnet)
 *   AWS_REGION            — AWS region (default: us-west-1)
 *   GITHUB_SERVER_URL     — e.g. https://github.com (set by Actions)
 *   GITHUB_REPOSITORY     — e.g. owner/repo (set by Actions)
 *   GITHUB_RUN_ID         — numeric run ID (set by Actions)
 *   GITHUB_REF_NAME       — branch name (set by Actions)
 */

import { readFileSync, createWriteStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import archiver from "archiver";
import PDFDocument from "pdfkit";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const ARTIFACT_FILES = [
  "test-results.tap",
  "test-results.json",
  "lint-results.txt",
  "audit-results.txt",
];

const ZIP_FILENAME = "ci-artifacts.zip";
const PDF_FILENAME = "attestation.pdf";

function getCommitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function buildS3Prefix(commitShort) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `slacronym/ci/${yyyy}/${mm}/${dd}/${hh}${min}${ss}-${commitShort}`;
}

function getConfig() {
  const commitSha = getCommitSha();
  const commitShort = commitSha.slice(0, 7);
  return {
    commitSha,
    commitShort,
    s3Prefix: buildS3Prefix(commitShort),
    bucket: process.env.S3_BUCKET || "",
    keypairPath: process.env.SOLANA_KEYPAIR_PATH || "",
    network: process.env.SOLANA_NETWORK || "devnet",
    region: process.env.AWS_REGION || "us-west-1",
    serverUrl: process.env.GITHUB_SERVER_URL || "",
    repository: process.env.GITHUB_REPOSITORY || "",
    runId: process.env.GITHUB_RUN_ID || "",
    branch: process.env.GITHUB_REF_NAME || "",
  };
}

// ---------------------------------------------------------------------------
// Step 1: Zip artifacts
// ---------------------------------------------------------------------------

async function zipArtifacts(files, outputPath) {
  const present = files.filter((f) => existsSync(f));
  if (present.length === 0) {
    throw new Error(`No CI artifact files found. Expected: ${files.join(", ")}`);
  }

  const output = createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise((ok, fail) => {
    output.on("close", ok);
    archive.on("error", fail);
  });

  archive.pipe(output);
  for (const f of present) {
    archive.file(f, { name: f });
  }
  await archive.finalize();
  await done;

  return { zipPath: outputPath, includedFiles: present };
}

// ---------------------------------------------------------------------------
// Step 2: Compute SHA-256
// ---------------------------------------------------------------------------

function computeChecksum(filePath) {
  const hash = createHash("sha256");
  const data = readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

// ---------------------------------------------------------------------------
// Step 3: Solana memo transaction
// ---------------------------------------------------------------------------

function expandHome(p) {
  return p.startsWith("~/") ? p.replace("~", process.env.HOME) : p;
}

function loadKeypair(path) {
  const expanded = resolve(expandHome(path));
  const bytes = JSON.parse(readFileSync(expanded, "utf8"));
  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error("Keypair must be a 64-byte JSON array");
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

async function submitSolanaMemo(payload, keypairPath, network) {
  const keypair = loadKeypair(keypairPath);
  const rpcUrl = clusterApiUrl(network);
  const connection = new Connection(rpcUrl, "confirmed");

  const memoJson = JSON.stringify(payload);
  const memoData = Buffer.from(memoJson, "utf-8");

  const instruction = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
    data: memoData,
  });

  const transaction = new Transaction().add(instruction);

  const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {
    commitment: "confirmed",
  });

  return signature;
}

// ---------------------------------------------------------------------------
// Step 4: Generate PDF attestation
// ---------------------------------------------------------------------------

async function generatePdf(evidence, outputPath) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const stream = createWriteStream(outputPath);

  await new Promise((ok, fail) => {
    stream.on("finish", ok);
    stream.on("error", fail);
    doc.pipe(stream);

    renderHeader(doc, evidence);
    renderSummary(doc, evidence);
    renderDataIntegrity(doc, evidence);
    renderBlockchainAnchor(doc, evidence);
    renderCryptoScheme(doc);
    renderTimeline(doc, evidence);
    renderAttestation(doc, evidence);

    doc.end();
  });

  return outputPath;
}

function renderHeader(doc, evidence) {
  doc.fontSize(20).font("Helvetica-Bold").text("CI/CD Pipeline Attestation");
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica").text(`Generated: ${evidence.completedAt}`);
  doc
    .moveTo(50, doc.y + 5)
    .lineTo(562, doc.y + 5)
    .stroke();
  doc.moveDown(1);
}

function renderSummary(doc, evidence) {
  doc.fontSize(14).font("Helvetica-Bold").text("Summary");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  doc.text(`Repository: ${evidence.repository || "slacronym"}`);
  doc.text(`Commit: ${evidence.commitSha}`);
  if (evidence.branch) doc.text(`Branch: ${evidence.branch}`);
  if (evidence.ciRunUrl) doc.text(`CI Run: ${evidence.ciRunUrl}`);
  doc.moveDown(0.7);
}

function renderDataIntegrity(doc, evidence) {
  doc.fontSize(14).font("Helvetica-Bold").text("Data Integrity");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  doc.text("Artifact archive SHA-256 (ci-artifacts.zip):");
  doc.fontSize(9).text(`  ${evidence.artifactChecksum}`);
  doc.moveDown(0.2);
  doc.fontSize(10).text("Files included in archive:");
  for (const f of evidence.includedFiles) {
    doc.fontSize(9).text(`  - ${f}`);
  }
  doc.moveDown(0.7);
}

function renderBlockchainAnchor(doc, evidence) {
  doc.fontSize(14).font("Helvetica-Bold").text("Blockchain Anchor");
  doc.moveDown(0.3);

  if (evidence.solanaTxSignature) {
    const cluster = evidence.solanaNetwork === "mainnet-beta" ? "" : `?cluster=${evidence.solanaNetwork}`;
    const explorerUrl = `https://explorer.solana.com/tx/${evidence.solanaTxSignature}${cluster}`;

    doc.fontSize(10).font("Helvetica");
    doc.text(`Network: Solana (${evidence.solanaNetwork})`);
    doc.text("Transaction Signature:");
    doc.fontSize(8).text(`  ${evidence.solanaTxSignature}`);
    doc.moveDown(0.2);
    doc.fontSize(8).text(`Verify: ${explorerUrl}`);
  } else {
    doc.fontSize(10).font("Helvetica");
    doc.text("No blockchain anchor recorded for this attestation.");
    if (evidence.solanaError) {
      doc.fontSize(9).text(`  Reason: ${evidence.solanaError}`);
    }
  }
  doc.moveDown(0.7);
}

function renderCryptoScheme(doc) {
  doc.fontSize(14).font("Helvetica-Bold").text("Cryptographic Scheme");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  doc.text("Algorithm: SHA-256 (FIPS 180-4 / RFC 6234)");
  doc.text("Digest encoding: lowercase hexadecimal, 64 characters");
  doc.text("Implementation: Node.js crypto.createHash (OpenSSL backend)");
  doc.moveDown(0.2);
  doc.fontSize(10).font("Helvetica-Bold").text("Inputs hashed:");
  doc.fontSize(9).font("Helvetica");
  doc.text("  - Artifact archive: the zip file containing all CI compliance artifacts");
  doc.moveDown(0.7);
}

function renderTimeline(doc, evidence) {
  doc.fontSize(14).font("Helvetica-Bold").text("Timeline");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  for (const step of evidence.steps) {
    doc.text(`${step.name}: ${step.result}`);
  }
  doc.moveDown(0.7);
}

function renderAttestation(doc, evidence) {
  doc.fontSize(14).font("Helvetica-Bold").text("Attestation");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");

  const solanaClause = evidence.solanaTxSignature
    ? ` The checksum was anchored on the Solana blockchain (${evidence.solanaNetwork}) ` +
      `at transaction ${evidence.solanaTxSignature}.`
    : "";

  doc.text(
    `This document attests that on ${evidence.completedAt}, CI/CD checks were executed ` +
      `for commit ${evidence.commitSha} of the slacronym repository. Test, lint, and ` +
      `audit artifacts were collected, archived into a zip file, and checksummed ` +
      `using SHA-256.${solanaClause} The archive and this attestation were uploaded ` +
      `to S3 for compliance record-keeping.`,
  );
}

// ---------------------------------------------------------------------------
// Step 5: Upload to S3
// ---------------------------------------------------------------------------

function uploadToS3(bucket, prefix, files, region) {
  for (const filePath of files) {
    const dest = `s3://${bucket}/${prefix}/${filePath}`;
    console.log(`  Uploading ${filePath} → ${dest}`);
    execSync(`aws s3 cp "${filePath}" "${dest}" --region "${region}"`, {
      stdio: "inherit",
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = getConfig();
  const steps = [];

  function step(name, result) {
    const ts = new Date().toISOString();
    steps.push({ name, result: `${result} (${ts})` });
    console.log(`✓ ${name}: ${result}`);
  }

  const s3Prefix = config.s3Prefix;
  const s3Key = `${s3Prefix}/${ZIP_FILENAME}`;

  // Step 1: Zip
  console.log("📦 Zipping CI artifacts...");
  const { includedFiles } = await zipArtifacts(ARTIFACT_FILES, ZIP_FILENAME);
  step("Artifacts zipped", `${includedFiles.length} files → ${ZIP_FILENAME}`);

  // Step 2: Checksum
  const checksum = computeChecksum(ZIP_FILENAME);
  step("Checksum computed", `sha256:${checksum}`);

  // Build evidence object
  const evidence = {
    commitSha: config.commitSha,
    commitShort: config.commitShort,
    repository: config.repository || "slacronym",
    branch: config.branch,
    ciRunUrl:
      config.serverUrl && config.repository && config.runId
        ? `${config.serverUrl}/${config.repository}/actions/runs/${config.runId}`
        : "",
    s3Key,
    artifactChecksum: checksum,
    includedFiles,
    solanaNetwork: config.network,
    solanaTxSignature: null,
    solanaError: null,
    completedAt: new Date().toISOString(),
    steps,
  };

  // Step 3: Solana memo (fault-tolerant)
  if (config.keypairPath) {
    console.log("⛓️  Submitting Solana memo transaction...");
    try {
      const memoPayload = {
        s3_key: s3Key,
        artifact_checksum: `sha256:${checksum}`,
        commit: config.commitSha,
        timestamp: evidence.completedAt,
      };
      const sig = await submitSolanaMemo(memoPayload, config.keypairPath, config.network);
      evidence.solanaTxSignature = sig;
      step("Solana memo submitted", sig);
    } catch (err) {
      evidence.solanaError = err.message;
      console.warn(`⚠️  Solana memo failed (non-fatal): ${err.message}`);
      step("Solana memo", `FAILED — ${err.message}`);
    }
  } else {
    console.log("⏭️  Skipping Solana memo (SOLANA_KEYPAIR_PATH not set)");
    step("Solana memo", "skipped (no keypair configured)");
  }

  // Step 4: PDF
  console.log("📄 Generating attestation PDF...");
  await generatePdf(evidence, PDF_FILENAME);
  step("PDF generated", PDF_FILENAME);

  // Step 5: S3 upload (individual artifacts + zip + PDF)
  if (config.bucket) {
    console.log("☁️  Uploading to S3...");
    const uploadFiles = [...includedFiles, ZIP_FILENAME, PDF_FILENAME];
    uploadToS3(config.bucket, s3Prefix, uploadFiles, config.region);
    step("Uploaded to S3", `s3://${config.bucket}/${s3Prefix}/`);
  } else {
    console.log("⏭️  Skipping S3 upload (S3_BUCKET not set)");
    step("S3 upload", "skipped (no bucket configured)");
  }

  // Summary
  console.log("\n📋 Attestation Summary:");
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((err) => {
  console.error("❌ Attestation failed:", err);
  process.exit(1);
});
