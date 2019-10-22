import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import {
  StringParameter,
  ParameterType,
  StringParameterAttributes,
  SecureStringParameterAttributes } from '@aws-cdk/aws-ssm';
import changeCase = require('change-case');

export class SsmParameterUtil {
  static parameterKeyBase(scope: cdk.Construct) {
    const appName = scope.node.tryGetContext('appName');
    const env = scope.node.tryGetContext('env');
    return `/${changeCase.pascalCase(appName)}/${changeCase.pascalCase(env)}`;
  }

  static value(scope: cdk.Construct, attr: StringParameterAttributes): string {
    const parameterName = `${this.parameterKeyBase(scope)}${attr.parameterName}`;
    return StringParameter.valueForStringParameter(scope, parameterName, attr.version);
  }

  static ecsSecret(scope: cdk.Construct, attr: SecureStringParameterAttributes): ecs.Secret {
    const parameterName = `${this.parameterKeyBase(scope)}${attr.parameterName}`;
    const stringParameter = StringParameter.fromSecureStringParameterAttributes(
      scope,
      parameterName,
      Object.assign({}, attr, {
        parameterName
      }))
    return ecs.Secret.fromSsmParameter(stringParameter);
  }
}
