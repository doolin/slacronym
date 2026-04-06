# Rename Plan: slacronym -> vietnacronym

**Note**: The target name is `vietnacronym` (with the 'n').

## Overview

Rename the project from "slacronym" to "vietnacronym" across the application code,
infrastructure (Terraform), CI/CD, and git remotes.

---

## 1. Application Code (this repo)

### package.json / package.prod.json

- Change `"name": "slacronym"` to `"name": "vietnacronym"` in both files

### index.mjs

- Line 49: HTML fallback `"slacronym"` -> `"vietnacronym"`
- Line 55: `SUPPORTED_PATHS` — change `"/slacronym"` to `"/vietnacronym"`
- Line 281: console.log startup message
- Line 287: curl example in comment

### index.test.mjs

- Update any test strings/paths referencing `slacronym`

### public/index.html

- Line 166: fetch URL `/slacronym?term=...` -> `/vietnacronym?term=...`

### deploy.sh

- Line 6: `FUNCTION_NAME="slacronym"` -> `FUNCTION_NAME="vietnacronym"`
- Line 53: curl example URL (path will change)

### check-lambda.sh

- Line 5: default `LAMBDA_FUNCTION_NAME` from `slacronym` to `vietnacronym`

### debug-lambda.sh

- Check and update any `slacronym` references

### Makefile

- Line 1: target name `build-SlacronymFunction` -> `build-VietnacronymFunction`
- Line 2: echo message

### scripts/attest.mjs

- No code changes needed (uses env vars, not hardcoded name)

### README.md, AGENTS.md, FORMAL_TESTING.md, AWS_IAM_SETUP.md, HTML_CONTENT_NEGOTIATION_PLAN.md, ROADMAP.md

- Find/replace `slacronym` -> `vietnacronym` in all documentation
- Rename this plan file `vietnacronym-plan.md` accordingly if kept

---

## 2. Terraform (../form-terra)

### Destructive resources (require destroy + recreate)

S3 bucket names are globally unique and immutable. These buckets must be emptied,
destroyed, and recreated with the new name:

- `aws_s3_bucket.slacronym_deployments` — bucket name `"slacronym-deployments"` -> `"vietnacronym-deployments"`
- `aws_s3_bucket.slacronym_artifacts` — bucket name `"slacronym-artifacts"` -> `"vietnacronym-artifacts"`

**Data migration**: Before destroying, copy existing objects from old buckets to new ones
(or accept data loss if artifacts are ephemeral).

### slacronym.tf -> vietnacronym.tf (rename file)

All Terraform resource names change. Full list of resource renames:

| Old resource name                                                        | New resource name                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `aws_s3_bucket.slacronym_deployments`                                    | `aws_s3_bucket.vietnacronym_deployments`                                    |
| `aws_s3_bucket_public_access_block.slacronym_deployments`                | `aws_s3_bucket_public_access_block.vietnacronym_deployments`                |
| `aws_s3_bucket.slacronym_artifacts`                                      | `aws_s3_bucket.vietnacronym_artifacts`                                      |
| `aws_s3_bucket_public_access_block.slacronym_artifacts`                  | `aws_s3_bucket_public_access_block.vietnacronym_artifacts`                  |
| `aws_s3_bucket_versioning.slacronym_artifacts`                           | `aws_s3_bucket_versioning.vietnacronym_artifacts`                           |
| `aws_s3_bucket_server_side_encryption_configuration.slacronym_artifacts` | `aws_s3_bucket_server_side_encryption_configuration.vietnacronym_artifacts` |
| `aws_iam_user.slacronym`                                                 | `aws_iam_user.vietnacronym`                                                 |
| `aws_iam_user_policy.slacronym_artifacts`                                | `aws_iam_user_policy.vietnacronym_artifacts`                                |
| `aws_iam_role.slacronym_github_oidc`                                     | `aws_iam_role.vietnacronym_github_oidc`                                     |
| `aws_iam_role_policy.slacronym_github_oidc_artifacts`                    | `aws_iam_role_policy.vietnacronym_github_oidc_artifacts`                    |
| `aws_iam_role_policy.slacronym_github_oidc_lambda_deploy`                | `aws_iam_role_policy.vietnacronym_github_oidc_lambda_deploy`                |
| `aws_iam_role.slacronym_gitlab_oidc`                                     | `aws_iam_role.vietnacronym_gitlab_oidc`                                     |
| `aws_iam_role_policy.slacronym_gitlab_oidc_artifacts`                    | `aws_iam_role_policy.vietnacronym_gitlab_oidc_artifacts`                    |
| `aws_s3_bucket_policy.slacronym_artifacts`                               | `aws_s3_bucket_policy.vietnacronym_artifacts`                               |
| `data.archive_file.slacronym_placeholder`                                | `data.archive_file.vietnacronym_placeholder`                                |
| `aws_s3_object.slacronym_placeholder`                                    | `aws_s3_object.vietnacronym_placeholder`                                    |
| `aws_iam_role.slacronym_lambda_role`                                     | `aws_iam_role.vietnacronym_lambda_role`                                     |
| `aws_iam_role_policy_attachment.slacronym_lambda_basic_execution`        | `aws_iam_role_policy_attachment.vietnacronym_lambda_basic_execution`        |
| `aws_lambda_function.slacronym`                                          | `aws_lambda_function.vietnacronym`                                          |
| `aws_lambda_function_url.slacronym`                                      | `aws_lambda_function_url.vietnacronym`                                      |

