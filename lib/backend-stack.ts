import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import ssm = require('@aws-cdk/aws-ssm');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import { Certificate } from '@aws-cdk/aws-certificatemanager';
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import route53 = require('@aws-cdk/aws-route53');
import {
  EcsFargateTaskDefinition,
  TaskDefinitionProps,
  ContainerDefinitionProps
} from './ecs-fargate-task-definition';
import { EcsServiceCd } from './ecs-service-cd';
import { SecretManagerUtil, SecretManagerAttributes } from '../utils/secrets-manager';
import { SsmParameterUtil } from '../utils/ssm-parameter';

interface ServiceProps {
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

interface AcmProps {
  certificateArn: string;
}

interface BackendStackProps extends cdk.StackProps {
  vpc: {
    cidr: string;
  },
  route53: {
    hostedZoneId: string;
    domain: string;
    subDomain: string;
  },
  acm: AcmProps;
  services: Array<ServiceProps>;
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
  private vpc: ec2.IVpc;

  constructor(scope: cdk.App, name: string, props: BackendStackProps) {
    super(scope, name, props);

    const appName = this.node.tryGetContext('appName');
    const env = this.node.tryGetContext('env');

    this.vpc = new ec2.Vpc(this, `Vpc`, {
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
      vpc: this.vpc,
      clusterName: `${appName}-${env}`
    });

    props.services.forEach(service => {
      // ECS Fargate TaskDefinition
      const ecsFargateTaskDefinition = new EcsFargateTaskDefinition(this, `${service.name}-EcsFargateTaskDefinition`, {
        taskDefinitionProps: service.taskDefinitionProps,
        containerDefinitionPropsArray: service.containerDefinitionPropsArray
      });

      // ECS Fargate Service
      const fargateService = new ApplicationLoadBalancedFargateService(this, `${service.name}-FargateService`, {
        cluster: ecsCluster,
        domainName: props.route53.subDomain,
        domainZone: route53.HostedZone.fromHostedZoneAttributes(this, `${service.name}-FargateService-Domain`, {
          hostedZoneId: props.route53.hostedZoneId,
          zoneName: props.route53.domain
        }),
        certificate: Certificate.fromCertificateArn(this, `${service.name}-FargateService-Certificate`, props.acm.certificateArn),
        //loadBalancer: ecsServiceAlb.alb,
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
        //serviceName: service.name,
        taskDefinition: ecsFargateTaskDefinition.taskDefinition
      })

      this.setLbListener(service, fargateService)

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

  private setLbListener(serviceProps: ServiceProps, fargateService: ApplicationLoadBalancedFargateService) {
    const httpListener = fargateService.loadBalancer.addListener(`${serviceProps.name}-listener-http`, {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      open: true,
      defaultTargetGroups: []
    });
    httpListener.addRedirectResponse('ssl-redirect', {
      statusCode: 'HTTP_302',
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: '443'
    });

    // 認証アクションがまだcfnリソースでしか提供されていない
    new elbv2.CfnListenerRule(this, 'LoginListenerRule', {
      conditions: [{
        field: 'path-pattern',
        values: ['/login']
      }],
      listenerArn: fargateService.listener.listenerArn,
      priority: 10,
      actions: [{
        type: 'authenticate-cognito',
        order: 1,
        authenticateCognitoConfig: {
          onUnauthenticatedRequest: 'authenticate',
          userPoolArn: 'arn:aws:cognito-idp:ap-northeast-1:539459320497:userpool/ap-northeast-1_DCSnU6CvJ',
          userPoolClientId: '49mk9h8g6mopge7coisn67mi34',
          userPoolDomain: 'example-laravel'
        }
      }, {
        type: 'redirect',
        order: 2,
        redirectConfig: {
          statusCode: 'HTTP_302',
          path: '/',
          protocol: 'HTTPS'
        }
      }]
    })
    new elbv2.CfnListenerRule(this, 'ApiListenerRule', {
      conditions: [{
        field: 'path-pattern',
        values: ['/api']
      }],
      listenerArn: fargateService.listener.listenerArn,
      priority: 5,
      actions: [{
        type: 'authenticate-cognito',
        order: 1,
        authenticateCognitoConfig: {
          onUnauthenticatedRequest: 'allow',
          userPoolArn: 'arn:aws:cognito-idp:ap-northeast-1:539459320497:userpool/ap-northeast-1_DCSnU6CvJ',
          userPoolClientId: '49mk9h8g6mopge7coisn67mi34',
          userPoolDomain: 'example-laravel'
        }
      }, {
        type: 'forward',
        order: 2,
        targetGroupArn: fargateService.targetGroup.targetGroupArn
      }]
    })
  }
}

