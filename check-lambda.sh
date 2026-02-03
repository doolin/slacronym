#!/bin/bash

set -euo pipefail

FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-slacronym}"
REGION="${AWS_REGION:-us-west-1}"
AWS_PROFILE="${AWS_PROFILE:-terraformer}"

AWS_CLI_ARGS=("--region" "$REGION")
[ -n "$AWS_PROFILE" ] && AWS_CLI_ARGS+=("--profile" "$AWS_PROFILE")

echo "🔍 Checking Lambda function configuration..."
echo ""

aws lambda get-function-configuration \
  "${AWS_CLI_ARGS[@]}" \
  --function-name "$FUNCTION_NAME" \
  --query '{Handler:Handler,Runtime:Runtime,LastModified:LastModified,CodeSize:CodeSize}' \
  --output table

echo ""
echo "📋 To update handler to 'index.handler' if needed:"
echo "  aws lambda update-function-configuration ${AWS_CLI_ARGS[@]} --function-name $FUNCTION_NAME --handler index.handler"
