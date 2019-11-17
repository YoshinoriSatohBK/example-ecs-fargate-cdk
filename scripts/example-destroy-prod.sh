#!/bin/sh

npm run build

cdk destroy '*' \
  -a "npx ts-node bin/example/index.ts" \
  -c env=prod

aws s3 rb s3://example-laravel-app-prod-build-artifact --force
aws s3 rb s3://example-laravel-app-prod-deploy-artifact --force
aws logs delete-log-group --log-group-name example-laravel-app-laravel-prod
aws logs delete-log-group --log-group-name example-laravel-app-nginx-prod
