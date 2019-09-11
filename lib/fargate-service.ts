import cdk = require('@aws-cdk/core');
import { Construct, Duration } from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import route53 = require('@aws-cdk/aws-route53');
import targets = require('@aws-cdk/aws-route53-targets/lib');

export interface FargateServiceProps {
  vpc: ec2.IVpc;
  ecsCluster: ecs.Cluster;
  taskDefinition: ecs.FargateTaskDefinition;
  conf: {
    acm: {
      certificateArns: Array<string>;
    },
    route53: {
      hostedZoneId: string;
      domain: string;
    }
  }
}

export class FargateService extends Construct {

  constructor(parent: Construct, name: string, props: FargateServiceProps) {
    super(parent, name);
    const ctx = parent.node.tryGetContext('ctx');

    // Service
    const service = new ecs.FargateService(parent, ctx.cid('FargateService'), {
      cluster: props.ecsCluster,
      taskDefinition: props.taskDefinition,
      desiredCount: 0,
      assignPublicIp: true,
      enableECSManagedTags: true,
      securityGroup: new ec2.SecurityGroup(parent, ctx.cid('FargateServiceSecurityGroup'), {
        vpc: props.vpc,
        securityGroupName: 'service-security-group',
        description: 'Service Security Group',
        allowAllOutbound: true
      }),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE
      }
    });

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, ctx.cid('Alb'), {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: new ec2.SecurityGroup(parent, ctx.cid('AlbSecurityGroup'), {
      vpc: props.vpc,
        securityGroupName: 'alb-security-group',
        description: 'ALB Security Group',
        allowAllOutbound: true
      })
    });
    const albTargetGroupBlue = new elbv2.ApplicationTargetGroup(parent, ctx.cid('ApplicationTargetGroupBlue'), {
      vpc: props.vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targetGroupName: 'target-group-blue',
      targetType: elbv2.TargetType.IP,
      targets: [service]
    });
    const listener = alb.addListener('Listener', {
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: 443,
      open: true,
      defaultTargetGroups: [albTargetGroupBlue]
    });

    // Set certificate to alb
    listener.addCertificateArns('ALBCertificate', props.conf.acm.certificateArns);

    // Set sequrity group from alb to fargate service
    service.connections.allowFrom(alb, new ec2.Port({
      protocol: ec2.Protocol.TCP,
      stringRepresentation: 'task container access',
      fromPort: 80,
      toPort: 80
    }))

    // Route53
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, ctx.cid('HostedZone'), {
      hostedZoneId: props.conf.route53.hostedZoneId,
      zoneName: props.conf.route53.domain,
    });
    new route53.ARecord(this, ctx.cid('SiteAliasRecord'), {
      zone,
      recordName: 'app',
      target: route53.AddressRecordTarget.fromAlias(new targets.LoadBalancerTarget(alb))
    });
  }
}