AWS resource names (the `name` attribute passed to AWS) also change:

- IAM user: `"slacronym"` -> `"vietnacronym"`
- IAM roles: `"slacronym-github-oidc-role"`, `"slacronym-gitlab-oidc-role"`, `"slacronym-lambda-role"` -> `"vietnacronym-*"`
- IAM policy names: `"slacronym-artifacts-write"`, `"slacronym-lambda-deploy"` -> `"vietnacronym-*"`
- Lambda function: `function_name = "slacronym"` -> `"vietnacronym"`
- Tags: all `Purpose` tags referencing `slacronym`
- Bucket policy Sid: `"AllowSlacronymUserWrite"` -> `"AllowVietnacronymUserWrite"`
- Placeholder zip path: `slacronym-placeholder.zip` -> `vietnacronym-placeholder.zip`

### slacronym_gateway.tf -> vietnacronym_gateway.tf (rename file)

Resource renames:

| Old                                              | New                                                 |
| ------------------------------------------------ | --------------------------------------------------- |
| `aws_apigatewayv2_api.slacronym`                 | `aws_apigatewayv2_api.vietnacronym`                 |
| `aws_apigatewayv2_integration.slacronym`         | `aws_apigatewayv2_integration.vietnacronym`         |
| `aws_apigatewayv2_route.slacronym_default`       | `aws_apigatewayv2_route.vietnacronym_default`       |
| `aws_apigatewayv2_stage.slacronym_default`       | `aws_apigatewayv2_stage.vietnacronym_default`       |
| `aws_cloudwatch_log_group.slacronym_api_gateway` | `aws_cloudwatch_log_group.vietnacronym_api_gateway` |
| `aws_lambda_permission.slacronym_api_gateway`    | `aws_lambda_permission.vietnacronym_api_gateway`    |

AWS-side names: API name `"slacronym-api"` -> `"vietnacronym-api"`, log group name `/aws/apigateway/slacronym`, tags, descriptions, statement IDs.

Output in this file: `slacronym_api_gateway_url` -> `vietnacronym_api_gateway_url`

### variables.tf

- `slacronym_lambda_s3_key` -> `vietnacronym_lambda_s3_key` (variable name, description, default path)
- `slacronym_lambda_runtime` -> `vietnacronym_lambda_runtime`
- `slacronym_lambda_handler` -> `vietnacronym_lambda_handler`

### outputs.tf

- Rename all `slacronym_*` outputs to `vietnacronym_*`
- Update descriptions and values to reference new resource names
- `clubstraylight_slacronym_url` -> update path from `/slacronym` to `/vietnacronym`

### clubstraylight.tf

- CloudFront origin: `origin_id = "Lambda-slacronym"` -> `"Lambda-vietnacronym"`
- `domain_name` reference: `aws_lambda_function_url.slacronym` -> `aws_lambda_function_url.vietnacronym`
- Cache behavior `path_pattern = "/slacronym*"` -> `"/vietnacronym*"`
- Cache behavior for `/acronyms.json` also routes to `Lambda-slacronym` origin — update its `target_origin_id`
- All `target_origin_id` references

### modules/slacronym/ -> modules/vietnacronym/ (rename directory)

- Rename the module directory
- Update main.tf, variables.tf, outputs.tf, README.md inside the module
- Update any module source references in root terraform
- **Note**: The module duplicates root-level resources and does not appear to be
  consumed via a `module` block. Determine whether it is dead code before renaming.

### form-terra documentation

- **README.md** (lines 194-302): extensive slacronym section covering artifacts, CI/CD identities, deployment, CloudFront routing
- **BACKLOG.md** (lines 27, 174, 197): slacronym.tf references, file lists, Slack integration note
- **bucket-audit.md** (lines 40-41, 51): bucket audit table entries for `slacronym-artifacts` and `slacronym-deployments`

### Terraform state migration

