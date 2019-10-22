import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import codebuild = require('@aws-cdk/aws-codebuild');
import ssm = require('@aws-cdk/aws-ssm');
import changeCase = require('change-case');
import { BackendStack } from '../../lib/backend-stack';
import { ApplicationCiEcrStack } from '../../lib/application-ci-ecr-stack';

const app = new cdk.App({
  context: {
    appName: 'example'
  }
});

const parameters = require('./parameters.json');
const secrets = require('./secrets.json');

const appName = app.node.tryGetContext('appName');
const env = app.node.tryGetContext('env');

const backend = new BackendStack(app, `${appName}-${env}`, {
  env: {
    account: app.node.tryGetContext('account'),
    region: app.node.tryGetContext('region')
  },
  vpc: {
    cidr: '10.10.0.0/16'
  },
  route53: {
    hostedZoneId: 'Z20P2QL5U31HW4',
    domain: 'yoshinori-satoh.com',
    subDomain: 'app'
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
  services: [
    {
      targetPort: 80,
      listenerPort: 443,
      ecsServiceProps: {
        name: 'laravel-app',
        desiredCount: 1,
        assignPublicIp: true,
        enableECSManagedTags: true,
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
        healthCheckGracePeriod: cdk.Duration.seconds(60)
      },
      taskDefinitionProps: {
        family: 'laravel-app',
        cpu: 256,
        memoryLimitMiB: 512,
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
            APP_ENV: parameters.app.laravel.env.appEnv,
            APP_DEBUG: parameters.app.laravel.env.appDebug,
            APP_NAME: parameters.app.laravel.env.appName,
            APP_URL: parameters.app.laravel.env.appUrl,
          },
          secrets: {
            APP_KEY: parameters.app.laravel.sec.appKey
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

const serviceNameLaravel = 'laravel-app';
new ApplicationCiEcrStack(app, `${appName}-${serviceNameLaravel}-${env}`, {
  env: {
    account: app.node.tryGetContext('account'),
    region: app.node.tryGetContext('region')
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