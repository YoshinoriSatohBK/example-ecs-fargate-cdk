import cdk = require('@aws-cdk/core');
import { Construct } from '@aws-cdk/core';
import ecr = require('@aws-cdk/aws-ecr');
import codedeploy = require('@aws-cdk/aws-codedeploy');
import iam = require('@aws-cdk/aws-iam');

export interface FargateCdProps {

}

export class FargateCd extends Construct {

  constructor(parent: cdk.Construct, name: string, props: FargateCdProps) {
    super(parent, name);
    const ctx = parent.node.tryGetContext('ctx');


  }
}
