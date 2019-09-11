import cdk = require('@aws-cdk/core');
import { Construct, Duration } from '@aws-cdk/core';
import ecs = require('@aws-cdk/aws-ecs');
import ecr = require('@aws-cdk/aws-ecr');
import rds = require('@aws-cdk/aws-rds');

interface FargateTaskDefinitionLaravelConfEcrProps {
  repositoryName: string;
  tag: string;
}

export interface FargateTaskDefinitionLaravelProps {
  conf: {
    rds?:{
      databaseInstance: rds.IDatabaseInstance;
      databaseName: string;
      masterUsername: string;
    },
    ecr: {
      nginx: FargateTaskDefinitionLaravelConfEcrProps;
      laravel: FargateTaskDefinitionLaravelConfEcrProps;
    }
  }
}

export class FargateTaskDefinitionLaravel extends Construct {
  readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(parent: Construct, name: string, props: FargateTaskDefinitionLaravelProps) {
    super(parent, name);
    const ctx = parent.node.tryGetContext('ctx');

    // Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'FargateTaskDefinition', {
      memoryLimitMiB: 512,
      cpu: 256
    });

    // Add laravel container images to Tast Definition
    const ecrRepositoryNginx = ecr.Repository.fromRepositoryName(parent, 'LaravelNginxEcrRepository', props.conf.ecr.nginx.repositoryName);
    const containerDefinitionlNginx = this.taskDefinition.addContainer("ContainerDefinitionlNginx", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepositoryNginx, props.conf.ecr.nginx.tag)
    });
    containerDefinitionlNginx.addPortMappings({
      containerPort: 80,
      hostPort: 80,
      protocol: ecs.Protocol.TCP
    });

    // Add nginx container images to Tast Definition
    let environment = {};
    if (props.conf.rds) {
      environment = {
        DB_HOST: props.conf.rds.databaseInstance.instanceEndpoint.hostname,
        DB_PORT: String(props.conf.rds.databaseInstance.instanceEndpoint.port),
        DB_SOCKET: props.conf.rds.databaseInstance.instanceEndpoint.socketAddress,
        DB_DATABASE: props.conf.rds.databaseName,
        DB_USERNAME: props.conf.rds.masterUsername
      };
    }
    const ecrRepositoryLaravel = ecr.Repository.fromRepositoryName(parent, 'LravelAppEcrRepository', props.conf.ecr.laravel.repositoryName);
    const containerDefinitionLaravel = this.taskDefinition.addContainer("ContainerDefinitionLaravel", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepositoryLaravel, props.conf.ecr.laravel.tag),
      workingDirectory: '/var/www/html',
      environment: environment
    });
    containerDefinitionLaravel.addPortMappings({
      containerPort: 9000,
      hostPort: 9000,
      protocol: ecs.Protocol.TCP
    });
  }
}
