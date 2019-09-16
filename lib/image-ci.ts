import cdk = require('@aws-cdk/core');
import { Construct } from '@aws-cdk/core';
import ecr = require('@aws-cdk/aws-ecr');
import codebuild = require('@aws-cdk/aws-codebuild');
import iam = require('@aws-cdk/aws-iam');

const buildspec = {
  version: '0.2',
  phases: {
    pre_build: {
      commands: [
        "$(aws ecr get-login --no-include-email --region $AWS_REGION)"
      ]
    },
    build: {
      commands: [
        `docker build -t $REPO_NAME:$ENV -f $DOCKERFILE .`
      ]
    },
    post_build: {
      commands: [
        `docker tag $REPO_NAME:$ENV $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:$ENV`,
        `docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:$ENV`
      ]
    }
  }
}

export interface ImageCiProps {
  git: {
    owner: string;
    repo: string;
    branch: string;
  };
  ecr: {
    repositoryName: string,
    tag: string,
    dockerfile: string;
  };
  environment: any;
}

export class ImageCi extends Construct {

  constructor(parent: cdk.Construct, name: string, props: ImageCiProps) {
    super(parent, name);

    const repository = new ecr.Repository(parent, `Repository-${props.ecr.repositoryName}`, {
      repositoryName: props.ecr.repositoryName
    });

    const gitHubSource = codebuild.Source.gitHub({
      owner: props.git.owner,
      repo: props.git.repo,
      webhook: true,
      webhookFilters: [
        codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs(props.git.branch),
      ]
    });

    const role = new iam.Role(this, `CodebuildServiceRole-${props.ecr.repositoryName}`, {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com')
    });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));


    new codebuild.Project(this, `CodebuildProject-${props.ecr.repositoryName}`, {
      source: gitHubSource,
      role: role,
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
          value: props.ecr.repositoryName
        },
        DOCKERFILE: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.ecr.dockerfile
        }
      },
      buildSpec: codebuild.BuildSpec.fromObject(buildspec)
    }
  )}
}
