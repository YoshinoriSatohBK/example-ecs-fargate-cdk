import cdk = require('@aws-cdk/core');
import { App, Stack, StackProps, Construct, SecretValue } from '@aws-cdk/core';
import ecr = require('@aws-cdk/aws-ecr');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');

interface Git{
  owner: string;
  repo: string;
  branch: string;
  oauthToken: SecretValue;
  sshKey?: string;
}

interface Build{
  repositoryName: string;
  dockerfile: string;
  environment: any;
}

interface Deploy{
  opsGitRepo: Git;
  environment: any;
}

interface ApplicationCiEcrProps extends StackProps {
  source: Git;
  builds: Array<Build>;
  deploies: Array<Deploy>;
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
    //const cdkSourceArtifact = new codepipeline.Artifact('CDK_SOURCE');
    const applicationSourceArtifact = new codepipeline.Artifact('APPLICATION_SOURCE');
    const pipeline = new codepipeline.Pipeline(this, `${name}-CodePipiline`, {
      role: codePipelineRole,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: `${name}-application-Source`,
              owner: props.source.owner,
              repo: props.source.repo,
              oauthToken: props.source.oauthToken,
              output: applicationSourceArtifact,
              branch: props.source.branch,
              trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
            })
          ]
        },
        {
          stageName: 'Build',
          actions: props.builds.map(build => {
            return new ImageBuild(this, `${name}-Build-${build.repositoryName}`, {
              build: build,
              input: applicationSourceArtifact,
              codeBuildRole: codeBuildRole
            }).codeBuildAction
          })
        },
        {
          stageName: 'PrepareDeploy',
          actions: props.deploies.map(deploy => {
            return new ImageDeploy(this, `${name}-PrepareDeploy`, {
              deploy: deploy,
              input: applicationSourceArtifact,
              codeBuildRole: codeBuildRole
            }).codeBuildAction
          })
        }
      ]
    })
  }
}

interface ImageBuildProps{
  build: Build;
  input: codepipeline.Artifact;
  codeBuildRole: iam.Role;
}

export class ImageBuild extends Construct {
  readonly codeBuildAction: codepipeline_actions.CodeBuildAction;

  constructor(scope: Construct, name: string, props: ImageBuildProps) {
    super(scope, name);

    // Buildspec for ImageBuild action.
    const buildspec = {
      version: '0.2',
      phases: {
        install: {
          "runtime-versions": {
            docker: 18
          },
        },
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
            `docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG`,
          ]
        }
      }
    }

    this.codeBuildAction = new codepipeline_actions.CodeBuildAction({
      actionName: `${name}-ImageBuild-${props.build.repositoryName}`,
      project: new codebuild.PipelineProject(this, `${name}-CodebuildProject-${props.build.repositoryName}`, {
        role: props.codeBuildRole,
        environment: props.build.environment,
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
            value: props.build.repositoryName
          },
          DOCKERFILE: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.build.dockerfile
          }
        },
        buildSpec: codebuild.BuildSpec.fromObject(buildspec),
        cache: codebuild.Cache.local(codebuild.LocalCacheMode.DOCKER_LAYER)
      }),
      input: props.input
    })
  }
}



interface ImageDeployProps{
  deploy: Deploy;
  input: codepipeline.Artifact;
  codeBuildRole: iam.Role;
}

export class ImageDeploy extends Construct {
  readonly codeBuildAction: codepipeline_actions.CodeBuildAction;

  constructor(scope: Construct, name: string, props: ImageDeployProps) {
    super(scope, name);

    const buildspec = {
      version: "0.2",
      phases: {
        install: {
          "runtime-versions": {
            docker: 18
          },
          commands: [
            "mkdir -p ~/.ssh",
            "echo \"$GIT_SSHKEY\" > ~/.ssh/id_rsa",
            "chmod 600 ~/.ssh/id_rsa",
            "ssh-keygen -F github.com || ssh-keyscan github.com >>~/.ssh/known_hosts",
            'git config --global user.email "yoshinori.satoh.tokyo@gmail.com"',
            'git config --global user.name "deployer"',
            "apt-get install wget",
            "wget https://github.com/github/hub/releases/download/v2.12.8/hub-linux-amd64-2.12.8.tgz",
            "tar -xzvf hub-linux-amd64-2.12.8.tgz",
            "mv hub-linux-amd64-2.12.8/bin/hub /usr/bin/hub"
          ]
        },
        pre_build: {
          commands: [
            "IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)",
          ]
        },
        build: {
          commands: [
            "git clone git@github.com:${GIT_OWNER}/${GIT_REPO}.git",
            "cd ${GIT_REPO}",
            "git checkout -b deploy/${IMAGE_TAG}",
            "cd ${APP_NAME}",
            "sed -i -e \"s/\\\"imageUri\\\": \\(.*\\):.*/\\\"imageUri\\\": \\1:${IMAGE_TAG}/g\" imagedefinitions.json",
            "git add imagedefinitions.json"
          ]
        },
        post_build: {
          commands: [
            "git commit -m \"deploy ${IMAGE_TAG}\"",
            "git push origin deploy/${IMAGE_TAG}",
            "/usr/bin/hub pull-request -b ${GIT_BRANCH} -m \"deploy/${IMAGE_TAG}\""
          ]
        }
      }
    }

    this.codeBuildAction = new codepipeline_actions.CodeBuildAction({
      actionName: `${name}-PrepareDeploy`,
      project: new codebuild.PipelineProject(this, `${name}-CodebuildProject-PrepareDeploy`, {
        role: props.codeBuildRole,
        environment: props.deploy.environment,
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
          APP_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: scope.node.tryGetContext('appName')
          },
          GIT_OWNER: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.opsGitRepo.owner
          },
          GIT_REPO: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.opsGitRepo.repo
          },
          GIT_BRANCH: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.opsGitRepo.branch
          },
          GIT_SSHKEY: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.opsGitRepo.sshKey
          },
          GITHUB_TOKEN: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.opsGitRepo.oauthToken
          }
        },
        buildSpec: codebuild.BuildSpec.fromObject(buildspec)
      }),
      input: props.input
    })
  }
}
