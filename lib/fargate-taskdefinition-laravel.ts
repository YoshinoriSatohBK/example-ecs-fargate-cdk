import cdk = require('@aws-cdk/core');
import { Construct, Duration } from '@aws-cdk/core';
import ecs = require('@aws-cdk/aws-ecs');
import ecr = require('@aws-cdk/aws-ecr');
import rds = require('@aws-cdk/aws-rds');
import logs = require('@aws-cdk/aws-logs');
import iam = require('@aws-cdk/aws-iam');

export interface FargateTaskDefinitionLaravelConfEcrProps {
  repositoryName: string;
  tag: string;
}

interface FargateTaskDefinitionLaravelProps {
  ecr: {
    nginx: FargateTaskDefinitionLaravelConfEcrProps;
    laravel: FargateTaskDefinitionLaravelConfEcrProps;
  },
  cpu: number;
  memoryLimitMiB: number;
  environment: any;
  secrets: any;
}

export class FargateTaskDefinitionLaravel extends Construct {
  readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(parent: Construct, name: string, props: FargateTaskDefinitionLaravelProps) {
    super(parent, name);

    // Task Definition
    const taskExecutionRole = new iam.Role(this, `FargateTaskDefinitionTaskExecutionRole`, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });
    taskExecutionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));

    const taskRole = new iam.Role(this, `FargateTaskDefinitionTaskRole`, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));

    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'FargateTaskDefinition', {
      family: `${parent.node.tryGetContext('appName')}-${parent.node.tryGetContext('env')}`,
      cpu: props.cpu,
      memoryLimitMiB: props.memoryLimitMiB,
      executionRole: taskExecutionRole,
      taskRole: taskRole
    });

    // Add laravel container images to Tast Definition
    const ecrRepositoryNginx = ecr.Repository.fromRepositoryName(parent, 'LaravelNginxEcrRepository', props.ecr.nginx.repositoryName);
    const containerDefinitionlNginx = this.taskDefinition.addContainer("ContainerDefinitionlNginx", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepositoryNginx, props.ecr.nginx.tag),
      logging: new ecs.AwsLogDriver({
        logGroup: new logs.LogGroup(parent, 'LogGroupNginx', {
          logGroupName: 'laravel-app-nginx',
          retention: logs.RetentionDays.TWO_WEEKS
        }),
        streamPrefix: 'ecs'
      })
    });
    containerDefinitionlNginx.addPortMappings({
      containerPort: 80,
      hostPort: 80,
      protocol: ecs.Protocol.TCP
    });

    const ecrRepositoryLaravel = ecr.Repository.fromRepositoryName(parent, 'LravelAppEcrRepository', props.ecr.laravel.repositoryName);
    const containerDefinitionLaravel = this.taskDefinition.addContainer("ContainerDefinitionLaravel", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepositoryLaravel, props.ecr.laravel.tag),
      workingDirectory: '/var/www/html',
      environment: props.environment,
      secrets: props.secrets,
      logging: new ecs.AwsLogDriver({
        logGroup: new logs.LogGroup(parent, 'LogGroupLaravel', {
          logGroupName: 'laravel-app',
          retention: logs.RetentionDays.TWO_WEEKS
        }),
        streamPrefix: 'ecs'
      })
    });
    containerDefinitionLaravel.addPortMappings({
      containerPort: 9000,
      hostPort: 9000,
      protocol: ecs.Protocol.TCP
    });
  }
}
