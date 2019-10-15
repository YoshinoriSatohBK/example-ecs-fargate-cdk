#!/bin/sh

npm run build

cdk destroy '*' \
  -a "npx ts-node bin/example/index.ts" \
  -c account=539459320497 \
  -c region=ap-northeast-1 \
  -c env=dev

aws s3 rb s3://example-laravel-app-dev-build-artifact --force
aws s3 rb s3://example-laravel-app-dev-deploy-artifact --force
aws logs delete-log-group --log-group-name example-laravel-app-laravel-dev
aws logs delete-log-group --log-group-name example-laravel-app-nginx-dev
