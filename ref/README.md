# 技術カード

[目次](../README.md) ＞ 技術カード

1 つの技術を 1 ページで説明する「辞書」です。各部の章は「このコードはなぜこう書かれているか」を追いますが、技術カードは **その技術がどう動くか、最小限どう使うか** を、このリポジトリから離れて説明します。

- 章を読んでいて「そもそもこれは何？」と思ったら、カードを引いてください
- カードを読んで「実際にはどう使われているの？」と思ったら、カードの「このリポジトリでは」から章へ戻ってください

## カードの一覧

✅ は執筆済みです（46 枚）。章を書くときに、その章で出てくる技術のカードを一緒に作りました。

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
