import { Construct } from '@aws-cdk/core';
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipelineActions = require('@aws-cdk/aws-codepipeline-actions');

export interface FargateCiProps {

}

export class FargateCi extends Construct {
  constructor(parent: Construct, name: string, props: FargateCiProps) {
    super(parent, name);
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipelineActions.GitHubSourceAction({
      actionName: 'GitHub_Source',
      owner: 'awslabs',
      repo: 'aws-cdk',
      oauthToken: cdk.SecretValue.secretsManager('my-github-token'),
      output: sourceOutput,
      branch: 'develop', // default: 'master'
      trigger: codepipeline_actions.GitHubTrigger.POLL // default: 'WEBHOOK', 'NONE' is also possible for no Source trigger
    });
    const pipeline = new codepipeline.Pipeline(this, 'MyFirstPipeline', {
      pipelineName: 'MyPipeline',
      stages: [
        {
          stageName: 'Source',
          actions: [
            sourceAction
          ],
        },
      ],
    });
  }
}