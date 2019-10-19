import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import ssm = require('@aws-cdk/aws-ssm');
import s3 = require('@aws-cdk/aws-s3');
import kms = require('@aws-cdk/aws-kms');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import route53 = require('@aws-cdk/aws-route53');
import targets = require('@aws-cdk/aws-route53-targets/lib');
import { Mysql } from './mysql';
import { EcsFargateTaskDefinition, EcsFargateTaskDefinitionProps } from './ecs-fargate-task-definition';
import { EcsFargateServiceCd, EcsFargateServiceCdProps, EcsFargateServiceCdGit } from './ecs-fargate-service-cd';
import { S3Code } from '@aws-cdk/aws-lambda';

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
      taskDefinitionProps: EcsFargateTaskDefinitionProps;
    }
  ],
  cd: {
    git: {
      owner: ssm.StringParameterAttributes;
      repo: ssm.StringParameterAttributes;
      branch: ssm.StringParameterAttributes;
      oauthToken: ssm.SecureStringParameterAttributes;
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

    // // const rdsConstruct = new Mysql(this, 'Mysql', {
    // //   vpc,
    // //   rds: {
    // //     databaseName: props.rds.databaseName,
    // //     masterUsername: props.rds.masterUsername
    // //   }
    // // })

    const ecsCluster = new ecs.Cluster(this, `EcsCluster`, {
      clusterName: `${appName}-${env}`,
      vpc
    });

    props.services.forEach(service => {
      console.log('----------')
      console.log(service.ecsServiceProps.name)
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
      const ecsFargateTaskDefinitionConstruct = new EcsFargateTaskDefinition(this, `${service.ecsServiceProps.name}-EcsFargateTaskDefinition`, Object.assign(service.taskDefinitionProps, {
        containers: service.taskDefinitionProps.containers.map(container => {
          let environment: {[x: string]: any} = {};
          for (let [key, value] of Object.entries(container.environment.value)) {
            environment[key] = value
          }
          for (let [key, parameter] of Object.entries(container.environment.ssmParameter)) {
            environment[key] = ssm.StringParameter.valueForStringParameter(this, parameter.parameterName, parameter.version)
          }

          let secrets: {[x: string]: any} = {};
          for (let [key, parameter] of Object.entries(container.secrets.ssmParameter)) {
            secrets[key] = ssm.StringParameter.valueForSecureStringParameter(this, parameter.parameterName, parameter.version)
          }
          console.log(secrets)

          Object.assign(container, {
            environment,
            secrets
          })
        })
      }));

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
      new EcsFargateServiceCd(this, `${service.ecsServiceProps.name}-FargateServiceCd`, {
        git: {
          owner: ssm.StringParameter.valueForStringParameter(this, props.cd.git.owner.parameterName, props.cd.git.owner.version),
          repo: ssm.StringParameter.valueForStringParameter(this, props.cd.git.repo.parameterName, props.cd.git.repo.version),
          branch: ssm.StringParameter.valueForStringParameter(this, props.cd.git.branch.parameterName, props.cd.git.branch.version),
          oauthToken: cdk.SecretValue.ssmSecure(props.cd.git.oauthToken.parameterName, props.cd.git.oauthToken.version.toString())
        },
        service: ecsFargateService,
        serviceName: service.ecsServiceProps.name
      });
    });
  }
}
