import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import { BackendStack } from '../lib/backend_stack';

const stackName = 'backend';

const app = new cdk.App();
const account = app.node.tryGetContext('account');
const region = app.node.tryGetContext('region');
const appName = app.node.tryGetContext('appName');
const env = app.node.tryGetContext('env');

new BackendStack(app, `${appName}-${stackName}-${env}`, {
  env: {
    account: account,
    region: region
  },
  vpc: {
    cidr: '10.10.0.0/16'
  },
  route53: {
    hostedZoneId: 'Z20P2QL5U31HW4',
    domain: 'yoshinori-satoh.com',
    subDomain: 'app'
  },
  ecr: {
    nginx: {
      repositoryName: `${appName}-nginx`,
      tag: env
    },
    laravel: {
      repositoryName: appName,
      tag: env,
    }
  },
  acm: {
    certificateArns: [
      'arn:aws:acm:ap-northeast-1:539459320497:certificate/83e8a598-0701-478a-b539-06407d00bbe4'
    ]
  },
  rds: {
    databaseName: 'appDatabase',
    masterUsername: 'syscdk'
  },
  ecs: {
    cpu: 256,
    memoryLimitMiB: 512,
  }
});

app.synth();