Use `terraform state mv` to avoid destroy/recreate for resources where the AWS name
doesn't change (IAM roles, policies, Lambda). For resources where the AWS name must
change (S3 buckets, Lambda function_name), these will be destroyed and recreated.

**Recommended approach**:

1. `terraform plan` after all .tf changes to see what will be destroyed vs. modified
2. Use `terraform state mv old_name new_name` for resources that only have a Terraform
   name change but no AWS-side name change
3. For S3 buckets: migrate data first, then apply
4. For Lambda: accept brief downtime during recreate, or use a blue/green approach

---

## 3. Git Remotes and Repository Names

### GitHub

- Rename repo `doolin/slacronym` -> `doolin/vietnacronym` via GitHub Settings
- Update local remote: `git remote set-url origin git@github.com-doolin:doolin/vietnacronym.git`
- GitHub will auto-redirect the old URL, but CI secrets/variables reference the repo name

### GitLab

- Rename repo `doolin/slacronym` -> `doolin/vietnacronym` via GitLab Settings
- Update local remote: `git remote set-url gitlab git@gitlab.com:doolin/vietnacronym.git`

### GitHub Actions Secrets/Variables

- `AWS_ROLE_ARN` — will need updating if the OIDC role ARN changes
- `S3_COMPLIANCE_BUCKET` — update if bucket name changes
- No workflow file changes needed (ci.yml doesn't hardcode the name)

---

## 4. Local filesystem

- Rename directory `~/src/slacronym` -> `~/src/vietnacronym`
- Update any Claude Code project memory paths (`.claude/projects/` key is path-based)

---

## 5. Suggested Execution Order

1. **Terraform state prep**: Run `terraform state list | grep slacronym` to inventory current state
2. **Create new S3 buckets** and copy data from old ones (if needed)
3. **Update application code** (all files listed in Section 1) — commit but do not deploy yet
4. **Rename Terraform files and resources**, use `terraform state mv` where possible
5. **Run `terraform plan`** to verify — expect minimal destroys (buckets, Lambda rename)
6. **Apply Terraform changes** (brief Lambda downtime)
7. **Deploy application** to the newly named Lambda
8. **Rename GitHub/GitLab repos**
9. **Update git remotes locally**
10. **Rename local directory**
11. **Push and verify CI passes**
12. **Delete old S3 buckets** once confirmed working
13. **Update Claude Code memory paths**

## 6. Alternative: Parallel Greenfield Deployment

As an alternative to an in-place rename, you can stand up a completely new “vietnacronym” stack in parallel with the existing “slacronym” system, verify it end-to-end, then decommission the old stack. This approach avoids disruptive in-place renames and downtime.

1. Terraform workspace/state isolation
   - Create a separate workspace or backend for the new stack (e.g. `terraform workspace new vietnacronym`), keeping the old `slacronym` workspace untouched.

2. Parameterize naming in code & CI
   - Refactor application config, scripts (e.g. `deploy.sh`, Makefile), and Terraform variables to use a single `APP_NAME` (defaulting to `vietnacronym`) for function names, paths, and bucket names.
   - This minimizes bulk find/replace and makes future renames or multi-tenant deployments easier.

3. Provision new infrastructure
   - Run `terraform init` / `terraform plan` / `terraform apply` in the new workspace to create the Vietnacronym S3 buckets, IAM roles, Lambda, API Gateway, CloudFront, etc.

4. Data migration (optional)
   - If you need existing artifacts, run `aws s3 sync s3://slacronym-artifacts s3://vietnacronym-artifacts` (and similarly for deployments) before or after provisioning.

5. Deploy and test application
   - Use your updated deploy script (pointing at `${APP_NAME}`) to publish the new Lambda.
   - Smoke-test the new endpoint (`/vietnacronym` or your custom domain).

6. Cut over traffic
   - Switch DNS records or CloudFront origin from the Slacronym stack to the Vietnacronym stack (or update clients to the new path).

7. Decommission old stack
   - In the `slacronym` workspace, run `terraform destroy` to tear down legacy resources.
   - Delete the old `slacronym-*` S3 buckets once you’ve confirmed no further data is needed.

8. Legacy code cleanup
   - After decommissioning, remove or rename any remaining legacy code (e.g. `modules/slacronym/`).

9. Roll-back plan
   - During cutover, you can instantly roll back by pointing DNS or your CDN origin back at the old Slacronym stack—no Terraform rollbacks required.

**Why app code before Terraform**: If Terraform renames the Lambda first,
the old `deploy.sh` (still referencing `slacronym`) will target a function
that no longer exists. Updating app code first ensures the deploy script
is ready for the new name when Terraform applies.
