import cloudfront = require('@aws-cdk/aws-cloudfront');
import route53 = require('@aws-cdk/aws-route53');
import targets = require('@aws-cdk/aws-route53-targets/lib');
import s3 = require('@aws-cdk/aws-s3');
import ssm = require('@aws-cdk/aws-ssm');
import cdk = require('@aws-cdk/core');
import { Construct } from '@aws-cdk/core';

export interface ContentsDeliveryProps {
  domainName: string;
  siteSubDomain: string;
  hostedZoneId: string;
  acmParameterName: string;
}

export class ContentsDelivery extends Construct {
  readonly bucketName: string;
  readonly distributionId: string;

  constructor(parent: Construct, name: string, props: ContentsDeliveryProps) {
    super(parent, name);

    const siteDomain = props.siteSubDomain + '.' + props.domainName;

    // Content bucket
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: siteDomain,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true
    });
    new cdk.CfnOutput(this, 'Bucket', { value: siteBucket.bucketName });
    this.bucketName = siteBucket.bucketName;

    const certificateArn = ssm.StringParameter.fromStringParameterAttributes(this, 'CertificateArnSrcureString', {
      parameterName: props.acmParameterName
    }).stringValue;

    // Origin Access Identity (for S3 Bucket Access Restriction)
    const cfnCloudFrontOriginAccessIdentity = new cloudfront.CfnCloudFrontOriginAccessIdentity(this, 'OriginAccessIdentity', {
      cloudFrontOriginAccessIdentityConfig: {
        comment: `${siteDomain}.s3.ap-northeast-1.amazonaws.com`
      }
    })

    // CloudFront distribution that provides HTTPS
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'SiteDistribution', {
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      aliasConfiguration: {
        acmCertRef: certificateArn,
        names: [ siteDomain ],
        sslMethod: cloudfront.SSLMethod.SNI,
        securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_1_2016,
      },
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: siteBucket,
            originAccessIdentityId: cfnCloudFrontOriginAccessIdentity.ref
          },
          behaviors : [
            { isDefaultBehavior: true }
          ],
        }
      ],
      // for forntend routing (such as vue-router)
      errorConfigurations: [
        {
          errorCode: 403,
          responseCode: 200,
          responsePagePath: '/index.html'
        },
        {
          errorCode: 404,
          responseCode: 200,
          responsePagePath: '/index.html'
        }
      ]
    });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    this.distributionId = distribution.distributionId;

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.domainName,
    });
    new route53.ARecord(this, 'SiteAliasRecord', {
      recordName: siteDomain,
      target: route53.AddressRecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone
    });
  }
}
