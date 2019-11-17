#!/bin/sh

npm run build

cdk deploy '*' \
  -a "npx ts-node bin/example/index.ts" \
  -c env=prod
