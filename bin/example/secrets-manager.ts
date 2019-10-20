import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import changeCase = require('change-case');
import { SecretManagerProps } from '../../lib/secrets-manager';

export class SecretManager {
  readonly cd: {
    git: {
      oAuthToken: SecretManagerProps;
      sshKey: SecretManagerProps;
    };
  }
  readonly app: {
    laravel: {
      git: {
        oAuthToken: SecretManagerProps;
      };
    }
  }

  constructor(appName: string, env: string) {
    const parameterKeyBase = `/${changeCase.pascalCase(appName)}/${changeCase.pascalCase(env)}`;

    const parameterKeyCd = `${parameterKeyBase}/Cd`;
    this.cd = {
      git: {
        oAuthToken: {
          secretId: `${parameterKeyCd}/Git`,
          options: {
            jsonField: 'OAuthToken',
          }
        },
        sshKey: {
          secretId: `${parameterKeyCd}/GitSshKey`,
        }
      }
    }

    const parameterKeyAppLaravel = `${parameterKeyBase}/App/Laravel`;
    this.app = {
      laravel: {
        git: {
          oAuthToken: {
            secretId: `${parameterKeyAppLaravel}/Git`,
            options: {
              jsonField: 'OAuthToken'
            }
          }
        }
      }
    }
  }
}
