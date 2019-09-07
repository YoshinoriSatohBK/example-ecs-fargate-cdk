#!/usr/bin/env node
import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import codebuild = require('@aws-cdk/aws-codebuild');
import { Vpc } from '../lib/vpc';
import { Mysql } from '../lib/mysql';
import { FargateTaskDefinitionLaravel } from '../lib/fargate-taskdefinition-laravel';
import { FargateService } from '../lib/fargate-service';
import { ImageCi } from '../lib/image-ci';

import { Context } from '../context/context';

const app = new cdk.App();
const ctx = new Context(app.node);
app.node.setContext('ctx', ctx);

const conf = {
  vpc: {
    cidr: '10.10.0.0/16'
  },
  route53: {
    hostedZoneId: 'Z20P2QL5U31HW4',
    domain: 'yoshinori-satoh.com'
  },
  ecr: {
    nginx: {
      repositoryName: `${ctx.appName}-nginx`,
      tag: ctx.env
    },
    laravel: {
      repositoryName: ctx.appName,
      tag: ctx.env
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
  git: {
    owner: 'YoshinoriSatoh',
    repo: ctx.appName,
    branch: ctx.branch
  },
  buildspec: {
    version: '0.2',
    phases: {
      pre_build: {
        commands: [
          `$(aws ecr get-login --no-include-email --region ${ctx.region})`
        ]
      },
      build: {
        commands: [
          `docker build -t ${ctx.appName}:${ctx.env} DOCKERFILE`
        ]
      },
      post_build: {
        commands: [
          `docker tag ${ctx.appName}:${ctx.env} ${ctx.account}.dkr.ecr.${ctx.region}.amazonaws.com/${ctx.appName}:${ctx.env}`,
          `docker push ${ctx.account}.dkr.ecr.${ctx.region}.amazonaws.com/${ctx.appName}:${ctx.env}`
        ]
      }
    }
  }
};

class LaravelStack extends cdk.Stack {

  constructor(parent: cdk.App, name: string, props: cdk.StackProps) {
    super(parent, name, props);

    const vpcConstruct = new Vpc(this, ctx.cid('Vpc'), {
      cidr: conf.vpc.cidr
    });

    const rdsConstruct = new Mysql(this, ctx.cid('Mysql'), {
      vpc: vpcConstruct.vpc,
      appName: ctx.appName,
      conf: conf.rds
    })

    const ecsCluster = new ecs.Cluster(this, ctx.cid('EcsCluster'), {
      vpc: vpcConstruct.vpc
    });

    const taskDefinitionConstruct = new FargateTaskDefinitionLaravel(this, ctx.cid('FargateTaskDefinitionLaravel'), {
      conf: {
        rds: Object.assign({}, conf.rds, {
          databaseInstance: rdsConstruct.databaseInstance
        }),
        ecr: conf.ecr
      }
    });

    const fargateServiceLaravelConstruct = new FargateService(this, ctx.cid('FargateServiceLaravel'), {
      vpc: vpcConstruct.vpc,
      ecsCluster,
      taskDefinition: taskDefinitionConstruct.taskDefinition,
      conf: {
        acm: conf.acm,
        route53: conf.route53
      }
    });

    const imageCiLaravel = new ImageCi(this, ctx.cid('ImageCiLaravel'), {
      git: conf.git,
      ecr: conf.ecr.laravel,
      buildSpec: conf.buildspec,
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    });

    const imageCiNginx = new ImageCi(this, ctx.cid('ImageCiNginx'), {
      git: conf.git,
      ecr: conf.ecr.nginx,
      buildSpec: conf.buildspec,
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
        environmentVariables: {
          DOCKERFILE: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: './Dockerfile.nginx'
          }
        }
      }
    });
  }
}

new LaravelStack(app, `${ctx.appName}-${ctx.env}`, {
  env: {
    account: ctx.appName,
    region: ctx.region
  }
});

app.synth();