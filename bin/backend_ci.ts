import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import { BackendCiStack } from '../lib/backend_ci_stack';

const stackName = 'backend-ci';

const app = new cdk.App();
const account = app.node.tryGetContext('account');
const region = app.node.tryGetContext('region');
const appName = app.node.tryGetContext('appName');
const env = app.node.tryGetContext('env');
const branch = app.node.tryGetContext('branch');
const githubOwner = app.node.tryGetContext('githubOwner');

new BackendCiStack(app, `${appName}-${stackName}-${env}`, {
  env: {
    account: account,
    region: region
  },
  ecr: {
    nginx: {
      repositoryName: `${appName}-nginx`,
      tag: env,
      dockerfile: 'Dockerfile.nginx'
    },
    laravel: {
      repositoryName: appName,
      tag: env,
      dockerfile: 'Dockerfile'
    }
  },
  git: {
    owner: githubOwner,
    repo: appName,
    branch: branch
  }
});

app.synth();
