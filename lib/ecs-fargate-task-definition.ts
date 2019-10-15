import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import ecr = require('@aws-cdk/aws-ecr');
import logs = require('@aws-cdk/aws-logs');
import iam = require('@aws-cdk/aws-iam');
import { ManagedPolicy } from '@aws-cdk/aws-iam';

type ContainerDefinitionProps = {
  name: string;
  cpu?: number;
  memoryLimitMiB?: number;
  memoryReservationMiB?: number;
  workingDirectory?: string;
  environment?: {
    [key: string]: string;
  };
  secrets?: {
    [key: string]: ecs.Secret;
  };
  ecr: {
    repositoryName: string;
    imageTag: string;
  };
  portMappings: Array<ecs.PortMapping>;
}

export type EcsFargateTaskDefinitionProps = {
  family: string;
  cpu?: number;
  memoryLimitMiB?: number;
  containers: Array<ContainerDefinitionProps>;
}

export class EcsFargateTaskDefinition extends cdk.Construct {
  readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(scope: cdk.Construct, name: string, props: EcsFargateTaskDefinitionProps) {
    super(scope, name);

    const appName = scope.node.tryGetContext('appName');
    const env = scope.node.tryGetContext('env');

    // Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, `${props.family}-EcsFargateTaskDefinition2`, Object.assign({}, props, {
      family: `${props.family}-${env}`,
      executionRole: new iam.Role(this, `${props.family}-EcsFargateTaskDefinitionTaskExecutionRole`, {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
        ]
      }),
      taskRole: new iam.Role(this, `${props.family}-EcsargateTaskDefinitionTaskRole`, {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
        ]
      })
    }));

    // Add container images to Task Definition
    props.containers.forEach(container => {
      const ecrRepository = ecr.Repository.fromRepositoryName(scope, `${container.name}-EcrRepository`, container.ecr.repositoryName);
      const containerDefinition = this.taskDefinition.addContainer(container.name, Object.assign({}, container, {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepository, container.ecr.imageTag),
        logging: new ecs.AwsLogDriver({
          logGroup: new logs.LogGroup(scope, `${container.name}-LogGroup`, {
            logGroupName: `${appName}-${props.family}-${container.name}-${env}`,
            retention: logs.RetentionDays.TWO_WEEKS
          }),
          streamPrefix: container.name
        })
      }));
      container.portMappings.forEach(mapping => containerDefinition.addPortMappings(mapping));
    });
  }
}
