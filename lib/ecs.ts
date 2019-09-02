import cdk = require('@aws-cdk/core');
import { Construct } from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import ecr = require('@aws-cdk/aws-ecr');

export interface EcsProps {
  vpc: ec2.IVpc;
}

export class Ecs extends Construct {

  constructor(parent: Construct, name: string, props: EcsProps) {
    super(parent, name);

    // Cluster
    const cluster = new ecs.Cluster(parent, 'Cluster', {
      vpc: props.vpc
    });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 512,
      cpu: 256
    });

    // Add container images to Tast Definition
    const ecrRepositoryLaravelApp = ecr.Repository.fromRepositoryName(parent, 'LravelAppEcrRepository', 'laravel-app');
    const containerDefinitionLaravelApp = taskDefinition.addContainer("ContainerDefinitionLaravelApp", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepositoryLaravelApp, 'latest'),
      workingDirectory: '/var/www/html'
    });
    containerDefinitionLaravelApp.addPortMappings({
      containerPort: 9000,
      hostPort: 9000,
      protocol: ecs.Protocol.TCP
    })

    // new ecs.ContainerDefinition(parent, 'ContainerDefinitionLaravelApp', {
    //   image: ecs.ContainerImage.fromEcrRepository(ecrRepositoryLaravelApp, 'latest'),
    //   taskDefinition: taskDefinition
    // });

    const ecrRepositoryLaravelNginx = ecr.Repository.fromRepositoryName(parent, 'LaravelNginxEcrRepository', 'laravel-nginx');
    const containerDefinitionLaravelNginx = taskDefinition.addContainer("ContainerDefinitionLaravelNginx", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepositoryLaravelNginx, 'latest')
    });
    containerDefinitionLaravelNginx.addPortMappings({
      containerPort: 80,
      hostPort: 80,
      protocol: ecs.Protocol.TCP
    })

    // new ecs.ContainerDefinition(parent, 'ContainerDefinitionLaravelNginx', {
    //   image: ecs.ContainerImage.fromEcrRepository(ecrRepositoryLaravelNginx, 'latest'),
    //   taskDefinition: taskDefinition
    // });

    // Service
    const serviceSecurityGroup = new ec2.SecurityGroup(parent, 'ServiceSecurityGroup', {
      vpc: props.vpc,
      securityGroupName: 'laravel-application-security-group',
      description: 'Laravel Application Security Group',
      allowAllOutbound: true
    });
    serviceSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), new ec2.Port({
      protocol: ec2.Protocol.TCP,
      stringRepresentation: 'web server access',
      fromPort: 80,
      toPort: 80
    }));
    const service = new ecs.FargateService(parent, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      assignPublicIp: true,
      enableECSManagedTags: true,
      securityGroup: serviceSecurityGroup
    });
  }
}