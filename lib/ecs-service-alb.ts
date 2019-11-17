import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');

export interface EcsServiceAlbProps {
  vpc: ec2.Vpc;
  serviceName: string;
}

export class EcsServiceAlb extends cdk.Construct {
  readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: cdk.Construct, name: string, props: EcsServiceAlbProps) {
    super(scope, name);

    this.alb = new elbv2.ApplicationLoadBalancer(this, `${props.serviceName}-Alb`, {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: new ec2.SecurityGroup(this, `${props.serviceName}-AlbSecurityGroup`, {
        vpc: props.vpc,
        securityGroupName: `${props.serviceName}-alb-security-group`,
        description: `${props.serviceName} ALB Security Group`,
        allowAllOutbound: true
      })
    });
    // Redirect to HTTPS
    this.alb.addListener('http-listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: []
    }).addRedirectResponse('ssl-redirect', {
      statusCode: 'HTTP_302',
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: '443'
    })
  }
}
