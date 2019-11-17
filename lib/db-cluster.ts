import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import rds = require('@aws-cdk/aws-rds');
import kms = require('@aws-cdk/aws-kms');

export interface DbClusterProps {
  vpc: ec2.Vpc;
  engine: rds.DatabaseClusterEngine;
  engineVersion: string;
  instanceProps: {
    instanceType: ec2.InstanceType;
    parameterGroup: {
      family: string;
      parameters?: {[key:string]:string};
    }
  },
  masterUser?: {
    username: string;
  },
  backup?: {
    retention: cdk.Duration;
    preferredWindow: string;
  },
  instances: number;
  parameterGroup: {
    family: string;
    parameters?: {[key:string]:string};
  },
  port?: number;
  preferredMaintenanceWindow?: string;
}

export class DbCluster extends cdk.Construct {
  readonly cluster: rds.DatabaseCluster;

  constructor(scope: cdk.Construct, name: string, props: DbClusterProps) {
    super(scope, name);

    const appName = this.node.tryGetContext('appName');
    const env = this.node.tryGetContext('env');

    this.cluster = new rds.DatabaseCluster(this, `${appName}-DbCluster-${env}`, {
      engine: props.engine,
      engineVersion: props.engineVersion,
      instanceProps: {
        instanceType: props.instanceProps.instanceType,
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.ISOLATED,
        },
        parameterGroup: new rds.ParameterGroup(this, 'DatabaseInstanceParameterGroup', {
          family: props.instanceProps.parameterGroup.family,
          parameters: props.instanceProps.parameterGroup.parameters || {}
        })
      },
      masterUser: {
        username: (props.masterUser && props.masterUser.username) || 'admin'
      },
      backup: {
        retention: (props.backup && props.backup.retention) || cdk.Duration.days(14),
        preferredWindow: (props.backup && props.backup.preferredWindow) || '16:00-17:00'
      },
      clusterIdentifier: `${appName}-${env}`,
      defaultDatabaseName: `${appName}${env}`,
      instanceIdentifierBase: `${appName}-${env}`,
      instances: props.instances,
      parameterGroup:  new rds.ClusterParameterGroup(this, 'rdsClusterPrameterGroup', {
        family: props.parameterGroup.family,
        parameters: Object.assign({
          max_connections: '100' // Emptyが許容されないための指定
        }, props.parameterGroup.parameters || {})
      }),
      port: props.port || undefined,
      preferredMaintenanceWindow: props.preferredMaintenanceWindow || 'thu:01:00-thu:01:30',
      removalPolicy:cdk.RemovalPolicy.DESTROY, // 暫定
      storageEncrypted: true,
      kmsKey: new kms.Key(this, `${appName}-Database-Encryption-key-${env}`, {
        alias: `${appName}-Database-Encryption-key-${env}`,
        enableKeyRotation: true,
        enabled: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });
    this.cluster.addRotationSingleUser('Rotation');
  }
}
