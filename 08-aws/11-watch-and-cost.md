# 8-11 見張りと費用

[目次](../README.md) ＞ 第 8 部 ＞ 8-11

> ログ・警報・知らせの仕組みは [技術カード: CloudWatch と SNS](../ref/cloudwatch-sns.md)、出来事で動かす仕組みは [技術カード: EventBridge](../ref/eventbridge.md) にあります。

## この章で学ぶこと

- 3 つのスタックが、止まったこと・おかしくなったことを、どう運営に知らせるか
- 警報のもとになる数字の 3 つの出どころ（AWS が出す数字・自分で出す数字・出来事）
- 「失敗が来た」だけでなく「成功が来ない」を見張る
- ログをどれだけ残すか、何を書かないか
- 3 つのスタックの費用を、タグで分けて見る。予算が数えるもの、数えないもの

この章は新しい部品を作りません。[8-3](03-lambda-apigw.md)・[8-9](09-ai-relay.md)・[8-10](10-spot-tiles.md) で 1 つずつ見てきた見張りを、3 つのスタックを横に並べて読み直します。

## 運営が知るべきこと

管理システムも中継もタイルも、運営がふだん画面を見張っているわけではありません。止まっても、だれも気づかなければ、しばらくしてアプリの側で困りごとになります。

| スタック | 止まると何が起きるか | いつ困るか |
|---|---|---|
| 管理システム | 承認済みチャンネル・リストが作り直されない | 最後の公開から 14 日でリストの期限が切れ、第三者のチャンネルが使えなくなる（[6-1](../06-trust/01-why-signatures.md)） |
| AI の中継 | 運営の AI が答えない | すぐ。散策中の解説が定型文になる |
| スポットのタイル | タイルが作り直されない | 前の週のタイルが配られ続けるので、すぐには困らない。OSM の変更が届かなくなる |

だから 3 つとも、おかしくなったら **SNS のトピックから運営にメール** が届くようにしています。

| スタック | 見張るもの | 拾い方 | 決定 |
|---|---|---|---|
| 管理システム | 公開の失敗（`PublishFailures`）・2 日公開がない（`NoRecentPublication`）・知らせが送れない（`NoticesNotSent`） | CloudWatch の警報 | ADR-001 A-16・A-19 |
| AI の中継 | 予算の 80%（`BudgetNear`）・予算を使い切って止まった（`Paused`）・設定がおかしい（`BadSetting`）・Bedrock の失敗（`UpstreamErrors`） | CloudWatch の警報 | ADR-AI-RELAY R-10・R-14 |
| スポットのタイル | バッチがエラーで止まった・タイルが減って差し替えなかった（`BatchFailed`） | EventBridge のルール | ADR-SPOT-TILES S-6 |

## 警報のもとになる数字: 3 つの出どころ

### 1. AWS が出す数字

Lambda・SQS などは、何もしなくても **メトリクス**（時刻ごとの数字）を CloudWatch に出します。Lambda なら呼ばれた回数（`Invocations`）と失敗した回数（`Errors`）、SQS なら待ち行列にたまった数（`ApproximateNumberOfMessagesVisible`）です。管理システムの警報は、どれもこの数字に付けています。

```ts
// 管理システム: デッドレターキューに 1 つでもたまったら（infra/lib/console-app.ts）
new cloudwatch.Alarm(this, 'NoticesNotSent', {
  metric: deadNotices.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5), statistic: 'Maximum' }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  alarmDescription: 'A publisher notice could not be sent after retries (dead-letter queue)',
}).addAlarmAction(new cwActions.SnsAction(props.alarms));
```

CDK の `metricErrors()`・`metricApproximateNumberOfMessagesVisible()` などは、その部品の数字を指す書き方です。

### 2. 自分で出す数字

