#!/bin/sh

npm run build

cdk deploy '*' \
  -a "npx ts-node bin/example/index.ts" \
  -c account=539459320497 \
  -c region=ap-northeast-1 \
  -c env=dev
