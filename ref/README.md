# 技術カード

[目次](../README.md) ＞ 技術カード

1 つの技術を 1 ページで説明する「辞書」です。各部の章は「このコードはなぜこう書かれているか」を追いますが、技術カードは **その技術がどう動くか、最小限どう使うか** を、このリポジトリから離れて説明します。

- 章を読んでいて「そもそもこれは何？」と思ったら、カードを引いてください
- カードを読んで「実際にはどう使われているの？」と思ったら、カードの「このリポジトリでは」から章へ戻ってください

## カードの一覧

✅ は執筆済みです（50 枚）。章を書くときに、その章で出てくる技術のカードを一緒に作りました。

### 暗号

| カード | 状態 | 主に出てくる章 |
|---|---|---|
| [ハッシュ（SHA-256）](sha-256.md) | ✅ | 6-1、6-4 |
| [公開鍵暗号と Ed25519](ed25519.md) | ✅ | 6-1、6-2 |
| [base64url と base32](base64url-base32.md) | ✅ | 6-2、6-3 |
| [AWS KMS](aws-kms.md) | ✅ | 6-4、第 8 部 |
| [Tink](tink.md) | ✅ | 6-5 |
| [WebCrypto](webcrypto.md) | ✅ | 第 9 部 |

### Kotlin と Android

| カード | 状態 | 主に出てくる章 |
|---|---|---|
| [Gradle](gradle.md) | ✅ | 第 1 部、第 5 部 |
| [Jetpack Compose](jetpack-compose.md) | ✅ | 第 2 部 |
| [ViewModel と StateFlow](viewmodel-stateflow.md) | ✅ | 第 2 部 |
| [Kotlin Coroutines](kotlin-coroutines.md) | ✅ | 第 3 部 |
| [Android のサービスと通知](android-service-notification.md) | ✅ | 第 3 部 |
| [Fused Location](fused-location.md) | ✅ | 第 3 部 |
| [OkHttp](okhttp.md) | ✅ | 第 4 部 |
| [osmdroid](osmdroid.md) | ✅ | 第 4 部 |
| [Android Keystore](android-keystore.md) | ✅ | 第 4 部 |

### TypeScript と Web

| カード | 状態 | 主に出てくる章 |
|---|---|---|
| [npm workspaces](npm-workspaces.md) | ✅ | 第 7 部 |
| [OpenAPI](openapi.md) | ✅ | 第 7 部 |
| [Vitest](vitest.md) | ✅ | 第 7 部 |
| [React](react.md) | ✅ | 第 9 部 |
| [Vite](vite.md) | ✅ | 第 9 部 |
| [OIDC](oidc.md) | ✅ | 第 9 部 |

### AWS

| カード | 状態 | 主に出てくる章 |
|---|---|---|
| [IAM](iam.md) | ✅ | 第 8 部 |
| [AWS CDK](aws-cdk.md) | ✅ | 第 8 部 |
| [Lambda](lambda.md) | ✅ | 第 8 部 |
| [API Gateway（HTTP API）](api-gateway.md) | ✅ | 第 8 部 |
| [Cognito](cognito.md) | ✅ | 第 8 部 |
| [DynamoDB](dynamodb.md) | ✅ | 第 8 部 |
| [S3](s3.md) | ✅ | 6-4、第 8 部 |
| [CloudFront](cloudfront.md) | ✅ | 6-4、第 8 部 |
| [SQS](sqs.md) | ✅ | 第 8 部 |
| [SES](ses.md) | ✅ | 第 8 部 |
| [Amazon Bedrock](bedrock.md) | ✅ | 8-9 |
| [Parameter Store](parameter-store.md) | ✅ | 8-9 |
| [ECS と Fargate](ecs-fargate.md) | ✅ | 8-10 |
| [VPC](vpc.md) | ✅ | 8-10 |
| [EventBridge](eventbridge.md) | ✅ | 8-3、8-10、8-11 |
| [CloudWatch と SNS](cloudwatch-sns.md) | ✅ | 8-3、8-9、8-11 |

