# SAM Deployment Setup

## Install SAM CLI

```bash
# macOS
brew install aws-sam-cli

# Or via pip
pip install aws-sam-cli
```

## Deploy with SAM

### First-time setup (guided):
```bash
yarn deploy:guided
# or
sam deploy --guided
```

This will:
- Create/update the CloudFormation stack
- Set up S3 bucket for deployment artifacts
- Configure region and other settings

### Subsequent deployments:
```bash
yarn build    # Build the Lambda package
yarn deploy   # Deploy to AWS
```

Or combine:
```bash
sam build && sam deploy
```

## Local Testing

Test locally before deploying:
```bash
yarn local
# or
sam local start-api
```

Then test:
```bash
curl "http://localhost:3000/slacronym?text=MAAG"
```

## Benefits over deploy.sh

- ✅ Infrastructure as code (template.yaml)
- ✅ Version control for infrastructure changes
- ✅ Local testing with `sam local`
- ✅ Automatic CloudFormation stack management
- ✅ Better error handling and rollback
- ✅ Outputs Function URL automatically
