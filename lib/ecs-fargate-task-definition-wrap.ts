import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import ecr = require('@aws-cdk/aws-ecr');
import ssm = require('@aws-cdk/aws-ssm');
import logs = require('@aws-cdk/aws-logs');
import iam = require('@aws-cdk/aws-iam');
import { ManagedPolicy } from '@aws-cdk/aws-iam';
import { SecretManagerProps } from './secrets-manager';

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
  environmentSource: EnvironmentSource;
  secretsSource: {
    ssmParameter: {
      [key: string]: ssm.SecureStringParameterAttributes;
    }
  };
  ecr: {
    repositoryName: string;
    imageTag: string;
  };
  portMappings: Array<ecs.PortMapping>;
}

export type EcsFargateTaskDefinitionWrapProps = {
  taskDefinitionProps: TaskDefinitionProps;
  containerDefinitionPropsArray: Array<ContainerDefinitionProps>;
}

export class EcsFargateTaskDefinitionWrap extends cdk.Construct {
  readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(scope: cdk.Construct, name: string, props: EcsFargateTaskDefinitionWrapProps) {
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

      const environment = new Environment(scope, containerDefinitionProps.environmentSource);
      const secrets = new Secret(scope, containerDefinitionProps.secretsSource);
      const containerDefinitionOptions = Object.assign({}, containerDefinitionProps, {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepository, containerDefinitionProps.ecr.imageTag),
        environment: environment.get(),
        secrets:  secrets.get(),
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

type EnvironmentSource = {
  value: {
    [key: string]: string;
  }
  ssmParameter: {
    [key: string]: ssm.StringParameterAttributes;
  }
}
class Environment {
  private environment: {[key: string]: string} = {};

  constructor(scope: cdk.Construct, sourece: EnvironmentSource) {
    for (let [key, value] of Object.entries(sourece.value)) {
      this.environment[key] = value;
    }
    for (let [key, parameter] of Object.entries(sourece.ssmParameter)) {
      this.environment[key] = ssm.StringParameter.valueForStringParameter(scope, parameter.parameterName, parameter.version)
    }
  }
  get() {
    return this.environment;
  }
}

type SecretsSource = {
  ssmParameter: {
    [key: string]: ssm.SecureStringParameterAttributes;
  }
}
class Secret {
  private secret: {[key: string]: ecs.Secret} = {};

  constructor(scope: cdk.Construct, sourece: SecretsSource) {
    for (let [key, parameter] of Object.entries(sourece.ssmParameter)) {
      this.secret[key] = ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(scope, parameter.parameterName, parameter))
    }
  }
  get() {
    return this.secret;
  }
}
