#!/bin/sh

npm run build
cdk deploy \
  -a "npx ts-node bin/laravel.ts" \
  -c env=prod \
  -c branch=master \
  -c account=539459320497 \
  -c region=ap-northeast-1
