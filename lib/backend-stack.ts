import cdk = require('@aws-cdk/core');
import { Construct } from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { Certificate } from '@aws-cdk/aws-certificatemanager';
import ssm = require('@aws-cdk/aws-ssm');
import s3 = require('@aws-cdk/aws-s3');
import kms = require('@aws-cdk/aws-kms');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import route53 = require('@aws-cdk/aws-route53');
import targets = require('@aws-cdk/aws-route53-targets/lib');
import rds = require('@aws-cdk/aws-rds');

import {
  EcsFargateTaskDefinition,
  EcsFargateTaskDefinitionProps,
  TaskDefinitionProps,
  ContainerDefinitionProps
} from './ecs-fargate-task-definition';
import { EcsServiceAlb } from './ecs-service-alb';
import { EcsServiceCd, EcsServiceCdProps } from './ecs-service-cd';
import { SecretManagerUtil, SecretManagerAttributes } from '../utils/secrets-manager';
import { SsmParameterUtil } from '../utils/ssm-parameter';

interface BackendProps extends cdk.StackProps {
  vpc: {
    cidr: string;
  },
  route53: {
    hostedZoneId: string;
    domain: string;
    subDomain: string;
  },
  acm: {
    certificateArn: string;
  },
  services: [
    {
      name: string;
      targetPort: number;
      listenerPort: number;
      desiredCount: number;
      assignPublicIp: boolean;
      enableECSManagedTags: boolean;
      minHealthyPercent: number;
      maxHealthyPercent: number;
      healthCheckGracePeriod: cdk.Duration;
      cpu: number;
      memoryLimitMiB: number;
      taskDefinitionProps: TaskDefinitionProps;
      containerDefinitionPropsArray: Array<ContainerDefinitionProps>;
    }
  ],
  cd: {
    git: {
      owner: ssm.StringParameterAttributes;
      repo: ssm.StringParameterAttributes;
      branch: ssm.StringParameterAttributes;
      oauthToken: SecretManagerAttributes;
    };
  }
}

export class BackendStack extends cdk.Stack {
  constructor(scope: cdk.App, name: string, props: BackendProps) {
    super(scope, name, props);

    const appName = this.node.tryGetContext('appName');
    const env = this.node.tryGetContext('env');

    const vpc = new ec2.Vpc(this, `Vpc`, {
      cidr: props.vpc.cidr,
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

    const ecsCluster = new ecs.Cluster(this, `EcsCluster`, {
      vpc,
      clusterName: `${appName}-${env}`
    });

    props.services.forEach(service => {
      // ALB
      const ecsServiceAlb = new EcsServiceAlb(this, `${service.name}-EcsServiceAlb`, {
        vpc,
        serviceName: service.name
      })

      // ECS Fargate TaskDefinition
      const ecsFargateTaskDefinition = new EcsFargateTaskDefinition(this, `${service.name}-EcsFargateTaskDefinition`, {
        taskDefinitionProps: service.taskDefinitionProps,
        containerDefinitionPropsArray: service.containerDefinitionPropsArray
      });

      // ECS Fargate Service
      const fargateService = new ApplicationLoadBalancedFargateService(this, `${service.name}-FargateService`, {
        cluster: ecsCluster,
        domainName: `${props.route53.subDomain}-${this.node.tryGetContext('env')}`,
        domainZone: route53.HostedZone.fromHostedZoneAttributes(this, `${service.name}-FargateService-Domain`, {
          hostedZoneId: props.route53.hostedZoneId,
          zoneName: props.route53.domain
        }),
        certificate: Certificate.fromCertificateArn(this, `${service.name}-FargateService-Certificate`, props.acm.certificateArn),
        loadBalancer: ecsServiceAlb.alb,
        publicLoadBalancer: true,
        listenerPort: service.listenerPort,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        healthCheckGracePeriod: service.healthCheckGracePeriod,
        assignPublicIp: service.assignPublicIp,
        // cloudMapOptions
        cpu: service.cpu,
        memoryLimitMiB: service.memoryLimitMiB,
        desiredCount: service.desiredCount,
        enableECSManagedTags: service.enableECSManagedTags,
        // propagateTags
        serviceName: service.name,
        taskDefinition: ecsFargateTaskDefinition.taskDefinition
      })

      // ECS Service CD Pipeline
      new EcsServiceCd(this, `${service.name}-EcsServiceCd`, {
        git: {
          owner: SsmParameterUtil.value(this, props.cd.git.owner),
          repo: SsmParameterUtil.value(this, props.cd.git.repo),
          branch: SsmParameterUtil.value(this, props.cd.git.branch),
          oauthToken: SecretManagerUtil.secureValue(this, props.cd.git.oauthToken),
        },
        service: fargateService.service,
        serviceName: service.name
      });
    });
  }
}
