# AGENTS

## Commons

Read `COMMONS.md` first. It is the shared Straylight family baseline;
this file is the local layer for `slacronym` only. Local guidance here
overrides the commons only where it is explicit.

### OVERRIDES

None.

## Local Context

`slacronym` is a Node.js Lambda application behind the
`clubstraylight.com/slacronym` CloudFront route. It serves Slack-style
Vietnam-era military acronym lookups as JSON and an interactive HTML
page for browser requests.

Infrastructure is managed outside this repository. This repo holds the
application code, tests, packaging, and deploy script.

## Development

Use Yarn for project commands:

- `yarn dev` runs the local server.
- `yarn test` runs the Node test suite.
- `yarn check` runs lint and format checks.
- `yarn audit` checks dependencies.

Read `README.md` before changing deploy, CI, or content negotiation
behavior; it carries the current operational details.

## Deployment

Pushes to `master` trigger CI and automatic deployment. Local deploys
use `yarn deploy` or `./deploy.sh` and update only the Lambda function
code. CloudFront cache invalidation matters for deployed browser-facing
behavior, including the HTML page and static JSON responses.

Avoid racing the CI deploy after a push; Lambda allows only one update
at a time.
