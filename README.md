# slacronym

Slack-style acronym lookup service. Looks up military (Vietnam-era) acronyms and returns definitions in a format suitable for Slack slash commands or similar integrations.

Runs as a **Lambda function** behind a **Function URL** (no API Gateway or CloudFront). Infrastructure is managed by Terraform; this repo holds the application code and deploys via `deploy.sh`.

## Prerequisites

- Node.js 20.x (or 18.x)
- Yarn
- AWS CLI configured (for deploy)

## Local development

```bash
yarn install
yarn dev
```

Server listens on `http://localhost:3000`.

**Examples:**

```bash
curl "http://localhost:3000/slacronym?text=MAAG"
curl "http://localhost:3000/slacronym?term=VC"
curl -X POST -d "text=MACV" "http://localhost:3000/slacronym"
```

## API

- **Paths:** `/` and `/slacronym`
- **Methods:** GET, POST
- **Input:** `text` or `term` (query string for GET, or form/JSON body for POST)
- **Response:** JSON with `response_type: "ephemeral"` and `text` (definition or message)

Empty input returns a suggestion line; unknown acronyms return `Unknown acronym: <term>`.

## Deploy

Deploys **code only** to the existing Lambda function `slacronym` (no CloudFormation). Handler/runtime are managed by Terraform.

```bash
yarn deploy
# or
./deploy.sh
```

Uses `AWS_PROFILE=terraformer` and `AWS_REGION=us-west-1` by default. The script packages only production artifacts: `index.mjs` (as `index.js`) and `package.prod.json` (as `package.json`). **Development tooling is not deployed** — no devDependencies, no lint/format/audit scripts. Keep `package.prod.json` in sync with `package.json` for `name`/`version` if you change them. The script optionally updates the function config to Node.js 20 and `index.handler` (if Terraform allows).

## Scripts

| Script         | Description                |
|----------------|----------------------------|
| `yarn dev`     | Run local server           |
| `yarn deploy`  | Deploy to Lambda           |
| `yarn test`    | Run tests (Node built-in runner) |
| `yarn test:ci` | Run tests and write artifacts (TAP + JSON) for CI |
| `yarn lint`    | Run ESLint                 |
| `yarn lint:fix`| ESLint with auto-fix       |
| `yarn format`  | Format with Prettier       |
| `yarn format:check` | Check formatting only |
| `yarn audit`   | Run dependency vulnerability audit (exit non-zero if vulns found); use in CI |

## CI/CD

A **GitHub Actions** workflow (`.github/workflows/ci.yml`) runs on push and pull requests to `main`/`master`: install, test, lint, format check, and audit. No secrets required.

**Compliance / test artifacts:** Each test run produces uploadable artifacts for audit trails:

- **`test-results.tap`** — Full run in [TAP](https://testanything.org/) format (standard, machine-readable).
- **`test-results.json`** — Summary with `timestamp`, `exitCode`, `success`, `commit` (full SHA), and `commitShort` (7-char SHA for display).

The workflow runs `yarn test:ci` (see `scripts/test-ci.sh`), then uploads these as the **test-results** artifact (90-day retention). Artifacts are uploaded even when tests fail (`if: always()`). Download from the Actions run page → Summary → Artifacts.

**Out-of-band:** If your compliance process requires **JUnit XML** instead of TAP, add a devDependency (e.g. `node-test-junit-reporter` or `tap-junit`) and a step that converts TAP to JUnit or runs the test runner with a JUnit reporter, then upload the XML as well. The current setup needs no extra dependencies.

To run the same checks locally or in another CI (e.g. GitLab, Jenkins):

```bash
yarn install --immutable
yarn test
yarn lint
yarn format:check
yarn audit
```

Each step exits non-zero on failure so the pipeline fails correctly. `yarn audit` uses Yarn’s built-in audit (same data as npm audit).

## Adding acronyms

Edit the `ACRONYMS` object at the top of `index.mjs`. Keys are uppercase; values are the definition string returned to the client.

## License

Private.
