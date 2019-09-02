import { ConstructNode } from "@aws-cdk/core";

export class Environment {
  static getEnv(node: ConstructNode) {
      return node.tryGetContext('env');
  }

  static isProd(node: ConstructNode) {
      return this.getEnv(node) === 'prod';
  }
}

