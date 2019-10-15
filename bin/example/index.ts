import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import codebuild = require('@aws-cdk/aws-codebuild');
import secretsmanager = require('@aws-cdk/aws-secretsmanager');
import changeCase = require('change-case');
import { Secrets } from './secrets';
import { BackendStack } from '../../lib/backend-stack';
import { ApplicationCiEcrStack } from '../../lib/application-ci-ecr-stack';

const app = new cdk.App({
  context: {
    appName: 'example'
  }
});
const appName = app.node.tryGetContext('appName');
const env = app.node.tryGetContext('env');
const secrets = new Secrets(appName, env)

const cdGitRepo = 'example-ecs-fargate-cd';

new BackendStack(app, `${appName}-${env}`, {
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
        containers: [
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
              APP_DEBUG: env === 'prod' ? 'false' : 'true',
              APP_NAME: 'Laravel',
              APP_ENV: env,
              APP_KEY: "base64:1B+4kHLo7Qwn+mSDD/f/Q1RsCwXztUikdb5j8gJ3hkw=",
              APP_URL: "https://app-yoshinori-satoh.com"
            },
            secrets: {
              // APP_KEY: ecs.Secret.fromSecretsManager(secretsmanager.Secret.fromSecretArn(app., "ImportedSecret", {
              //   secretArn: 'arn:aws:secretsmanager:ap-northeast-1:539459320497:secret:/develop/laravel-app-NAHynd'
              // }))
            }
          },
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
            environment: {},
            secrets: {}
          }
        ]
      }
    }
  ],
  cd: {
    git: {
      owner: secrets.backend.cd.git.owner,
      repo: cdGitRepo,
      branch: secrets.backend.cd.git.branch,
      oauthToken: secrets.backend.cd.git.oAuthToken
    }
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
      owner: secrets.application.ci.laravel.git.owner,
      repo: serviceNameLaravel,
      branch: secrets.application.ci.laravel.git.branch,
      oauthToken: secrets.application.ci.laravel.git.oAuthToken
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
    cdGit: {
      owner: secrets.backend.cd.git.owner,
      repo: cdGitRepo,
      branch: secrets.backend.cd.git.branch,
      oauthToken: secrets.backend.cd.git.oAuthToken,
      sshKey: secrets.backend.cd.git.sshkey,
      email: secrets.backend.cd.git.email,
      name: secrets.backend.cd.git.name
    },
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
      computeType: codebuild.ComputeType.SMALL,
      privileged: true
    }
  }
});

app.synth();
