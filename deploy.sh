#!/bin/bash

set -euo pipefail

# Configuration
FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-}"
REGION="${AWS_REGION:-us-west-1}"
AWS_PROFILE="${AWS_PROFILE:-terraformer}"

# Build AWS CLI args
AWS_CLI_ARGS=("--region" "$REGION")
[ -n "$AWS_PROFILE" ] && AWS_CLI_ARGS+=("--profile" "$AWS_PROFILE")

# If function name not provided, try to find it
if [ -z "$FUNCTION_NAME" ]; then
  echo "⚠️  LAMBDA_FUNCTION_NAME not set. Attempting to find function..."
  # Try to get function from Function URL
  FUNCTION_ARN=$(aws lambda list-function-url-configs "${AWS_CLI_ARGS[@]}" \
    --query 'FunctionUrlConfigs[?contains(FunctionUrl, `hcldim6vnn7xswxjnt66ucwy5e0cqeps`)].FunctionArn' \
    --output text 2>/dev/null | head -1)
  
  if [ -n "$FUNCTION_ARN" ]; then
    FUNCTION_NAME=$(echo "$FUNCTION_ARN" | awk -F: '{print $NF}')
    echo "✅ Found function: $FUNCTION_NAME"
  else
    echo "❌ Could not determine function name."
    echo ""
    echo "Please set LAMBDA_FUNCTION_NAME environment variable:"
    echo "  export LAMBDA_FUNCTION_NAME=your-function-name"
    echo "  ./deploy.sh"
    echo ""
    echo "Or pass it directly:"
    echo "  LAMBDA_FUNCTION_NAME=your-function-name ./deploy.sh"
    exit 1
  fi
fi

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
