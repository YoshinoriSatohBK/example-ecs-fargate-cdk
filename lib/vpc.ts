import cdk = require('@aws-cdk/core');
import { Construct } from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');

export interface VpcProps {
  cidr: string;
}

export class Vpc extends Construct {
  readonly vpc: ec2.IVpc;

  constructor(parent: Construct, name: string, props: VpcProps) {
    super(parent, name);

    this.vpc = new ec2.Vpc(parent, 'VPC', {
      cidr: props.cidr,
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Ingress',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Application',
          subnetType: ec2.SubnetType.PRIVATE,
        },
        {
          cidrMask: 28,
          name: 'Database',
          subnetType: ec2.SubnetType.ISOLATED,
        }
      ],
    });
  }
}