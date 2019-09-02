#!/usr/bin/env node
import 'source-map-support/register';
import { Environment } from '../utility/environment';
import cdk = require('@aws-cdk/core');
import { Vpc } from '../lib/vpc';
import { Rds } from '../lib/rds';
import { Ecs } from '../lib/ecs';


class Stack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: cdk.StackProps) {
    super(parent, name, props);

    const vpcConstruct = new Vpc(this, 'Vpc', {
      cidr: '10.1.0.0/16'
    });

    const ecsConstruct = new Ecs(this, 'Ecs', {
      vpc: vpcConstruct.vpc
    });

    // const rdsConstruct = new Rds(this, 'Rds', {
    //   vpc: vpcConstruct.vpc
    // });
  }
}

const app = new cdk.App();
new Stack(app, `stack-${Environment.getEnv(app.node)}`, {
  env: {
    region: 'ap-northeast-1'
  }
});

app.synth();