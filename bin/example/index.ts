import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import codebuild = require('@aws-cdk/aws-codebuild');
import changeCase = require('change-case');
import { SsmParameter } from './ssm-parameter';
import { BackendStack } from '../../lib/backend-stack';
import { ApplicationCiEcrStack } from '../../lib/application-ci-ecr-stack';

const app = new cdk.App({
  context: {
    appName: 'example'
  }
});

const appName = app.node.tryGetContext('appName');
const env = app.node.tryGetContext('env');
const ssmParameter = new SsmParameter(appName, env);

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
              value: {
                APP_ENV: env,
              },
              ssmParameter: {
                APP_DEBUG: ssmParameter.app.laravel.environment.appDebug,
                APP_NAME: ssmParameter.app.laravel.environment.appName,
                APP_URL: ssmParameter.app.laravel.environment.appUrl
              }
            },
            secrets: {
              ssmParameter: {
                APP_KEY: ssmParameter.app.laravel.secrets.appKey
              }
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
            environment: {
              value: {
              },
              ssmParameter: {
              }
            },
            secrets: {
              ssmParameter: {
              }
            }
          }
        ]
      }
    }
  ],
  cd: {
    git: {
      owner: ssmParameter.cd.git.owner,
      repo: ssmParameter.cd.git.repo,
      branch: ssmParameter.cd.git.branch,
      oauthToken: ssmParameter.cd.git.oAuthToken,
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
      owner: ssmParameter.app.laravel.git.owner,
      repo: ssmParameter.app.laravel.git.repo,
      branch: ssmParameter.app.laravel.git.branch,
      oauthToken: ssmParameter.app.laravel.git.oAuthToken,
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
      owner: ssmParameter.cd.git.owner,
      repo: ssmParameter.cd.git.repo,
      branch: ssmParameter.cd.git.branch,
      oauthToken: ssmParameter.cd.git.oAuthToken,
      config: {
        name: ssmParameter.cd.git.config.name,
        email: ssmParameter.cd.git.config.email,
      },
      sshKey: ssmParameter.cd.git.sshKey,
    },
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
      computeType: codebuild.ComputeType.SMALL,
      privileged: true
    }
  }
});

app.synth();
