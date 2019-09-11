#!/usr/bin/env node
import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import route53 = require('@aws-cdk/aws-route53');
import targets = require('@aws-cdk/aws-route53-targets/lib');
import codebuild = require('@aws-cdk/aws-codebuild');
import { Mysql } from '../lib/mysql';
import { FargateTaskDefinitionLaravel } from '../lib/fargate-taskdefinition-laravel';
// import { FargateService } from '../lib/fargate-service';
import { Ingress } from '../lib/ingress';
import { ImageCi } from '../lib/image-ci';
// import { FargateCd } from '../lib/fargate-cd';

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
  }
};

class LaravelStack extends cdk.Stack {

  constructor(parent: cdk.App, name: string, props: cdk.StackProps) {
    super(parent, name, props);

    const vpc = new ec2.Vpc(this, 'Vpc', {
      cidr: conf.vpc.cidr,
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Ingress',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Application',
          subnetType: ec2.SubnetType.PRIVATE,
        },
        {
          cidrMask: 28,
          name: 'Database',
          subnetType: ec2.SubnetType.ISOLATED,
        }
      ],
    });

      // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
        vpc,
        securityGroupName: 'alb-security-group',
        description: 'ALB Security Group',
        allowAllOutbound: true
      })
    });
    // const listener = alb.addListener('Listener', {
    //   protocol: elbv2.ApplicationProtocol.HTTPS,
    //   port: 443,
    //   open: true
    // });

    // Set certificate to alb
    //listener.addCertificateArns('ALBCertificate', props.conf.acm.certificateArns);

    // Route53
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: conf.route53.hostedZoneId,
      zoneName: conf.route53.domain,
    });
    new route53.ARecord(this, 'SiteAliasRecord', {
      zone,
      recordName: 'app',
      target: route53.AddressRecordTarget.fromAlias(new targets.LoadBalancerTarget(alb))
    });

    // const rdsConstruct = new Mysql(this, 'Mysql', {
    //   vpc: vpcConstruct.vpc,
    //   appName: ctx.appName,
    //   conf: conf.rds
    // })

    const ecsCluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc
    });

    const taskDefinitionConstruct = new FargateTaskDefinitionLaravel(this, 'FargateTaskDefinitionLaravel', {
      conf: {
        // rds: Object.assign({}, conf.rds, {
        //   databaseInstance: rdsConstruct.databaseInstance
        // }),
        ecr: conf.ecr
      }
    });

    // const fargateServiceLaravelConstruct = new FargateService(this, 'FargateServiceLaravel', {
    //   vpc: vpcConstruct.vpc,
    //   ecsCluster,
    //   taskDefinition: taskDefinitionConstruct.taskDefinition,
    //   conf: {
    //     acm: conf.acm,
    //     route53: conf.route53
    //   }
    // });

    const imageCiLaravel = new ImageCi(this, 'ImageCiLaravel', {
      git: conf.git,
      ecr: conf.ecr.laravel,
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    });

    const imageCiNginx = new ImageCi(this, 'ImageCiNginx', {
      git: conf.git,
      ecr: conf.ecr.nginx,
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
        environmentVariables: {
          DOCKERFILE: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: 'Dockerfile.nginx'
          }
        }
      }
    });
  }
}

new LaravelStack(app, `${ctx.appName}-${ctx.env}`, {
  env: {
    account: ctx.account,
    region: ctx.region
  }
});

app.synth();
