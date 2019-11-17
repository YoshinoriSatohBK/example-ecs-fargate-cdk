import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import s3 = require('@aws-cdk/aws-s3');
import kms = require('@aws-cdk/aws-kms');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');
import { GitHubSourceAction } from '@aws-cdk/aws-codepipeline-actions';

export interface EcsServiceCdProps {
  git: {
    owner: string;
    repo: string;
    branch: string;
    oauthToken: cdk.SecretValue;
  };
  service: ecs.FargateService;
  serviceName: string;
}

export class EcsServiceCd extends cdk.Construct {
  constructor(scope: cdk.Construct, name: string, props: EcsServiceCdProps) {
    super(scope, name);

    const appName = scope.node.tryGetContext('appName');
    const env = scope.node.tryGetContext('env');

    const sourceArtifact = new codepipeline.Artifact('source');
    const pipeline = new codepipeline.Pipeline(this, `${props.serviceName}-deploy-CodePipiline`, {
      artifactBucket: new s3.Bucket(this, `${props.serviceName}-deploy-ArtifactBucket`, {
        bucketName: `${appName}-${props.serviceName}-${env}-deploy-artifact`,
        encryptionKey: new kms.Key(this, `${props.serviceName}-deploy-EncryptionKey`, {
          alias: `${appName}-${props.serviceName}-deploy-${env}`,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        })
      }),
      pipelineName: `${appName}-${props.serviceName}-${env}-deploy-pipeline`,
      role: new iam.Role(this, `${appName}-${props.serviceName}-${env}-CodePipelineRole`, {
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
              output: sourceArtifact,
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
              imageFile: new codepipeline.ArtifactPath(sourceArtifact, `ecs/${props.serviceName}/imagedefinitions.json`)
            }),
          ],
        },
      ],
    });
  }
}
