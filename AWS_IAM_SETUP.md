# AWS IAM Setup for GitHub Actions OIDC

This document outlines the AWS IAM configuration needed for the GitHub Actions workflow to upload CI artifacts to S3.

## Overview

The workflow uses **OIDC** (OpenID Connect) to authenticate with AWS without storing long-lived credentials. GitHub Actions provides a JWT token that AWS trusts, allowing the workflow to assume an IAM role.

## Steps

### 1. Create OIDC Provider (one-time, per AWS account)

If you don't already have a GitHub OIDC provider:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 2. Create IAM Role

Create a role (e.g. `GitHubActionsCI`) with a trust policy that allows GitHub to assume it:

**Trust Policy** (`trust-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:*"
        }
      }
    }
  ]
}
```

Replace:
- `ACCOUNT_ID` — Your AWS account ID
- `OWNER/REPO` — Your GitHub org/user and repo name (e.g. `myorg/slacronym`)

Create the role:

```bash
aws iam create-role \
  --role-name GitHubActionsCI \
  --assume-role-policy-document file://trust-policy.json
```

### 3. Attach S3 Policy

Create a policy that allows uploading to your compliance bucket:

**Policy** (`s3-upload-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::your-compliance-bucket/slacronym/ci/*"
    }
  ]
}
```

Create and attach:

```bash
aws iam create-policy \
  --policy-name GitHubActionsS3Upload \
  --policy-document file://s3-upload-policy.json

aws iam attach-role-policy \
  --role-name GitHubActionsCI \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/GitHubActionsS3Upload
```

### 4. Configure GitHub

In your GitHub repository:

1. **Settings → Secrets and variables → Actions → Secrets:**
   - Add secret: `AWS_ROLE_ARN` = `arn:aws:iam::ACCOUNT_ID:role/GitHubActionsCI`

2. **Settings → Secrets and variables → Actions → Variables:**
   - Add variable: `S3_COMPLIANCE_BUCKET` = `your-compliance-bucket`
   - Add variable: `AWS_REGION` = `us-west-1` (optional, defaults to us-west-1)

### 5. Test

Push a commit and check the Actions run. The "Upload CI artifacts to S3" step should succeed and upload files to:

```
s3://your-compliance-bucket/slacronym/ci/<commit-sha>/
  ├── test-results.tap
  ├── test-results.json
  ├── lint-results.txt
  └── audit-results.txt
```

## Troubleshooting

- **"Access Denied"**: Check the role trust policy matches your repo (`OWNER/REPO`).
- **"Bucket not found"**: Verify `S3_COMPLIANCE_BUCKET` variable is set correctly.
- **"Role not found"**: Verify `AWS_ROLE_ARN` secret matches the role ARN exactly.
- **Step skipped**: If `AWS_ROLE_ARN` secret is not set, the S3 upload step is skipped (workflow still succeeds).

## Security Notes

- The trust policy restricts which repos can assume the role (via `sub` condition).
- The S3 policy is scoped to `slacronym/ci/*` — adjust the bucket/path as needed.
- Consider adding lifecycle rules to the S3 bucket to auto-delete old artifacts (e.g. after 90 days).
