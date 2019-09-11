import codebuild = require('@aws-cdk/aws-codebuild');
import iam = require('@aws-cdk/aws-iam')
import { Construct } from '@aws-cdk/core';

export interface CiProps {
  gitOwner: string;
  gitRepo: string;
  s3Repository: string;
  cfDistributionId: string;
  branch: string;
  env: string,
  buildSpec: object;
  environmentVariables: { [name: string]: codebuild.BuildEnvironmentVariable; };
}

export class Ci extends Construct {
  constructor(parent: Construct, name: string, props: CiProps) {
    super(parent, name);

    const source = codebuild.Source.bitBucket({
      owner: props.gitOwner,
      repo: props.gitRepo,
      webhook: true,
      webhookFilters: [
        codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH)
                             .andHeadRefIs(`^refs/heads/${props.branch}$`)
      ]
    });

    const role = new iam.Role(this, '${props.gitRepo}-Role', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com')
    });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    new codebuild.Project(this, `CiCodebuildProject`, {
      projectName: `${props.gitRepo}-${props.env}`,
      source: source,
      role: role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_14_1,
        computeType: codebuild.ComputeType.SMALL,
        environmentVariables: {
          S3_REPOSITORY: {
            value: props.s3Repository
          },
          CF_DISTRIBUTION_ID: {
            value: props.cfDistributionId
          }
        }
      },
      environmentVariables: props.environmentVariables,
      buildSpec: codebuild.BuildSpec.fromObject(props.buildSpec)
    }
  )}
}
