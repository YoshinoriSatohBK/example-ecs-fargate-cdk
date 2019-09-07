import { ConstructNode } from "@aws-cdk/core";

export class Context {
  public appName: string;
  public env: string;
  public account:  string;
  public region: string;
  public branch: string;

  constructor(node: ConstructNode) {
    this.appName = node.tryGetContext('appName');
    this.env = node.tryGetContext('env');
    this.account = node.tryGetContext('account');
    this.region = node.tryGetContext('region');
    this.branch = node.tryGetContext('branch');
  }

  cid(id: string) {
    return `${this.appName}-${this.env}-${id}`
  }

  isProd() {
    return this.env === 'prod';
  }
}