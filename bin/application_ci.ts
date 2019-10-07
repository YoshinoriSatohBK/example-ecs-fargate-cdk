import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import codebuild = require('@aws-cdk/aws-codebuild');
import { ApplicationCiEcrStack } from '../lib/application_ci_ecr_stack';

const app = new cdk.App();
const account = app.node.tryGetContext('account');
const region = app.node.tryGetContext('region');
const domainName = app.node.tryGetContext('domainName');
const appName = app.node.tryGetContext('appName');
const env = app.node.tryGetContext('env');
const branch = app.node.tryGetContext('branch');
const githubOwner = app.node.tryGetContext('githubOwner');

const gitSshkey = cdk.SecretValue.secretsManager(`github-sshkey`);
const oauthToken = cdk.SecretValue.secretsManager(`/${appName}/${env}`, {
  jsonField: 'github-token'
});

new ApplicationCiEcrStack(app, `${domainName}-${appName}-${env}`, {
  env: {
    account: account,
    region: region
  },
  source: {
    owner: githubOwner,
    repo: `laravel-app`,
    branch: branch,
    oauthToken: oauthToken,
  },
  builds: [
    {
      repositoryName: `laravel-app-nginx`,
      dockerfile: 'Dockerfile.nginx',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    },
    {
      repositoryName: 'laravel-app',
      dockerfile: 'Dockerfile',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    }
  ],
  deploies: [
    {
      opsGitRepo: {
        owner: githubOwner,
        repo: `example-ecs-fargate-cd`,
        branch: branch,
        oauthToken: oauthToken,
        sshKey: gitSshkey.toString(),
      },
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    }
  ]
});

app.synth();
