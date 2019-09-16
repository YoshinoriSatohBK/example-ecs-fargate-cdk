#!/bin/sh

npm run build

cdk deploy \
  -a "npx ts-node bin/backend_ci.ts" \
  -c account=539459320497 \
  -c region=ap-northeast-1 \
  -c appName=laravel-app \
  -c env=dev \
  -c branch=develop \
  -c githubOwner=YoshinoriSatoh

# aws codebuild import-source-credentials --server-type GITHUB --auth-type PERSONAL_ACCESS_TOKEN --token <token_value>

# aws codebuild import-source-credentials \
#   --server-type GITHUB \
#   --auth-type PERSONAL_ACCESS_TOKEN \
#   --token <token_value>
