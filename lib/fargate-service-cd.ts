import cdk = require('@aws-cdk/core');
import { Construct, Duration, SecretsManagerSecretOptions } from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import route53 = require('@aws-cdk/aws-route53');
import targets = require('@aws-cdk/aws-route53-targets/lib');
import ecr = require('@aws-cdk/aws-ecr');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');

const buildspecBuild = {
  version: '0.2',
  phases: {
    pre_build: {
      commands: [
        "$(aws ecr get-login --no-include-email --region $AWS_REGION)",
        'IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)'
      ]
    },
    build: {
      commands: [
        `docker build -t $REPO_NAME:$IMAGE_TAG -f $DOCKERFILE .`
      ]
    },
    post_build: {
      commands: [
        `docker tag $REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG`,
        `docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG`
      ]
    }
  }
}

const buildspecPrepareDeploy = {
  version: '0.2',
  phases: {
    build: {
      commands: [
        'REPOSITORY_URI_LARAVEL=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPOSITORY_NAME_LARAVEL}',
        'REPOSITORY_URI_NGINX=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPOSITORY_NAME_NGINX}',
        'IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)'
      ]
    },
    post_build: {
      commands: [
        "echo \"[{\\\"name\\\":\\\"${CONTAINER_NAME_LARAVEL}\\\",\\\"imageUri\\\":\\\"${REPOSITORY_URI_LARAVEL}:${IMAGE_TAG}\\\"},{\\\"name\\\":\\\"${CONTAINER_NAME_NGINX}\\\",\\\"imageUri\\\":\\\"${REPOSITORY_URI_NGINX}:${IMAGE_TAG}\\\"}]\" > imagedefinitions.json"
      ]
    }
  },
  artifacts: {
    files: [
      'imagedefinitions.json'
    ]
  }
}

interface ecrRepository {
  repositoryName: string;
  dockerfile: string;
}

interface FargateServiceCdProps {
  git: {
    owner: string;
    repo: string;
    branch: string;
  };
  ecr: {
    nginx: ecrRepository;
    laravel: ecrRepository;
  };
  service: ecs.FargateService;
  environment: any;
}

export class FargateServiceCd extends Construct {
  constructor(parent: Construct, name: string, props: FargateServiceCdProps) {
    super(parent, name);

    const codeBuildRole = new iam.Role(this, `ServiceCdCodeBuildRole`, {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com')
    });
    codeBuildRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));

    const codePipelineRole = new iam.Role(this, `ServiceCdCodePipelineRole`, {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com')
    });
    codePipelineRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));

    const repository_laravel = new ecr.Repository(parent, `Repository-${props.ecr.laravel.repositoryName}`, {
      repositoryName: props.ecr.laravel.repositoryName
    });

    const repository_nginx = new ecr.Repository(parent, `Repository-${props.ecr.nginx.repositoryName}`, {
      repositoryName: props.ecr.nginx.repositoryName
    });

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();
    const prepareDeployOutput = new codepipeline.Artifact();
    const pipeline = new codepipeline.Pipeline(this, 'FargateServiceCdPipiline', {
      role: codePipelineRole,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: 'GitHub_Source',
              owner: props.git.owner,
              repo: props.git.repo,
              oauthToken: cdk.SecretValue.secretsManager('/laravel-app/prod', {
                jsonField: 'github-token'
              }),
              output: sourceOutput,
              branch: props.git.branch,
              trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
            })
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'BuildNginx',
              project: new codebuild.PipelineProject(this, `CodebuildProjectCdNginx`, {
                role: codeBuildRole,
                environment: props.environment,
                environmentVariables: {
                  AWS_ACCOUNT_ID: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: parent.node.tryGetContext('account')
                  },
                  AWS_REGION: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: parent.node.tryGetContext('region')
                  },
                  ENV: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: parent.node.tryGetContext('env')
                  },
                  REPO_NAME: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.ecr.nginx.repositoryName
                  },
                  DOCKERFILE: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.ecr.nginx.dockerfile
                  }
                },
                buildSpec: codebuild.BuildSpec.fromObject(buildspecBuild)
              }),
              input: sourceOutput
            }),
            new codepipeline_actions.CodeBuildAction({
              actionName: 'BuildLaravel',
              project: new codebuild.PipelineProject(this, `CodebuildProjectCdLaravel`, {
                role: codeBuildRole,
                environment: props.environment,
                environmentVariables: {
                  AWS_ACCOUNT_ID: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: parent.node.tryGetContext('account')
                  },
                  AWS_REGION: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: parent.node.tryGetContext('region')
                  },
                  ENV: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: parent.node.tryGetContext('env')
                  },
                  REPO_NAME: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.ecr.laravel.repositoryName
                  },
                  DOCKERFILE: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.ecr.laravel.dockerfile
                  }
                },
                buildSpec: codebuild.BuildSpec.fromObject(buildspecBuild)
              }),
              input: sourceOutput
            })
          ],
        },
        {
          stageName: 'PrepareDeploy',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'CodeBuild',
              project: new codebuild.PipelineProject(this, `CodebuildProjectCd`, {
                role: codeBuildRole,
                environment: props.environment,
                environmentVariables: {
                  AWS_ACCOUNT_ID: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: parent.node.tryGetContext('account')
                  },
                  AWS_REGION: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: parent.node.tryGetContext('region')
                  },
                  ENV: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: parent.node.tryGetContext('env')
                  },
                  REPOSITORY_NAME_NGINX: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.ecr.nginx.repositoryName
                  },
                  REPOSITORY_NAME_LARAVEL: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.ecr.laravel.repositoryName
                  },
                  CONTAINER_NAME_NGINX: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: 'ContainerDefinitionlNginx'
                  },
                  CONTAINER_NAME_LARAVEL: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: 'ContainerDefinitionLaravel'
                  }
                },
                buildSpec: codebuild.BuildSpec.fromObject(buildspecPrepareDeploy)
              }),
              input: sourceOutput,
              outputs: [
                prepareDeployOutput
              ]
            })
          ],
        },
        {
          stageName: 'EcsDeploy',
          actions: [
            new codepipeline_actions.EcsDeployAction({
              actionName: 'DeployAction',
              service: props.service,
              input: prepareDeployOutput,
            }),
          ],
        },
      ],
    });
  }
}
