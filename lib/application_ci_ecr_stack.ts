import cdk = require('@aws-cdk/core');
import { App, Stack, StackProps, Construct } from '@aws-cdk/core';
import ecr = require('@aws-cdk/aws-ecr');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');
import kms = require('@aws-cdk/aws-kms');
import s3 = require('@aws-cdk/aws-s3');

interface Build{
  repositoryName: string;
  dockerfile: string;
  environment: any;
}

interface Deploy{
  environment: any;
}

interface ApplicationCiEcrProps extends StackProps {
  git: {
    owner: string
    repo: string
    branch: string
    oauthToken: cdk.SecretValue
  }
  builds: Array<Build>
  deploies: Array<Deploy>
}

export class ApplicationCiEcrStack extends Stack {
  constructor(app: App, name: string, props: ApplicationCiEcrProps) {
    super(app, name, props);

    // Service role for codepipeline.
    const codePipelineRole = new iam.Role(this, `${name}-CodePipelineRole`, {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com')
    });
    codePipelineRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));

    // Service role for codebuild.
    const codeBuildRole = new iam.Role(this, `${name}-CodeBuildRole`, {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com')
    });
    codeBuildRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));

    // Codepipeline artifacts.
    const sourceOutput = new codepipeline.Artifact('app-code');

    const sourceOutputArtifactBucket = new s3.Bucket(this, 'SourceOutputArtifactBucket', {
      encryptionKey: new kms.Key(this, name)
    });

    const pipeline = new codepipeline.Pipeline(this, `${name}-CodePipiline`, {
      role: codePipelineRole,
      artifactBucket: sourceOutputArtifactBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: 'Source',
              owner: props.git.owner,
              repo: props.git.repo,
              oauthToken: props.git.oauthToken,
              output: sourceOutput,
              branch: props.git.branch,
              trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
            })
          ],
        },
        {
          stageName: 'Build',
          actions: (new ImageBuilds(this, `${name}-ImageBuilds`, {
            builds: props.builds,
            input: sourceOutput,
            codeBuildRole: codeBuildRole
          })).resources.map(resource => resource.codeBuildAction),
        },
        // {
        //   stageName: 'PrepareDeploy',
        //   actions: new ImageDeploies(this, `${name}-ImageDeploies`, {
        //     deploies: props.deploies,
        //     input: sourceOutput,
        //     codeBuildRole: codeBuildRole
        //   }).resources.map(resource => resource.codeBuildAction),
        // }
      ]
    })
  }
}


interface ImageBuildProps{
  builds: Array<Build>;
  input: codepipeline.Artifact;
  codeBuildRole: iam.Role;
}

interface ImageBuildResource {
  ecrRepository: ecr.Repository;
  codeBuildAction: codepipeline_actions.CodeBuildAction;
}

export class ImageBuilds extends Construct {
  readonly resources: Array<ImageBuildResource>;

  constructor(scope: Construct, name: string, props: ImageBuildProps) {
    super(scope, name);

    // Buildspec for ImageBuild action.
    const buildspec = {
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

    this.resources = props.builds.map((build: Build): ImageBuildResource => {
      const repository = new ecr.Repository(scope, `${name}-Ecr-${build.repositoryName}`, {
        repositoryName: build.repositoryName
      });

      const codeBuildAction = new codepipeline_actions.CodeBuildAction({
        actionName: `${name}-ImageBuild-${build.repositoryName}`,
        project: new codebuild.PipelineProject(scope, `${name}-CodebuildProject-${build.repositoryName}`, {
          role: props.codeBuildRole,
          environment: build.environment,
          environmentVariables: {
            AWS_ACCOUNT_ID: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: scope.node.tryGetContext('account')
            },
            AWS_REGION: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: scope.node.tryGetContext('region')
            },
            ENV: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: scope.node.tryGetContext('env')
            },
            REPO_NAME: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: build.repositoryName
            },
            DOCKERFILE: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: build.dockerfile
            }
          },
          buildSpec: codebuild.BuildSpec.fromObject(buildspec)
        }),
        input: props.input
      })
      return {
        ecrRepository: repository,
        codeBuildAction: codeBuildAction
      }
    })
  }
}



interface ImageDeployProps{
  deploies: Array<Deploy>;
  input: codepipeline.Artifact;
  codeBuildRole: iam.Role;
}

interface ImageDeployResource {
  codeBuildAction: codepipeline_actions.CodeBuildAction;
}

export class ImageDeploies extends Construct {
  readonly resources: Array<ImageDeployResource>;

  constructor(scope: Construct, name: string, props: ImageDeployProps) {
    super(scope, name);

    const buildspec = {
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
      // artifacts: {
      //   files: [
      //     'imagedefinitions.json'
      //   ]
      // }
    }

    this.resources = props.deploies.map((deploy: Deploy): ImageDeployResource => {
      const codeBuildAction = new codepipeline_actions.CodeBuildAction({
        actionName: `${name}-PrepareDeploy`,
        project: new codebuild.PipelineProject(scope, `${name}-CodebuildProject-PrepareDeploy`, {
          role: props.codeBuildRole,
          environment: deploy.environment,
          environmentVariables: {
            AWS_ACCOUNT_ID: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: scope.node.tryGetContext('account')
            },
            AWS_REGION: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: scope.node.tryGetContext('region')
            },
            ENV: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: scope.node.tryGetContext('env')
            }
          },
          buildSpec: codebuild.BuildSpec.fromObject(buildspec)
        }),
        input: props.input
      })
      return {
        codeBuildAction: codeBuildAction
      }
    })
  }
}
