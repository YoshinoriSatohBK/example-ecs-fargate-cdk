#!/usr/bin/env node
import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import { Vpc } from '../lib/vpc';
import { Mysql } from '../lib/mysql';
import { FargateTaskDefinitionLaravel } from '../lib/fargate-taskdefinition-laravel';
import { FargateService } from '../lib/fargate-service';

const appName = 'laravel-app'
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
      repositoryName: 'laravel-nginx',
      tag: 'prod'
    },
    laravel: {
      repositoryName: 'laravel-app',
      tag: 'prod'
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
  }
};

class LaravelStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: cdk.StackProps) {
    super(parent, name, props);

    const vpcConstruct = new Vpc(this, 'Vpc', {
      cidr: conf.vpc.cidr
    });

    const rdsConstruct = new Mysql(this, 'Rds', {
      vpc: vpcConstruct.vpc,
      appName,
      conf: conf.rds
    })

    const ecsCluster = new ecs.Cluster(this, 'Cluster', {
      vpc: vpcConstruct.vpc
    });

    const taskDefinitionConstruct = new FargateTaskDefinitionLaravel(this, 'FargateTaskDefinitionLaravel', {
      conf: {
        rds: Object.assign({}, conf.rds, {
          databaseInstance: rdsConstruct.databaseInstance
        }),
        ecr: conf.ecr
      }
    });

    const ecsConstruct = new FargateService(this, 'FargateService', {
      vpc: vpcConstruct.vpc,
      ecsCluster,
      taskDefinition: taskDefinitionConstruct.taskDefinition,
      serviceName: 'LaravelApp',
      conf: {
        acm: conf.acm,
        route53: conf.route53
      }
    });
  }
}

const app = new cdk.App();
new LaravelStack(app, `${appName}-${app.node.tryGetContext('env')}`, {
  env: {
    account: app.node.tryGetContext('account'),
    region: app.node.tryGetContext('region')
  }
});

app.synth();