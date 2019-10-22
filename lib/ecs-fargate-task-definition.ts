import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import ecr = require('@aws-cdk/aws-ecr');
import ssm = require('@aws-cdk/aws-ssm');
import logs = require('@aws-cdk/aws-logs');
import iam = require('@aws-cdk/aws-iam');
import { ManagedPolicy } from '@aws-cdk/aws-iam';
import { SecretManagerUtil, SecretManagerAttributes } from '../utils/secrets-manager';
import { SsmParameterUtil } from '../utils/ssm-parameter';

export type TaskDefinitionProps = {
  family: string;
  cpu?: number;
  memoryLimitMiB?: number;
}

export type ContainerDefinitionProps = {
  name: string;
  cpu?: number;
  memoryLimitMiB?: number;
  memoryReservationMiB?: number;
  workingDirectory?: string;
  environment?: {
    [key: string]: ssm.StringParameterAttributes;
  };
  secrets?: {
    [key: string]: ssm.SecureStringParameterAttributes;
  };
  ecr: {
    repositoryName: string;
    imageTag: string;
  };
  portMappings: Array<ecs.PortMapping>;
}

export type EcsFargateTaskDefinitionProps = {
  taskDefinitionProps: TaskDefinitionProps;
  containerDefinitionPropsArray: Array<ContainerDefinitionProps>;
}

export class EcsFargateTaskDefinition extends cdk.Construct {
  readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(scope: cdk.Construct, name: string, props: EcsFargateTaskDefinitionProps) {
    super(scope, name);

    const appName = scope.node.tryGetContext('appName');
    const env = scope.node.tryGetContext('env');

    // Task Definition
    const fargateTaskDefinitionProps = Object.assign({}, props.taskDefinitionProps, {
      family: `${props.taskDefinitionProps.family}-${env}`,
      executionRole: new iam.Role(this, `${props.taskDefinitionProps.family}-EcsFargateTaskDefinitionTaskExecutionRole`, {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
        ]
      }),
      taskRole: new iam.Role(this, `${props.taskDefinitionProps.family}-EcsargateTaskDefinitionTaskRole`, {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
        ]
      })
    });
    this.taskDefinition = new ecs.FargateTaskDefinition(this, `${props.taskDefinitionProps.family}-EcsFargateTaskDefinition`, fargateTaskDefinitionProps);

    // Add container images to Task Definition
    props.containerDefinitionPropsArray.forEach(containerDefinitionProps => {
      const ecrRepository = ecr.Repository.fromRepositoryName(scope, `${containerDefinitionProps.name}-EcrRepository`, containerDefinitionProps.ecr.repositoryName);

      let environment: {[key: string]: string} = {};
      if (containerDefinitionProps.environment) {
        for (let [key, parameter] of Object.entries(containerDefinitionProps.environment)) {
          environment[key] = SsmParameterUtil.value(scope, parameter);
        }
      }
      let secrets: {[key: string]: ecs.Secret} = {};
      if (containerDefinitionProps.secrets) {
        for (let [key, parameter] of Object.entries(containerDefinitionProps.secrets)) {
          secrets[key] = SsmParameterUtil.ecsSecret(scope, parameter);
        }
      }
      const containerDefinitionOptions = Object.assign({}, containerDefinitionProps, {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepository, containerDefinitionProps.ecr.imageTag),
        environment,
        secrets,
        logging: new ecs.AwsLogDriver({
          logGroup: new logs.LogGroup(scope, `${containerDefinitionProps.name}-LogGroup`, {
            logGroupName: `${appName}-${props.taskDefinitionProps.family}-${containerDefinitionProps.name}-${env}`,
            retention: logs.RetentionDays.TWO_WEEKS
          }),
          streamPrefix: containerDefinitionProps.name
        })
      });
      const containerDefinition = this.taskDefinition.addContainer(containerDefinitionProps.name, containerDefinitionOptions);
      containerDefinitionProps.portMappings.forEach(mapping => containerDefinition.addPortMappings(mapping));
    });
  }
}
