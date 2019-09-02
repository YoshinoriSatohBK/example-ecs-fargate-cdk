#!/bin/sh

npm run build
cdk deploy \
  -a "npx ts-node bin/stack.ts" \
  -c env=dev \
  -c branch=develop

# cdk destroy \
#   -a "npx ts-node bin/stack.ts" \
#   -c env=dev \
#   -c branch=develop