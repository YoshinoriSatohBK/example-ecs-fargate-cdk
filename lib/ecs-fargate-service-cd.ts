import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');
import { GitRepository } from './backend-stack'

export type EcsFargateServiceCdProps = {
  git: GitRepository;
  service: ecs.FargateService;
}

export class EcsFargateServiceCd extends cdk.Construct {
  constructor(scope: cdk.Construct, name: string, props: EcsFargateServiceCdProps) {
    super(scope, name);

    const sourceOutput = new codepipeline.Artifact();
    const prepareDeployOutput = new codepipeline.Artifact();
    const pipeline = new codepipeline.Pipeline(this, `${props.service.serviceName}-EcsFargateServiceCdPipiline`, {
      pipelineName: `${props.service.serviceName}-pipeline`,
      role: new iam.Role(this, `${props.service.serviceName}-EcsFargateServiceCdCodePipelineRole`, {
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
              actionName: 'GitHub_Source',
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
