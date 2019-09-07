import cdk = require('@aws-cdk/core');
import { Construct, SecretValue } from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import rds = require('@aws-cdk/aws-rds');

export interface RdsProps {
  vpc: ec2.IVpc;
  appName: string;
  conf: {
    databaseName: string,
    masterUsername: string
  }
}

export class Mysql extends Construct {
  readonly databaseInstance: rds.IDatabaseInstance;

  constructor(parent: Construct, name: string, props: RdsProps) {
    super(parent, name);
    const ctx = parent.node.tryGetContext('ctx');

    const optionGroup = new rds.OptionGroup(parent, ctx.cid('MysqlOptionGroup'), {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      majorEngineVersion: '5.7',
      configurations: []
    });

    const parameterGroup = new rds.ParameterGroup(parent, ctx.cid('MysqlParameterGroup'), {
      family: 'mysql5.7',
      parameters: {}
    });

    if (ctx.isProd()) {
      this.databaseInstance = new rds.DatabaseInstance(parent, ctx.cid('MysqlInstance'), {
        instanceIdentifier: props.appName,
        engine: rds.DatabaseInstanceEngine.MYSQL,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.R5, ec2.InstanceSize.LARGE),
        engineVersion: '5.7.22',
        databaseName: props.conf.databaseName,
        masterUsername: props.conf.masterUsername,
        vpc: props.vpc,
        multiAz: true,
        allocatedStorage: 100,
        allowMajorVersionUpgrade: true,
        autoMinorVersionUpgrade: true,
        deletionProtection: true,
        enablePerformanceInsights: true,
        optionGroup: optionGroup,
        parameterGroup: parameterGroup,
        storageType: rds.StorageType.GP2, // General purpose (SSD)
        vpcPlacement: {
          onePerAz: true,
          subnetType: ec2.SubnetType.ISOLATED
        }
      });

    } else {
      this.databaseInstance = new rds.DatabaseInstance(parent, ctx.cid('MysqlInstance'), {
        instanceIdentifier: props.appName,
        engine: rds.DatabaseInstanceEngine.MYSQL,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
        engineVersion: '5.7.22',
        databaseName: props.conf.databaseName,
        masterUsername: props.conf.masterUsername,
        vpc: props.vpc,
        multiAz: false,
        allocatedStorage: 20,
        allowMajorVersionUpgrade: true,
        autoMinorVersionUpgrade: true,
        deletionProtection: true,
        enablePerformanceInsights: false,
        optionGroup: optionGroup,
        parameterGroup: parameterGroup,
        storageType: rds.StorageType.GP2, // General purpose (SSD)
        vpcPlacement: {
            onePerAz: false,
            subnetType: ec2.SubnetType.ISOLATED
        }
      });
    }
  }
}