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

Uses `AWS_PROFILE=terraformer` and `AWS_REGION=us-west-1` by default. The script packages `index.mjs` (as `index.js`) and `package.json`, uploads the zip, and optionally updates the function config to Node.js 20 and `index.handler` (if Terraform allows).

## Scripts

| Script         | Description                |
|----------------|----------------------------|
| `yarn dev`     | Run local server           |
| `yarn deploy`  | Deploy to Lambda           |
| `yarn lint`    | Run ESLint                 |
| `yarn lint:fix`| ESLint with auto-fix       |
| `yarn format`  | Format with Prettier       |
| `yarn format:check` | Check formatting only |
| `yarn audit`   | Run dependency vulnerability audit (exit non-zero if vulns found); use in CI |

## CI/CD

Run before deploy or on every PR:

```bash
yarn install --immutable   # or your install step
yarn audit                 # exit non-zero if any vulnerabilities
yarn lint
yarn format:check
```

`yarn audit` runs Yarn’s built-in audit (same data as npm audit). The pipeline fails when the audit reports vulnerabilities.

## Adding acronyms

Edit the `ACRONYMS` object at the top of `index.mjs`. Keys are uppercase; values are the definition string returned to the client.

## License

Private.
