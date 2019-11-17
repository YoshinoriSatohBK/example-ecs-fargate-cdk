import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import { Aws } from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import rds = require('@aws-cdk/aws-rds');
import codebuild = require('@aws-cdk/aws-codebuild');
import ssm = require('@aws-cdk/aws-ssm');
import changeCase = require('change-case');
import { BackendStack } from '../../lib/backend-stack';
import { ApplicationCiEcrStack } from '../../lib/application-ci-ecr-stack';

// CDKアプリケーション with コンテキスト
const app = new cdk.App({
  context: {
    appName: 'example'
  }
});
const appName = app.node.tryGetContext('appName');

// 環境名と各環境依存のプロパティ
const env = app.node.tryGetContext('env')
const servicesForEnv = env === 'prod' ? {
  cpu: 512,
  memoryLimitMiB: 1024,
} : {
  cpu: 256,
  memoryLimitMiB: 512,
}

// 登登録済みの SSM Parameter Store と Secrets managerのフィールド名リストを取得
const parameters = require('./parameters.json');
const secrets = require('./secrets.json');

// バックエンドスタック作成
const backend = new BackendStack(app, `${appName}-${env}`, {
  env: {
    account: Aws.ACCOUNT_ID,
    region: Aws.REGION
  },
  vpc: {
    cidr: '10.10.0.0/16'
  },
  route53: {
    hostedZoneId: 'Z3N49X3U5XDHKP',
    domain: 'yoshinori-satoh.net',
    subDomain: 'app'
  },
  acm: {
    certificateArn: `arn:aws:acm:${Aws.REGION}:${Aws.ACCOUNT_ID}:certificate/42a4089e-8453-43cc-8b66-e206aad647a5`
  },
  services: [
    {
      name: 'laravel-app',
      targetPort: 80,
      listenerPort: 443,
      desiredCount: 1,
      assignPublicIp: true,
      enableECSManagedTags: true,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      cpu: servicesForEnv.cpu,
      memoryLimitMiB: servicesForEnv.memoryLimitMiB,
      taskDefinitionProps: {
        family: 'laravel-app',
      },
      containerDefinitionPropsArray: [
        {
          name: 'nginx',
          workingDirectory: '/var/www/html',
          ecr: {
            repositoryName: 'laravel-app-nginx',
            imageTag: '825fcec'
          },
          portMappings: [
            {
              containerPort: 80,
              hostPort: 80,
              protocol: ecs.Protocol.TCP
            }
          ],
        },
        {
          name: 'laravel',
          ecr: {
            repositoryName: 'laravel-app',
            imageTag: '825fcec'
          },
          portMappings: [
            {
              containerPort: 9000,
              hostPort: 9000,
              protocol: ecs.Protocol.TCP
            }
          ],
          environment: {
            ssmStringParameterAttributes: {
              APP_ENV: parameters.app.laravel.env.appEnv,
              APP_DEBUG: parameters.app.laravel.env.appDebug,
              APP_NAME: parameters.app.laravel.env.appName,
              APP_URL: parameters.app.laravel.env.appUrl,
            }
          },
          secrets: {
            ssmSecureStringParameterAttributes: {
              APP_KEY: parameters.app.laravel.sec.appKey
            }
          },
        }
      ]
    }
  ],
  cd: {
    git: {
      owner: parameters.cd.git.owner,
      repo: parameters.cd.git.repo,
      branch: parameters.cd.git.branch,
      oauthToken: secrets.cd.git.oauthToken
    },
  }
});


// アアアプリケーションCIスタック作成
const serviceNameLaravel = 'laravel-app';
new ApplicationCiEcrStack(app, `${appName}-${serviceNameLaravel}-${env}`, {
  env: {
    account: Aws.ACCOUNT_ID,
    region: Aws.REGION
  },
  serviceName: serviceNameLaravel,
  source: {
    git: {
      owner: parameters.app.laravel.git.owner,
      repo: parameters.app.laravel.git.repo,
      branch: parameters.app.laravel.git.branch,
      oauthToken: secrets.app.laravel.git.oauthToken,
    }
  },
  builds: [
    {
      repositoryName: `${serviceNameLaravel}-nginx`,
      dockerfile: 'Dockerfile.nginx',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    },
    {
      repositoryName: serviceNameLaravel,
      dockerfile: 'Dockerfile',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    }
  ],
  deploy: {
    git: {
      owner: parameters.cd.git.owner,
      repo: parameters.cd.git.repo,
      branch: parameters.cd.git.branch,
      oauthToken: secrets.cd.git.oauthToken,
      config: {
        name: parameters.cd.git.config.name,
        email: parameters.cd.git.config.email,
      },
      sshKey: secrets.cd.git.sshKey,
    },
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
      computeType: codebuild.ComputeType.SMALL,
      privileged: true
    }
  }
});

app.synth();
