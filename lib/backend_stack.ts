import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import route53 = require('@aws-cdk/aws-route53');
import targets = require('@aws-cdk/aws-route53-targets/lib');
import codebuild = require('@aws-cdk/aws-codebuild');
import secretsmanager = require('@aws-cdk/aws-secretsmanager');
import { Mysql } from './mysql';
import { FargateTaskDefinitionLaravel } from '../lib/fargate-taskdefinition-laravel';
import { FargateService } from './fargate-service';
import { ImageCi } from './image-ci';

interface ecrRepository {
  repositoryName: string;
  tag: string;
}

interface BackendProps extends cdk.StackProps {
  vpc: {
    cidr: string;
  },
  route53: {
    hostedZoneId: string;
    domain: string;
    subDomain: string;
  },
  ecr: {
    nginx: ecrRepository;
    laravel: ecrRepository;
  },
  acm: {
    certificateArns: Array<string>;
  },
  rds: {
    databaseName: string;
    masterUsername: string;
  },
  ecs: {
    cpu: number;
    memoryLimitMiB: number;
  }
}

export class BackendStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: BackendProps) {
    super(parent, name, props);

    const env =parent.node.tryGetContext('env');

    const vpc = new ec2.Vpc(this, 'Vpc', {
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

    // const rdsConstruct = new Mysql(this, 'Mysql', {
    //   vpc,
    //   rds: {
    //     databaseName: props.rds.databaseName,
    //     masterUsername: props.rds.masterUsername
    //   }
    // })

    const ecsCluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc
    });

    const taskDefinitionConstruct = new FargateTaskDefinitionLaravel(this, 'FargateTaskDefinitionLaravel', {
      ecr: {
        nginx: {
          repositoryName: props.ecr.nginx.repositoryName,
          tag: props.ecr.nginx.tag
        },
        laravel: {
          repositoryName: props.ecr.laravel.repositoryName,
          tag: props.ecr.laravel.tag
        }
      },
      cpu: props.ecs.cpu,
      memoryLimitMiB: props.ecs.memoryLimitMiB,
      environment: {
        // DB_HOST: rdsConstruct.databaseInstance.instanceEndpoint.hostname,
        // DB_PORT: String(rdsConstruct.databaseInstance.instanceEndpoint.port),
        // DB_SOCKET: rdsConstruct.databaseInstance.instanceEndpoint.socketAddress,
        DB_DATABASE: props.rds.databaseName,
        DB_USERNAME: props.rds.masterUsername,
        APP_DEBUG: env === 'prod' ? 'false' : 'true',
        APP_NAME: 'Laravel',
        APP_ENV: env,
        APP_KEY: "base64:1B+4kHLo7Qwn+mSDD/f/Q1RsCwXztUikdb5j8gJ3hkw=",
        APP_URL: `https://${props.route53.subDomain}-${env}/${props.route53.domain}`
      },
      secrets: {
        // APP_KEY: ecs.Secret.fromSecretsManager(secretsmanager.Secret.fromSecretAttributes(this, "ImportedSecret", {
        //   secretArn: 'arn:aws:secretsmanager:ap-northeast-1:539459320497:secret:/develop/laravel-app-NAHynd'
        // }))
      }
    });

    const fargateServiceBackendConstruct = new FargateService(this, 'FargateServiceLaravel', {
      vpc,
      ecsCluster,
      taskDefinition: taskDefinitionConstruct.taskDefinition,
      acm: {
        certificateArns: props.acm.certificateArns
      },
      route53: {
        hostedZoneId: props.route53.hostedZoneId,
        domain: props.route53.domain,
        subDomain: props.route53.subDomain
      },
    });
  }
}
