#!/bin/bash

set -euo pipefail

# Configuration (hard-coded function name)
FUNCTION_NAME="slacronym"
REGION="${AWS_REGION:-us-west-1}"
AWS_PROFILE="${AWS_PROFILE:-terraformer}"

# Build AWS CLI args
AWS_CLI_ARGS=("--region" "$REGION")
[ -n "$AWS_PROFILE" ] && AWS_CLI_ARGS+=("--profile" "$AWS_PROFILE")

echo "📦 Creating deployment package..."

# Create a temporary directory for packaging
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy necessary files
# Lambda expects index.js (not index.mjs) for ES modules
cp index.mjs "$TEMP_DIR/index.js"
cp package.json "$TEMP_DIR/"

# Create zip file
ZIP_FILE="deploy.zip"
cd "$TEMP_DIR"
zip -q -r "$OLDPWD/$ZIP_FILE" .
cd "$OLDPWD"

echo "✅ Package created: $ZIP_FILE"
echo "📤 Deploying to Lambda function: $FUNCTION_NAME (region: $REGION)..."

# Update Lambda function code
aws lambda update-function-code \
  "${AWS_CLI_ARGS[@]}" \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP_FILE" \
  --output json > /dev/null

# Update runtime and handler to Node.js (Terraform will need to be updated to match)
echo "🔧 Updating runtime to nodejs20.x and handler to index.handler..."
aws lambda update-function-configuration \
  "${AWS_CLI_ARGS[@]}" \
  --function-name "$FUNCTION_NAME" \
  --runtime "nodejs20.x" \
  --handler "index.handler" \
  --output json > /dev/null 2>&1 && echo "✅ Runtime and handler updated" || echo "⚠️  Could not update runtime/handler (may need Terraform update)"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Test your deployment:"
echo "  curl 'https://hcldim6vnn7xswxjnt66ucwy5e0cqeps.lambda-url.us-west-1.on.aws/slacronym?text=MAAG'"
echo ""
echo "📝 Note: It may take a few seconds for the new code to be active."
