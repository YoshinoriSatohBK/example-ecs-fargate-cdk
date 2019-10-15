import 'source-map-support/register';

import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import codebuild = require('@aws-cdk/aws-codebuild');
import changeCase = require('change-case');

type SecretGit = {
  sshkey?: string;
  oAuthToken: cdk.SecretValue;
  owner: string;
  branch: string;
  email?: string;
  name?: string;
}

export class Secrets {
  backend: {
    cd: {
      git: SecretGit;
    }
  }
  application: {
    ci: {
      laravel: {
        git: SecretGit;
      }
    }
  }

  constructor(appName: string, env: string) {
    const secretKeyBase = `/${changeCase.pascalCase(env)}/${changeCase.pascalCase(appName)}`;

    // fetch secrets for cd ops.
    this.backend = {
      cd: {
        git: {
          sshkey: cdk.SecretValue.secretsManager(`${secretKeyBase}/GitSshkey`).toString(),
          oAuthToken: cdk.SecretValue.secretsManager(secretKeyBase, { jsonField: 'GithubToken' }),
          owner: cdk.SecretValue.secretsManager(secretKeyBase, { jsonField: 'CdGitOwner' }).toString(),
          branch: cdk.SecretValue.secretsManager(secretKeyBase, { jsonField: 'CdGitBranch' }).toString(),
          email: cdk.SecretValue.secretsManager(secretKeyBase, { jsonField: 'CdGitEmail' }).toString(),
          name: cdk.SecretValue.secretsManager(secretKeyBase, { jsonField: 'CdGitName' }).toString()
        },
      }
    }

    // fetch secrets for apps.
    const secretKeyLaravel = `${secretKeyBase}/App/Laravel`;
    this.application = {
      ci: {
        laravel: {
          git: {
            oAuthToken: cdk.SecretValue.secretsManager(secretKeyLaravel, { jsonField: 'GithubToken' }),
            owner: cdk.SecretValue.secretsManager(secretKeyLaravel, { jsonField: 'GitOwner' }).toString(),
            branch: cdk.SecretValue.secretsManager(secretKeyLaravel, { jsonField: 'GitBranch' }).toString()
          }
        }
      }
    }
  }
}