### AWS をサービスの種類から引く

上の AWS のカードを、役割ごとに並べ直したものです。どのスタックでどう使っているかは [8-1 のサービスの一覧](../08-aws/01-aws-basics.md#サービスの一覧) にあります。

| 種類 | カード | カードのないもの（章で読む） |
|---|---|---|
| 定義と権限 | [AWS CDK](aws-cdk.md)・[IAM](iam.md) | CloudFormation（[8-2](../08-aws/02-cdk.md)） |
| 計算 | [Lambda](lambda.md)・[ECS と Fargate](ecs-fargate.md) | |
| 網 | [VPC](vpc.md) | |
| 入口とログイン | [API Gateway](api-gateway.md)・[Cognito](cognito.md) | WAF（[8-4](../08-aws/04-cognito.md)・[8-9](../08-aws/09-ai-relay.md)） |
| 保存 | [DynamoDB](dynamodb.md)・[S3](s3.md) | |
| 配信 | [CloudFront](cloudfront.md) | |
| つなぐ・動かす | [SQS](sqs.md)・[SES](ses.md)・[EventBridge](eventbridge.md) | |
| 鍵・設定・秘密 | [AWS KMS](aws-kms.md)・[Parameter Store](parameter-store.md) | Secrets Manager（[8-3](../08-aws/03-lambda-apigw.md)・[8-9](../08-aws/09-ai-relay.md)） |
| 生成 AI | [Amazon Bedrock](bedrock.md) | |
| 見張りと費用 | [CloudWatch と SNS](cloudwatch-sns.md) | AWS Budgets・タグ（[8-1](../08-aws/01-aws-basics.md)・[8-11](../08-aws/11-watch-and-cost.md)） |

### Google Play

| カード | 状態 | 主に出てくる章 |
|---|---|---|
| [Android App Bundle](android-app-bundle.md) | ✅ | 10-1 |
| [Google Play Developer API](play-developer-api.md) | ✅ | 10-4 |
| [サービス アカウントと OAuth 2.0](service-account-oauth.md) | ✅ | 10-4、10-5 |
| [Play Integrity API](play-integrity.md) | ✅ | 8-9、10-5 |

### 開発の道具

| カード | 状態 | 主に出てくる章 |
|---|---|---|
| [Docker](docker.md) | ✅ | 第 7 部 |

### GitHub

| カード | 状態 | 主に出てくる章 |
|---|---|---|
| [Git](git.md) | ✅ | 11-1、11-2 |
| [プルリクエスト](pull-request.md) | ✅ | 11-2 |
| [gh CLI](gh-cli.md) | ✅ | 9-4、第 11 部 |
| [GitHub Actions](github-actions.md) | ✅ | 5-3、9-4、11-3 |
| [GITHUB_TOKEN と個人用のトークン](github-token.md) | ✅ | 11-4 |
| [GitHub Packages](github-packages.md) | ✅ | 5-3、11-5 |
| [GitHub Pages](github-pages.md) | ✅ | 10-3、11-6 |

### 位置

| カード | 状態 | 主に出てくる章 |
|---|---|---|
| [ジオハッシュ](geohash.md) | ✅ | 5-4 |

## カードの形

どのカードも次の順に書きます。分量は 1 ページで画面 2〜3 枚までにします。

| 節 | 中身 |
|---|---|
| 一言で | 何をするものか、1〜2 文で |
| 仕組み | 図を 1 枚と、要点を 3〜5 個 |
| 最小の使い方 | このリポジトリに依存しない、短いコードとコマンド。お金や AWS のアカウントが要るなら、冒頭にそう書く |
| このリポジトリでは | どこで、なぜ使っているか。対応する章へのリンク |
| よくある間違い | 初めての人が踏みやすい落とし穴 |
| 版と公式ドキュメント | 使っている版（ビルドの設定から転記）と、公式ドキュメントへのリンク |

「最小の使い方」より先のくわしい使い方は、公式ドキュメントに任せます。公式ドキュメントの焼き直しにはしません。
