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

new ApplicationCiEcrStack(app, `${domainName}-${appName}-${env}`, {
  env: {
    account: account,
    region: region
  },
  git: {
    owner: githubOwner,
    repo: appName,
    branch: branch,
    oauthToken: cdk.SecretValue.secretsManager(`/${appName}/${env}`, {
      jsonField: 'github-token'
    })
  },
  builds: [
    {
      repositoryName: `${appName}-nginx`,
      dockerfile: 'Dockerfile.nginx',
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    },
    // {
    //   repositoryName: appName,
    //   dockerfile: 'Dockerfile',
    //   environment: {
    //     buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0,
    //     computeType: codebuild.ComputeType.SMALL,
    //     privileged: true
    //   }
    // }
  ],
  deploies: [
    {
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    }
  ]
});

app.synth();
