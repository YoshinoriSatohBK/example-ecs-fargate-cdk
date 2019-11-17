import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import changeCase = require('change-case');

export interface SecretManagerAttributes {
  secretId: string;
  options?: cdk.SecretsManagerSecretOptions;
};

export class SecretManagerUtil {
  static secretIdBase(scope: cdk.Construct) {
    const appName = scope.node.tryGetContext('appName');
    const env = scope.node.tryGetContext('env');
    return `/${changeCase.pascalCase(appName)}/${changeCase.pascalCase(env)}`;
  }

  static secureValue(scope: cdk.Construct, attr: SecretManagerAttributes) {
    const secretId = `${this.secretIdBase(scope)}${attr.secretId}`;
    return cdk.SecretValue.secretsManager(secretId, attr.options);
  }
}
