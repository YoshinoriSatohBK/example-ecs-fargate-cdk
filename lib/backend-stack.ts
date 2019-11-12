import cdk = require('@aws-cdk/core');
import { Construct } from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import ssm = require('@aws-cdk/aws-ssm');
import s3 = require('@aws-cdk/aws-s3');
import kms = require('@aws-cdk/aws-kms');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import route53 = require('@aws-cdk/aws-route53');
import targets = require('@aws-cdk/aws-route53-targets/lib');
import rds = require('@aws-cdk/aws-rds');
// import { Mysql } from './mysql';
import {
  EcsFargateTaskDefinition,
  EcsFargateTaskDefinitionProps,
  TaskDefinitionProps,
  ContainerDefinitionProps
} from './ecs-fargate-task-definition';

import { EcsServiceCd, EcsServiceCdProps } from './ecs-service-cd';
import { SecretManagerUtil, SecretManagerAttributes } from '../utils/secrets-manager';
import { SsmParameterUtil } from '../utils/ssm-parameter';

type BackendProps = cdk.StackProps & {
  vpc: {
    cidr: string;
  },
  route53: {
    hostedZoneId: string;
    domain: string;
    subDomain: string;
  },
  acm: {
    certificateArns: Array<string>;
  },
  rds: {
    databaseName: string;
    masterUsername: string;
  },
  services: [
    {
      targetPort: number;
      listenerPort: number;
      ecsServiceProps: {
        name: string;
        desiredCount: number;
        assignPublicIp: boolean;
        enableECSManagedTags: boolean;
        minHealthyPercent: number;
        maxHealthyPercent: number;
        healthCheckGracePeriod: cdk.Duration;
      };
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

    const dbCluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.AURORA,
      masterUser: {
        username: 'admin'
      },
      instanceProps: {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.SMALL),
        vpcSubnets: {
          subnetType: ec2.SubnetType.ISOLATED,
        },
        vpc
      }
    });

    const ecsCluster = new ecs.Cluster(this, `EcsCluster`, {
      clusterName: `${appName}-${env}`,
      vpc
    });

    props.services.forEach(service => {
      // ALB
      const alb = new elbv2.ApplicationLoadBalancer(this, `${service.ecsServiceProps.name}-Alb`, {
        vpc,
        internetFacing: true,
        securityGroup: new ec2.SecurityGroup(this, `${service.ecsServiceProps.name}-lbSecurityGroup`, {
          vpc,
          securityGroupName: `${service.ecsServiceProps.name}-alb-security-group`,
          description: `${service.ecsServiceProps.name} ALB Security Group`,
          allowAllOutbound: true
        })
      });

      // ECS Fargate TaskDefinition
      const ecsFargateTaskDefinitionConstruct = new EcsFargateTaskDefinition(this, `${service.ecsServiceProps.name}-EcsFargateTaskDefinition`, {
        taskDefinitionProps: service.taskDefinitionProps,
        containerDefinitionPropsArray: service.containerDefinitionPropsArray,
      });

      // ECS Fargate Service
      const ecsFargateService = new ecs.FargateService(this, `${service.ecsServiceProps.name}-EcsFargateService`, {
        serviceName: service.ecsServiceProps.name,
        cluster: ecsCluster,
        taskDefinition: ecsFargateTaskDefinitionConstruct.taskDefinition,
        desiredCount: service.ecsServiceProps.desiredCount,
        assignPublicIp: service.ecsServiceProps.assignPublicIp,
        enableECSManagedTags: service.ecsServiceProps.enableECSManagedTags,
        minHealthyPercent: service.ecsServiceProps.minHealthyPercent,
        maxHealthyPercent: service.ecsServiceProps.maxHealthyPercent,
        healthCheckGracePeriod: service.ecsServiceProps.healthCheckGracePeriod,
        securityGroup: new ec2.SecurityGroup(this, `${service.ecsServiceProps.name}-EcsFargateServiceSecurityGroup`, {
          vpc,
          securityGroupName: `${service.ecsServiceProps.name}-service-security-group`,
          description: `${service.ecsServiceProps.name} Service Security Group`,
          allowAllOutbound: true
        }),
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE
        }
      });
      // Set sequrity group from alb to fargate service
      ecsFargateService.connections.allowFrom(alb, new ec2.Port({
        protocol: ec2.Protocol.TCP,
        stringRepresentation: `${service.ecsServiceProps.name} task container access`,
        fromPort: service.targetPort,
        toPort: service.targetPort
      }))

      const listener = alb.addListener(`${service.ecsServiceProps.name}-Listener-HTTPS`, {
        protocol: elbv2.ApplicationProtocol.HTTPS,
        port: service.listenerPort,
        open: true,
        defaultTargetGroups: [
          new elbv2.ApplicationTargetGroup(this, `${service.ecsServiceProps.name}-ApplicationTargetGroup`, {
            vpc,
            protocol: elbv2.ApplicationProtocol.HTTP,
            port: service.targetPort,
            targetGroupName: `${service.ecsServiceProps.name}-TargetGroup`,
            targetType: elbv2.TargetType.IP,
            targets: [ecsFargateService]
          })]
      });
      // Set certificate to alb
      listener.addCertificateArns(`${service.ecsServiceProps.name}-ALlbCertificate`, props.acm.certificateArns);

      // Route53
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, `${service.ecsServiceProps.name}-HostedZone`, {
        hostedZoneId: props.route53.hostedZoneId,
        zoneName: props.route53.domain,
      });
      new route53.ARecord(this, `${service.ecsServiceProps.name}-SiteAliasRecord`, {
        zone,
        recordName: `${props.route53.subDomain}-${this.node.tryGetContext('env')}`,
        target: route53.AddressRecordTarget.fromAlias(new targets.LoadBalancerTarget(alb))
      });

      // ECS Service CD Pipeline
      new EcsServiceCd(this, `${service.ecsServiceProps.name}-EcsServiceCd`, {
        git: {
          owner: SsmParameterUtil.value(this, props.cd.git.owner),
          repo: SsmParameterUtil.value(this, props.cd.git.repo),
          branch: SsmParameterUtil.value(this, props.cd.git.branch),
          oauthToken: SecretManagerUtil.secureValue(this, props.cd.git.oauthToken),
        },
        service: ecsFargateService,
        serviceName: service.ecsServiceProps.name
      });
    });
  }
}
