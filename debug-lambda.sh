#!/bin/bash

set -euo pipefail

FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-slacronym}"
REGION="${AWS_REGION:-us-west-1}"
AWS_PROFILE="${AWS_PROFILE:-terraformer}"

AWS_CLI_ARGS=("--region" "$REGION")
[ -n "$AWS_PROFILE" ] && AWS_CLI_ARGS+=("--profile" "$AWS_PROFILE")

echo "🔍 Lambda Function Configuration:"
echo "=================================="
aws lambda get-function-configuration \
  "${AWS_CLI_ARGS[@]}" \
  --function-name "$FUNCTION_NAME" \
  --query '{Handler:Handler,Runtime:Runtime,Timeout:Timeout,MemorySize:MemorySize,LastModified:LastModified}' \
  --output table

echo ""
echo "📋 Recent Logs (last 5 minutes):"
echo "=================================="
aws logs tail "/aws/lambda/$FUNCTION_NAME" \
  "${AWS_CLI_ARGS[@]}" \
  --since 5m \
  --format short 2>&1 | tail -20 || echo "Could not fetch logs"

echo ""
echo "💡 To see full logs:"
echo "  aws logs tail /aws/lambda/$FUNCTION_NAME ${AWS_CLI_ARGS[@]} --follow"
