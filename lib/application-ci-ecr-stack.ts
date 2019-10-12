import cdk = require('@aws-cdk/core');
import ecr = require('@aws-cdk/aws-ecr');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');

type Git = {
  owner: string;
  repo: string;
  branch: string;
  oauthToken: cdk.SecretValue;
  sshKey?: string;
}

type Build = {
  repositoryName: string;
  dockerfile: string;
  environment: any;
}

type PrepareDeploy = {
  cdGit: Git;
  environment: any;
}

type ApplicationCiEcrProps = cdk.StackProps & {
  serviceName: string;
  source: {
    git: Git;
  };
  builds: Array<Build>;
  deploy: PrepareDeploy;
}

export class ApplicationCiEcrStack extends cdk.Stack {
  constructor(app: cdk.App, name: string, props: ApplicationCiEcrProps) {
    super(app, name, props);

    // Service role for codebuild.
    const codeBuildRole = new iam.Role(this, `${props.serviceName}-CodeBuildRole`, {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
      ]
    });

    // Codepipeline artifacts.
    //const cdkSourceArtifact = new codepipeline.Artifact('CDK_SOURCE');
    const applicationSourceArtifact = new codepipeline.Artifact('APPLICATION_SOURCE');
    const pipeline = new codepipeline.Pipeline(this, `${props.serviceName}-CodePipiline`, {
      pipelineName: `${props.serviceName}-pipeline`,
      role: new iam.Role(this, `${props.serviceName}-CodePipelineRole`, {
        assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
        ]
      }),
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: `${props.serviceName}-application-Source`,
              owner: props.source.git.owner,
              repo: props.source.git.repo,
              oauthToken: props.source.git.oauthToken,
              branch: props.source.git.branch,
              output: applicationSourceArtifact,
              trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
            })
          ]
        },
        {
          stageName: 'Build',
          actions: props.builds.map(build => {
            return this.imageBuildAction({
              build: build,
              input: applicationSourceArtifact,
              codeBuildRole: codeBuildRole
            })
          })
        },
        {
          stageName: 'PrepareDeploy',
          actions: [
            this.prepareDepoyBuildAction({
              deploy: props.deploy,
              input: applicationSourceArtifact,
              codeBuildRole: codeBuildRole
            })
          ]
        }
      ]
    })
  }

  private imageBuildAction(props: {
    build: Build,
    input: codepipeline.Artifact,
    codeBuildRole: iam.Role,
  }): codepipeline_actions.CodeBuildAction {
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

    return new codepipeline_actions.CodeBuildAction({
      actionName: `${props.build.repositoryName}-ImageBuild`,
      project: new codebuild.PipelineProject(this, `${props.build.repositoryName}-CodebuildProject`, {
        role: props.codeBuildRole,
        environment: props.build.environment,
        environmentVariables: {
          AWS_ACCOUNT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.node.tryGetContext('account')
          },
          AWS_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.node.tryGetContext('region')
          },
          ENV: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.node.tryGetContext('env')
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

  private prepareDepoyBuildAction(props: {
    deploy: PrepareDeploy,
    input: codepipeline.Artifact,
    codeBuildRole: iam.Role
  }): codepipeline_actions.CodeBuildAction {
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

    return new codepipeline_actions.CodeBuildAction({
      actionName: `PrepareDeploy`,
      project: new codebuild.PipelineProject(this, `CodebuildProject-PrepareDeploy`, {
        role: props.codeBuildRole,
        environment: props.deploy.environment,
        environmentVariables: {
          AWS_ACCOUNT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.node.tryGetContext('account')
          },
          AWS_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.node.tryGetContext('region')
          },
          ENV: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.node.tryGetContext('env')
          },
          APP_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.node.tryGetContext('appName')
          },
          GIT_OWNER: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.cdGit.owner
          },
          GIT_REPO: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.cdGit.repo
          },
          GIT_BRANCH: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.cdGit.branch
          },
          GIT_SSHKEY: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.cdGit.sshKey
          },
          GITHUB_TOKEN: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.deploy.cdGit.oauthToken
          }
        },
        buildSpec: codebuild.BuildSpec.fromObject(buildspec)
      }),
      input: props.input
    })
  }
}
