import 'source-map-support/register';
import cdk = require('@aws-cdk/core');

export type SecretManagerProps = {
  secretId: string;
  options?: cdk.SecretsManagerSecretOptions;
};
