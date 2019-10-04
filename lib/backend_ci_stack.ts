import cdk = require('@aws-cdk/core');
import { ImageCi } from './image-ci';
import codebuild = require('@aws-cdk/aws-codebuild');

interface ecrRepository　{
  repositoryName: string;
  dockerfile: string;
}

interface BackendCiProps extends cdk.StackProps {
  ecr: {
    nginx: ecrRepository,
    laravel: ecrRepository
  },
  git: {
    owner: string,
    repo: string,
    branch: string
  }
}

export class BackendCiStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: BackendCiProps) {
    super(parent, name, props);

    const imageCiLaravel = new ImageCi(this, 'ImageCiLaravel', {
      git: props.git,
      ecr: props.ecr.laravel,
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    });

    const imageCiNginx = new ImageCi(this, 'ImageCiNginx', {
      git: props.git,
      ecr: props.ecr.nginx,
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true
      }
    });
  }
}
