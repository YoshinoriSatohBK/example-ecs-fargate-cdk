import cdk = require('@aws-cdk/core');
import { Construct } from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import rds = require('@aws-cdk/aws-rds');

export interface RdsProps {
  vpc: ec2.IVpc;
}

export class Rds extends Construct {
  constructor(parent: Construct, name: string, props: RdsProps) {
    super(parent, name);

    const optionGroup = new rds.OptionGroup(parent, 'OptionGroup', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      majorEngineVersion: '5.7',
      configurations: []
    });

    const parameterGroup = new rds.ParameterGroup(parent, 'ParameterGroup', {
      family: 'mysql5.7',
      parameters: {}
    });

    const instance = new rds.DatabaseInstance(parent, 'Instance', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      instanceClass: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      engineVersion: '5.7.22',
      databaseName: 'appDatabase',
      masterUsername: 'syscdk',
      vpc: props.vpc,
      multiAz: true,
      allocatedStorage: 8,
      allowMajorVersionUpgrade: true,
      autoMinorVersionUpgrade: true,
      deletionProtection: true,
      enablePerformanceInsights: false,
      optionGroup: optionGroup,
      parameterGroup: parameterGroup,
      storageType: rds.StorageType.GP2, // General purpose (SSD)
      // timezone: 'Asia/Tokyo',
      vpcPlacement: {
        onePerAz: true,
        subnetType: ec2.SubnetType.PRIVATE
      }
    });
  }
}