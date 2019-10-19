import cdk = require('@aws-cdk/core');
import ecr = require('@aws-cdk/aws-ecr');
import ssm = require('@aws-cdk/aws-ssm');
import s3 = require('@aws-cdk/aws-s3');
import kms = require('@aws-cdk/aws-kms');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');

type Build = {
  repositoryName: string;
  dockerfile: string;
  environment: any;
}

type PrepareDeploy = {
  git: {
    owner: ssm.StringParameterAttributes;
    repo: ssm.StringParameterAttributes;
    branch: ssm.StringParameterAttributes;
    oauthToken: ssm.SecureStringParameterAttributes;
    config: {
      name: ssm.StringParameterAttributes;
      email: ssm.StringParameterAttributes;
    }
    sshKey: ssm.SecureStringParameterAttributes;
  };
  environment: any;
}

type ApplicationCiEcrProps = cdk.StackProps & {
  serviceName: string;
  source: {
    git: {
      owner: ssm.StringParameterAttributes;
      repo: ssm.StringParameterAttributes;
      branch: ssm.StringParameterAttributes;
      oauthToken: ssm.SecureStringParameterAttributes;
    };
  };
  builds: Array<Build>;
  deploy: PrepareDeploy;
}

export class ApplicationCiEcrStack extends cdk.Stack {
  constructor(app: cdk.App, name: string, props: ApplicationCiEcrProps) {
    super(app, name, props);

    const appName = this.node.tryGetContext('appName');
    const env = this.node.tryGetContext('env');

    // Service role for codebuild.
    const codeBuildRole = new iam.Role(this, `${props.serviceName}-CodeBuildRole`, {
      roleName: `${appName}-${name}-${env}-codebuild-role`,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
      ]
    });

    // Codepipeline artifacts.
    const sourceArtifact = new codepipeline.Artifact('source');
    const pipeline = new codepipeline.Pipeline(this, `${props.serviceName}-build-CodePipiline`, {
      artifactBucket: new s3.Bucket(this, `${props.serviceName}-build-ArtifactBucket`, {
        bucketName: `${appName}-${props.serviceName}-${env}-build-artifact`,
        encryptionKey: new kms.Key(this, `${props.serviceName}-build-EncryptionKey`, {
          alias: `${appName}-${props.serviceName}-build-${env}`,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        })
      }),
      pipelineName: `${appName}-${props.serviceName}-${env}-build-pipeline`,
      role: new iam.Role(this, `${appName}-${props.serviceName}-${env}-CodePipelineRole`, {
        roleName: `${appName}-${name}-${env}-build-pipeline-Role`,
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
              owner: ssm.StringParameter.valueForStringParameter(this, props.source.git.owner.parameterName, props.source.git.owner.version),
              repo: ssm.StringParameter.valueForStringParameter(this, props.source.git.repo.parameterName, props.source.git.repo.version),
              branch: ssm.StringParameter.valueForStringParameter(this, props.source.git.branch.parameterName, props.source.git.branch.version),
              oauthToken: cdk.SecretValue.ssmSecure(props.source.git.oauthToken.parameterName, props.source.git.oauthToken.version.toString()),
              output: sourceArtifact,
              trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
            })
          ]
        },
        {
          stageName: 'Build',
          actions: props.builds.map(build => {
            return this.imageBuildAction({
              serviceName: props.serviceName,
              build: build,
              input: sourceArtifact,
              codeBuildRole: codeBuildRole
            })
          })
        },
        {
          stageName: 'PrepareDeploy',
          actions: [
            this.prepareDepoyBuildAction({
              serviceName: props.serviceName,
              deploy: props.deploy,
              input: sourceArtifact,
              codeBuildRole: codeBuildRole
            })
          ]
        }
      ]
    })
  }

  private imageBuildAction(props: {
    serviceName: string,
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
    serviceName: string,
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
            'git config --global user.email ${GITHUB_EMAIL}',
            'git config --global user.name ${GITHUB_NAME}',
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
            "cd ecs/${SERVICE_NAME}",
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


    const owner = ssm.StringParameter.valueForStringParameter(this, props.deploy.git.owner.parameterName, props.deploy.git.owner.version);
    const repo = ssm.StringParameter.valueForStringParameter(this, props.deploy.git.repo.parameterName, props.deploy.git.repo.version);
    const branch = ssm.StringParameter.valueForStringParameter(this, props.deploy.git.branch.parameterName, props.deploy.git.branch.version);
    const oauthToken = cdk.SecretValue.ssmSecure(props.deploy.git.oauthToken.parameterName, props.deploy.git.oauthToken.version.toString());
    const name = ssm.StringParameter.valueForStringParameter(this, props.deploy.git.config.name.parameterName, props.deploy.git.config.name.version);
    const email = ssm.StringParameter.valueForStringParameter(this, props.deploy.git.config.email.parameterName, props.deploy.git.config.email.version);
    const sshKey = cdk.SecretValue.ssmSecure(props.deploy.git.sshKey.parameterName, props.deploy.git.sshKey.version.toString());
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
          SERVICE_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.serviceName
          },
          GIT_OWNER: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: owner
          },
          GIT_REPO: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: repo
          },
          GIT_BRANCH: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: branch
          },
          GIT_SSHKEY: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: sshKey
          },
          GITHUB_TOKEN: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: oauthToken
          },
          GITHUB_EMAIL: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: email
          },
          GITHUB_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: name
          }
        },
        buildSpec: codebuild.BuildSpec.fromObject(buildspec)
      }),
      input: props.input
    })
  }
}
