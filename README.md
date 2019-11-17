# CDKによる ECS Fargate と CICD環境のサンプル

## SSM Parameter 事前登録
### パラメータ定義ファイル作成
`scripts/ssm-parameters-sample.json` を複製し、ファイル名を`scripts/ssm-parameters-dev.json` のように、sample部分を環境名にして、パラメータを記述。

### スクリプトでパラメータ登録
以下コマンドを実行
```
./scripts/ssm-parameter-regist.sh dev
```

### 手動でパラメータ登録
URLを上記の方法で登録しようとすると、エラーとなってしまうため、以下パラメータについては手動で登録する。
* /Example/<Dev|Prod>/App/Laravel/Env/AppUrl

## Secrets Manager 事前登録
以下をAWSコンソールから手動で登録する。
* /Example/<Dev|Prod>/Cd/Git
* /Example/<Dev|Prod>/Cd/Git/SshKey
* /Example/<Dev|Prod>/App/Laravel/Git

## CDKアプリケーション構築
以下コマンドを実行

develop
```
./scripts/example-deploy-dev.sh
```

prod
```
./scripts/example-deploy-prod.sh
```
