# slacronym

Slack-style acronym lookup service. Looks up military (Vietnam-era) acronyms and returns definitions in a format suitable for Slack slash commands or similar integrations.

Also serves an interactive HTML page for browser requests via content negotiation.

Runs as a **Lambda function** behind a **CloudFront distribution** with a **Function URL** origin. Infrastructure is managed by Terraform; this repo holds the application code. Pushes to `master` trigger automatic deployment via GitHub Actions.

## In operation

- [From the function
  url](https://hcldim6vnn7xswxjnt66ucwy5e0cqeps.lambda-url.us-west-1.on.aws/slacronym?text=ARVN)
- [Served by Club Straylight](https://clubstraylight.com/slacronym?text=FSB)

## Prerequisites

- Node.js 20.x (or 18.x)
- Yarn
- AWS CLI configured (for deploy)

## Local development

```bash
yarn install
yarn dev
```

Server listens on `http://localhost:3000`. If port 3000 is occupied, set `PORT`:

```bash
PORT=3001 yarn dev
```

**Examples:**

```bash
curl "http://localhost:3000/slacronym?text=MAAG"
curl "http://localhost:3000/slacronym?term=VC"
curl -X POST -d "text=MACV" "http://localhost:3000/slacronym"
```

## API

- **Paths:** `/`, `/slacronym`, `/acronyms.json`
- **Methods:** GET, POST
- **Input:** `text` or `term` (query string for GET, or form/JSON body for POST)
- **Content negotiation:** Browser requests (`Accept: text/html`) with no search term get an interactive HTML page. All other requests get JSON.
- **Response (JSON):** `{ response_type: "ephemeral", text: "..." }` (definition or message)
- **`/acronyms.json`:** Returns the full acronym dictionary as JSON (used by the HTML frontend).

Empty input returns a suggestion line; unknown acronyms return `Unknown acronym: <term>`.

## Deploy

Deploys **code only** to the existing Lambda function `slacronym` (no CloudFormation). Handler/runtime are managed by Terraform.

```bash
yarn deploy
# or
./deploy.sh
```

Uses `AWS_PROFILE=terraformer` and `AWS_REGION=us-west-1` by default (profile is skipped in CI). The script packages production artifacts: `index.mjs` (as `index.js`), `acronyms.json`, `package.prod.json` (as `package.json`), `public/index.html`, and a generated `version.json` containing the git SHA for runtime display. **Development tooling is not deployed.** Keep `package.prod.json` in sync with `package.json` for `name`/`version` if you change them. Runtime and handler are managed by Terraform.

> **Note:** Pushes to `master` also trigger an automatic deploy via CI/CD (see below). Running `yarn deploy` locally right after pushing can cause a `ResourceConflictException` because Lambda only allows one update at a time. If this happens, wait a moment and retry.

## Scripts

| Script              | Description                                                                  |
| ------------------- | ---------------------------------------------------------------------------- |
| `yarn dev`          | Run local server                                                             |
| `yarn deploy`       | Deploy to Lambda                                                             |
| `yarn test`         | Run tests (Node built-in runner)                                             |
| `yarn test:ci`      | Run tests and write artifacts (TAP + JSON) for CI                            |
| `yarn lint:ci`      | Run ESLint and write lint-results.txt with commit for CI                     |
| `yarn audit:ci`     | Run audit and write audit-results.txt with commit for CI                     |
| `yarn lint`         | Run ESLint                                                                   |
| `yarn lint:fix`     | ESLint with auto-fix                                                         |
| `yarn format`       | Format with Prettier                                                         |
| `yarn format:check` | Check formatting only                                                        |
| `yarn check`        | Run lint + format check (same as CI; run before pushing)                     |
| `yarn audit`        | Run dependency vulnerability audit (exit non-zero if vulns found); use in CI |

## CI/CD

A **GitHub Actions** workflow (`.github/workflows/ci.yml`) runs on push and pull requests to `main`/`master`: install, test, lint, format check, and audit. On pushes to `master`, a **deploy** job runs after checks pass — it authenticates via OIDC and deploys to Lambda automatically.

**Compliance artifacts:** Each CI run produces uploadable artifacts (all include commit hash in a header):

| Artifact          | Contents                                                 | Script          |
| ----------------- | -------------------------------------------------------- | --------------- |
| **test-results**  | `test-results.tap` (TAP), `test-results.json`            | `yarn test:ci`  |
| **lint-results**  | `lint-results.txt` (ESLint output)                       | `yarn lint:ci`  |
| **audit-results** | `audit-results.txt`, `audit-results.json` (NDJSON)       | `yarn audit:ci` |
| **attestation**   | `ci-artifacts.zip`, `attestation.pdf`, `run-record.json` | `yarn attest`   |

Each text artifact is prefixed with `# commit:`, `# commitShort:`, and (where applicable) `# exitCode:` so you can tie results to a commit. Every check runs even when an earlier one fails, and each script writes its artifact on failure too, so a failing run leaves complete evidence. Download from Actions → run → Summary → Artifacts. Retention: 90 days.

`run-record.json` is a one-line JSON summary of the run for Athena: commit, event, branch, run URL, each check's outcome, test/lint/advisory counts, and the archive checksum and Solana transaction. Its schema (v1) is shared across repos and defined in form-terra at `.development/plans/ci-audit-analytics.md`; the code is `scripts/run-record.mjs`.

**S3 upload (optional):** The workflow can also upload artifacts to S3 for long-term compliance storage. Configure:

1. **GitHub repository secrets:**
   - `AWS_ROLE_ARN` — IAM role ARN (e.g. `arn:aws:iam::ACCOUNT:role/GitHubActionsCI`)

2. **GitHub repository variables** (Settings → Secrets and variables → Actions → Variables):
   - `S3_COMPLIANCE_BUCKET` — S3 bucket name (defaults to `your-compliance-bucket` if not set)
   - `AWS_REGION` — AWS region (defaults to `us-west-1` if not set)

3. **AWS IAM setup:** See [`AWS_IAM_SETUP.md`](./AWS_IAM_SETUP.md) for detailed steps:
   - Create an OIDC provider for GitHub (`token.actions.githubusercontent.com`)
   - Create an IAM role with trust policy allowing `repo:OWNER/REPO` to assume it
   - Attach policy allowing `s3:PutObject` on your compliance bucket (e.g. `s3://bucket/slacronym/ci/*`)

Artifacts upload to `s3://BUCKET/slacronym/ci/YYYY/MM/DD/HHMMSS-<sha7>/` (UTC time the attest step started; e.g. `s3://inventium-artifacts/slacronym/ci/2026/09/12/151239-23f084e/run-record.json`). If `S3_COMPLIANCE_BUCKET` isn’t set, the attest and upload steps are skipped.

**Out-of-band:** If your compliance process requires **JUnit XML** for tests instead of TAP, add a devDependency (e.g. `node-test-junit-reporter` or `tap-junit`) and a step that produces/upload JUnit; the current setup needs no extra dependencies.

To run the same checks locally or in another CI (e.g. GitLab, Jenkins):

```bash
yarn install --immutable
yarn test
yarn check    # lint + format check (or run yarn lint && yarn format:check)
yarn audit
```

To produce the same compliance artifacts (with commit hash) locally, use `yarn test:ci`, `yarn lint:ci`, and `yarn audit:ci` instead of `yarn test`, `yarn lint`, and `yarn audit`; artifact files are written to the repo root and ignored by git.

Each step exits non-zero on failure so the pipeline fails correctly. `yarn audit` uses Yarn’s built-in audit (same data as npm audit).

## Adding acronyms

Edit `acronyms.json`. Keys are uppercase; values are the definition string returned to the client.

## License

Private.
