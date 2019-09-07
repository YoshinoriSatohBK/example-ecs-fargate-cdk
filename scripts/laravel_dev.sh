#!/bin/sh

npm run build
cdk deploy \
  -a "npx ts-node bin/laravel.ts" \
  -c appName=laravel-app \
  -c env=dev \
  -c branch=develop \
  -c account=539459320497 \
  -c region=ap-northeast-1

# aws codebuild import-source-credentials --server-type GITHUB --auth-type PERSONAL_ACCESS_TOKEN --token <token_value>

# aws codebuild import-source-credentials \
#   --server-type GITHUB \
#   --auth-type PERSONAL_ACCESS_TOKEN \
#   --token <token_value>