「予算の何割を使ったか」「設定がおかしいか」は、AWS は知りません。中継の Lambda が自分で数えて出します。[api/src/relay/aws.ts](https://github.com/duwenji/yorisoi-console/blob/main/api/src/relay/aws.ts) の `emitMetric`:

```ts
/** A CloudWatch metric in the embedded metric format, one line in the log. */
export function emitMetric(name: string, value: number) {
  console.log(
    JSON.stringify({
      _aws: { Timestamp: Date.now(), CloudWatchMetrics: [{ Namespace: 'YorisoiAiRelay', Dimensions: [['Env']], Metrics: [{ Name: name, Unit: 'None' }] }] },
      Env: process.env.RELAY_ENV ?? 'dev',
      [name]: value,
    }),
  );
}
```

これは **埋め込みメトリクス形式**（EMF）と呼ばれる書き方です。決まった形の JSON をログに 1 行書くだけで、CloudWatch がそれを読んでメトリクスにします。数字を送る API を呼ぶ必要も、そのための権限も要りません。中継の 4 つの警報は、この `YorisoiAiRelay` の数字に付けています（[infra/lib/relay-stack.ts](https://github.com/duwenji/yorisoi-console/blob/main/infra/lib/relay-stack.ts)）。

```ts
alarm('BudgetNear', 'SpendRatio', 'Maximum', 0.8, 'The month’s spend on the operator’s AI passed 80% of the budget (ADR-AI-RELAY R-10)');
alarm('Paused', 'RelayPaused', 'Sum', 1, 'The operator’s AI is paused: the month’s budget is used up (ADR-AI-RELAY R-10)');
```

### 3. 出来事

Fargate のタスクは長く動いて 1 回で終わるので、5 分ごとの数字より「止まった」という **出来事** で拾うほうが素直です。[8-10](10-spot-tiles.md) で見た EventBridge のルールが、`ECS Task State Change` の出来事のうち、終了コードが `0` 以外のものだけを SNS に渡します。

| 出どころ | 向いているもの | このリポジトリでは |
|---|---|---|
| AWS が出す数字 | 回数・時間・たまった数 | 管理システムの 3 つの警報 |
| 自分で出す数字（EMF） | 仕事の中身でしかわからないこと | 中継の 4 つの警報 |
| 出来事（EventBridge） | 1 回ごとに終わる仕事の結果 | タイルのバッチの失敗 |

## 成功が来ないことを見張る

警報には「数字が届かないとき、どうみなすか」（`treatMissingData`）を決める設定があります。

| 値 | 意味 | 使っている警報 |
|---|---|---|
| `NOT_BREACHING` | 届かなければ「正常」 | 失敗・たまった数・中継の 4 つ。何も起きなければ数字が来ないのが普通なので |
| `BREACHING` | 届かなければ「異常」 | 管理システムの `NoRecentPublication` |

[8-3](03-lambda-apigw.md) で見たとおり、`NoRecentPublication` は「成功した回数（呼ばれた回数 − 失敗した回数）が 2 日続けて 0」で鳴ります。失敗の警報だけでは、スケジュールが消えて **公開の Lambda がそもそも呼ばれなくなった** ことに気づけません。失敗は 0 のままだからです。リストの期限という「困る日」があるものは、**成功が来ないこと** を見張ります。

タイルのバッチには、この「来ないこと」の見張りはありません。止まっても前の週のタイルが配られ続け、困る日が決まっていないからです。

## 知らせの宛先: SNS

3 つのスタックとも、警報やルールの行き先は **SNS のトピック** です。トピックに **購読**（subscription）を付けると、そこへ届いたものがメールなどで配られます。

```ts
const alarms = new sns.Topic(this, 'Alarms', { displayName: `Yorisoi spot tiles (${config.name})` });
if (config.alarmEmail) alarms.addSubscription(new subscriptions.EmailSubscription(config.alarmEmail));
```

| スタック | 宛先の決め方 |
|---|---|
| 管理システム | 配備のときに `-c alarmEmail=…` で渡す |
| AI の中継・スポットのタイル | 開発用は設定（`relay-config.ts`・`tiles-config.ts`）に書いてある。`-c alarmEmail=…` で上書きできる |

警報とトピックのあいだに SNS を挟むのは、宛先を変えても警報を作り直さずに済み、メールのほかにチャットへの通知なども足せるからです。

メールの購読は、配備したあとに届く **確認のメールのリンクを開くまで有効になりません**。開き忘れると、警報が鳴ってもだれにも届きません（[docs/operations/spot-tiles.md](https://github.com/duwenji/yorisoi-console/blob/main/docs/operations/spot-tiles.md)）。

## ログ: どれだけ残し、何を書かないか

Lambda と Fargate が標準出力に書いたものは、CloudWatch Logs のロググループに残ります。何もしなければ **ずっと残り**、保存した量だけ費用がかかります。

| スタック | ロググループ | 残す期間 |
|---|---|---|
| 管理システム | Lambda ごと（5 つ） | 開発用は 14 日、本番は消さない |
| AI の中継 | `RelayLogs` | 開発用は 14 日、本番は 1 か月 |
| スポットのタイル | `BatchLogs` | 1 か月 |

管理システムは、本番は ADR-001 のとおり守りを優先して消さず、開発用だけ溜まり続けないように 14 日で消します（[docs/operations/cost.md](https://github.com/duwenji/yorisoi-console/blob/main/docs/operations/cost.md)）。

**書かないもの** も決めています。中継はプロンプトと返事をログに書かず、数だけを書きます（R-13、[8-9](09-ai-relay.md) の「残さないもの」）。管理システムのメールの処理は、操作の記録に宛先のメールアドレスを書かず、テストでそれを守っています（[8-7](07-sqs-ses-kms.md)）。タイルの配信は、CloudFront のアクセスログ自体を取りません（S-12、[8-10](10-spot-tiles.md)）。ログは調べものに便利ですが、残したものは漏れる可能性があります。

## 費用をスタックごとに見る

[8-1](01-aws-basics.md) で見たとおり、管理システムの部品には `project=yorisoi-console` のタグが付いています。中継とタイルも、それぞれ別のタグを付けています（`bin/relay.ts`・`bin/tiles.ts`）。

| スタック | タグ `project` | 費用のほとんど | 開発用の目安（月） |
|---|---|---|---|
| 管理システム | `yorisoi-console` | KMS の鍵（1 USD）・警報 | 約 1.5 USD |
| AI の中継 | `yorisoi-ai-relay` | Bedrock の利用料（使った分だけ）・警報 | 使った回数しだい。解説 1 回で約 0.001〜0.002 USD |
| スポットのタイル | `yorisoi-spot-tiles` | Fargate（週 1 回）・S3 への書き込み | 1 USD 前後（1 回目は書き込みで数 USD） |

数字は [docs/operations/cost.md](https://github.com/duwenji/yorisoi-console/blob/main/docs/operations/cost.md) と公開されている単価からの目安です。請求の画面（Cost Explorer）で、タグ `project` で絞り込むと、スタックごとの実際の額が見られます。

### 予算が数えるもの、数えないもの

AWS Budgets の予算（`MonthlyBudget`）は、管理システムのスタックにあり、**タグ `project=yorisoi-console` の費用だけ** を数えます。

```ts
costFilters: { TagKeyValue: [`user:project$${PROJECT_TAG}`] },
```

中継とタイルの費用は、この予算に入りません。中継には別の守りがあります。月の予算を Parameter Store に置き、中継が自分で使った額を数えて、超えたら止まります（[8-9](09-ai-relay.md)）。80% で `BudgetNear`、止まったら `Paused` の警報が鳴ります。AWS Budgets は「超えそう」と知らせるだけで止めないので、使った分だけ費用がかかる Bedrock には、止める仕組みを自分で持たせています。

タグで費用を数えるには、請求の画面で `project` を **コスト配分タグ** として一度だけ有効にする必要があります。有効にするまで、予算は 0 USD と数えます（[docs/operations/cost.md](https://github.com/duwenji/yorisoi-console/blob/main/docs/operations/cost.md)）。

## ハンズオン: 3 つのスタックの見張りを一覧する

AWS のアカウントは要りません。3 つのスタックのテンプレートから、警報・ルール・宛先・予算・ログを抜き出します。

### 1. テンプレートを作る

管理システムは [8-1](01-aws-basics.md) のハンズオンで作った `.local/cdkout/` を使います。中継とタイルを作ります（タイルは [8-10](10-spot-tiles.md) で作っていれば不要）。

```sh
cd /c/Dev/apps/yorisoi-console/infra
npx cdk synth -a "npx tsx bin/relay.ts" -c env=dev -o ../.local/cdkout-relay --quiet
npx cdk synth -a "npx tsx bin/tiles.ts" -c env=dev -o ../.local/cdkout-tiles --quiet
cd ..
```

### 2. 一覧する

```sh
python -X utf8 - <<'EOF'
import json, glob, os
for path in sorted(glob.glob('.local/cdkout*/Yorisoi*.template.json')):
    t = json.load(open(path, encoding='utf-8'))
    print('==', os.path.basename(path).replace('.template.json', ''))
    for name, r in t['Resources'].items():
        p = r.get('Properties', {})
        if r['Type'] == 'AWS::CloudWatch::Alarm':
            print('  警報  ', p.get('AlarmDescription', name)[:70])
        elif r['Type'] == 'AWS::Events::Rule':
            print('  ルール', p.get('Description', name)[:70])
        elif r['Type'] == 'AWS::SNS::Subscription':
            print('  宛先  ', p['Protocol'])
        elif r['Type'] == 'AWS::Budgets::Budget':
            print('  予算  ', p['Budget']['BudgetLimit'])
        elif r['Type'] == 'AWS::Logs::LogGroup':
            print('  ログ  ', name[:40], p.get('RetentionInDays', '消さない'))
EOF
```

```
== YorisoiAiRelay-dev
  ログ   RelayLogs019433A2 14
  宛先   email
  警報   The month’s spend on the operator’s AI passed 80% of the budget (ADR-A
  警報   The operator’s AI is paused: the month’s budget is used up (ADR-AI-REL
  警報   A relay parameter is not valid; the relay uses 30 calls, the default b
  警報   Bedrock failed 10 times in 5 minutes
== YorisoiSpotTiles-dev
  ログ   BatchLogsA0B94732 30
  宛先   email
  ルール The spot tiles batch stopped with an error; the previous tiles stay
== YorisoiConsole-dev
  ログ   PublishFunctionLogs8A6D69AD 14
  警報   The channel list could not be published
  警報   No successful publication for two days; the list expires 14 days after
  予算   {'Amount': 5, 'Unit': 'USD'}
  ログ   ConsolePostConfirmationLogsEAF93B27 14
  …
  警報   A publisher notice could not be sent after retries (dead-letter queue)
```

### 3. 読む

- 管理システムには **宛先（`email`）がない**。8-1 の合成で `-c alarmEmail=…` を渡さなかったからです。この合成のまま配備すると、警報が鳴ってもだれにも届きません。`-c alarmEmail=you@example.com` を足して合成し直し、宛先が増えるのを確かめてください
- 予算は管理システムにだけある
- ログの残す期間（`RetentionInDays`）が、上の表と合っている
- 中継の警報の説明には、決定の番号（R-10 など）が書いてある。鳴ったとき、なぜその警報があるのかを ADR でたどれます

## つまずきやすいところ

- **メールの購読は、確認のリンクを開くまで届かない**: 配備したら受信箱を見る
- **失敗の警報だけでは、「呼ばれなくなった」に気づけない**: 困る日があるものは、成功が来ないことを見張る（`treatMissingData: BREACHING`）
- **ロググループは、何もしなければずっと残る**: 残す期間を決める。書かないものも決める
- **予算は知らせるだけで、止めない**: 使った分だけかかる部品には、自分で止める仕組みが要ることがある
- **タグは、請求の画面で有効にするまで数えられない**

## 確認問題

<details>
<summary>問 1. 中継の「予算の何割を使ったか」の数字は、どうやって CloudWatch に届きますか。</summary>

中継の Lambda が、埋め込みメトリクス形式（EMF）の JSON をログに 1 行書きます。CloudWatch がそのログを読んでメトリクスにします。数字を送る API を呼ぶ必要も、そのための権限も要りません。

</details>

<details>
<summary>問 2. 管理システムの <code>NoRecentPublication</code> が <code>treatMissingData: BREACHING</code> なのはなぜですか。タイルのバッチに同じ見張りがないのはなぜですか。</summary>

公開の Lambda が呼ばれなくなると、数字そのものが届かなくなります。届かないことを異常とみなさないと、それに気づけないからです。リストは最後の公開から 14 日で期限が切れるので、気づくのが遅れると困ります。タイルは止まっても前の週のタイルが配られ続け、困る日が決まっていないので、失敗の出来事だけを拾っています。

</details>

<details>
<summary>問 3. AWS Budgets の予算は、中継の Bedrock の費用を数えますか。数えないなら、中継の費用はどう守っていますか。</summary>

数えません。予算はタグ <code>project=yorisoi-console</code> の費用だけを数え、中継のタグは <code>yorisoi-ai-relay</code> だからです。中継は、Parameter Store に置いた月の予算まで使ったら自分で止まり、80% で <code>BudgetNear</code>、止まったら <code>Paused</code> の警報で運営に知らせます。

</details>

---

前: [8-10 スポットのタイル配信](10-spot-tiles.md) ／ 次: [8-12 スタジオ](12-studio.md)
