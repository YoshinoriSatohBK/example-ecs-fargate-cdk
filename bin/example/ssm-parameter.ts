import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import { StringParameterAttributes, SecureStringParameterAttributes } from '@aws-cdk/aws-ssm';
import changeCase = require('change-case');

export class SsmParameter {
  readonly cd: {
    git: {
      owner: StringParameterAttributes;
      repo: StringParameterAttributes;
      branch: StringParameterAttributes;
      config: {
        name: StringParameterAttributes;
        email: StringParameterAttributes;
      }
    };
  }
  readonly app: {
    laravel: {
      git: {
        owner: StringParameterAttributes;
        repo: StringParameterAttributes;
        branch: StringParameterAttributes;
      };
      environment: {
        appDebug: StringParameterAttributes;
        appName: StringParameterAttributes;
        appUrl: StringParameterAttributes;
      },
      secrets: {
        appKey: SecureStringParameterAttributes;
      }
    }
  }

  constructor(appName: string, env: string) {
    const parameterKeyBase = `/${changeCase.pascalCase(appName)}/${changeCase.pascalCase(env)}`;

    const parameterKeyCd = `${parameterKeyBase}/Cd`;
    this.cd = {
      git: {
        owner: {
          parameterName: `${parameterKeyCd}/Git/Owner`,
          version: 1
        },
        repo: {
          parameterName: `${parameterKeyCd}/Git/Repo`,
          version: 1
        },
        branch: {
          parameterName: `${parameterKeyCd}/Git/Branch`,
          version: 1
        },
        config: {
          name: {
            parameterName: `${parameterKeyCd}/Git/Config/Name`,
            version: 1
          },
          email: {
            parameterName: `${parameterKeyCd}/Git/Config/Email`,
            version: 1
          }
        }
      }
    }

    const parameterKeyAppLaravel = `${parameterKeyBase}/App/Laravel`;
    this.app = {
      laravel: {
        git: {
          owner: {
            parameterName: `${parameterKeyAppLaravel}/Git/Owner`,
            version: 1
          },
          repo: {
            parameterName: `${parameterKeyAppLaravel}/Git/Repo`,
            version: 1
          },
          branch: {
            parameterName: `${parameterKeyAppLaravel}/Git/Branch`,
            version: 1
          }
        },
        environment: {
          appDebug: {
            parameterName: `${parameterKeyAppLaravel}/Env/AppDebug`,
            version: 1
          },
          appName: {
            parameterName: `${parameterKeyAppLaravel}/Env/AppName`,
            version: 1
          },
          appUrl: {
            parameterName: `${parameterKeyAppLaravel}/Env/AppUrl`,
            version: 1
          }
        },
        secrets: {
          appKey: {
            parameterName: `${parameterKeyAppLaravel}/Sec/AppKey`,
            version: 1
          }
        }
      }
    }
  }
}
