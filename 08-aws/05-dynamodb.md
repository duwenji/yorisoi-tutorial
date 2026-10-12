# 8-5 DynamoDB の 1 テーブル設計

[目次](../README.md) ＞ 第 8 部 ＞ 8-5

> DynamoDB の仕組みと最小の使い方は [技術カード: DynamoDB](../ref/dynamodb.md) にあります。

## この章で学ぶこと

- DynamoDB がどんなデータベースか（キーで引く、SQL の結合はない）
- 「まず読み方を決め、それに合わせてキーを決める」設計の進め方（アクセスパターン）
- 種類の違うデータを 1 つのテーブルに入れる **1 テーブル設計**
- 並べ替えのキー（SK）と `begins_with` で、まとめて引く
- **疎なインデックス**（GSI）で、「審査待ち」「リストに載せるもの」だけを引く
- 条件つき書き込みとトランザクションで、同時の書き込みと、途中で止まることから守る
- TTL、1 日の上限の数え方、書き換えられないカーソル

## DynamoDB とは

**Amazon DynamoDB** は、AWS の **キーと値** のデータベースです。

| | ふつうの関係データベース（SQL） | DynamoDB |
|---|---|---|
| データの形 | 決まった列を持つ表を、いくつも | 項目（JSON に近い）を、キーで |
| 引き方 | SQL で自由に（結合・集計も） | **キーで引く**。決まった引き方しかできない |
| 速さ | データが増えると工夫が要る | データがどれだけ増えても、キーで引けば速い |
| サーバー | 動かし続ける | サーバーレス。使った分だけ |

DynamoDB の項目は、**パーティションキー**（PK）と、任意の **ソートキー**（SK）の 2 つで決まります。

- **PK** が同じ項目は、同じ場所（パーティション）に、SK の順に並んで置かれる
- 引き方は主に 2 つ: **PK と SK を指定して 1 つ**（`GetItem`）、**PK を指定して、SK の範囲で何件か**（`Query`）
- それ以外の引き方（すべての項目を見る `Scan`）は、遅くて高い。ふだんは使わない

SQL のように、あとから「この条件で探して」とは言えません。だから DynamoDB では、**どう読むかを先に決め、それに合わせてキーを決めます**。

## 読み方を先に決める: アクセスパターン

管理システムのデータの設計は、[DM-001（data-model.md）](../../michizure-console/docs/data-model.md) に書かれています。その中心が **アクセスパターン**（だれが、何を、どう読むか）の一覧です。

| No. | だれが | 何をする | 使うキー |
|---|---|---|---|
| AP-01 | 全員 | ログインしたユーザーからチャンネル提供者を引く | `USER#{sub}` |
| AP-05 | チャンネル提供者 | 自分のチャンネルの一覧 | GSI1 `PUB#{publisherId}` / `CH#` |
| AP-06 | 全員 | チャンネルを見る | `CH#{channelId}` / `CH` |
| AP-07 | チャンネル提供者・運営 | チャンネルの申請の一覧（新しい順） | `CH#{channelId}` / `SUB#` |
| AP-09 | 運営 | 審査待ちの一覧（古い順） | GSI2 `QUEUE#REVIEW` |
| AP-10 | 公開の Lambda | リストに載せるチャンネルをすべて集める | GSI2 `LISTED` |
| AP-13 | 公開の Lambda | 今の `seq` を読み、1 つ進める | `PUBLICATION` / `HEAD` |
| AP-17 | システム | 今日の申請・試用チケットの数を確かめて増やす | `PUB#{publisherId}` / `QUOTA#{日付}` |
| AP-18 | 運営 | 操作の記録を新しい順に見る | `AUDIT#{年月}` |
| AP-26 | 公開の Lambda | リストに載せる素材集をすべて集める | GSI2 `LISTED` / `COL#`（チャンネルは `CH#`） |
| … | | （全部で 29 個。AP-23〜29 は素材集のために DM-001 1.3 で足したもの） | |

この一覧を先に作り、**すべての読み方が、キーで引けるように** キーを決めています。

## 1 つのテーブルに、種類の違う項目を

管理システムのテーブルは **1 つだけ** です（ADR-001 A-6）。チャンネル提供者も、チャンネルも、申請も、操作の記録も、同じテーブルに入っています。キーの付け方で見分けます（DM-001「項目の種類とキー」から抜粋）。

| 種類 | PK | SK |
|---|---|---|
| ユーザー | `USER#{sub}` | `USER` |
| チャンネル提供者 | `PUB#{publisherId}` | `PUB` |
| チャンネル提供者の鍵 | `PUB#{publisherId}` | `KEY#{accountId}` |
| 1 日の数 | `PUB#{publisherId}` | `QUOTA#{yyyy-mm-dd}` |
| チャンネル | `CH#{channelId}` | `CH` |
| 申請 | `CH#{channelId}` | `SUB#{submissionId}` |
| 審査の記録 | `CH#{channelId}` | `SUB#{submissionId}#REVIEW#{at}` |
| 取り下げ | `CH#{channelId}` | `REVOKE#{revokedAt}` |
| 公開の先頭 | `PUBLICATION` | `HEAD` |
| 公開の履歴 | `PUBLICATION` | `SEQ#{10 桁で 0 埋め}` |
| 操作の記録 | `AUDIT#{yyyy-mm}` | `{at}#{eventId}` |
| 素材集 | `COL#{collectionId}` | `COL` |
| 素材集の申請・審査の記録・取り下げ | `COL#{collectionId}` | `SUB#…`・`SUB#…#REVIEW#{at}`・`REVOKE#{revokedAt}` |
| 利用の記録（どのチャンネルが使っているか） | `COL#{collectionId}` | `USEDBY#{channelId}` |

素材集（DM-001 1.3）は、新しいテーブルを作らず、チャンネルと **同じ形の項目を `COL#…` の下に** 置いています（M-18）。読み方も同じなので、チャンネルのために作った GSI（`LISTED`・`QUEUE#REVIEW` など）をそのまま使い、SK の接頭辞（`CH#`・`COL#`）や `kind` で見分けます。1 テーブル設計が、新しい種類のデータを足すときにも素直に伸びる例です。

`CH#kamakura-history` という PK の下に、チャンネルそのもの（`CH`）と、その申請（`SUB#…`）と、審査の記録と、取り下げが、**並んで置かれます**。

```
PK = CH#kamakura-history
  ├── SK = CH                                  チャンネル
  ├── SK = REVOKE#2026-10-01T00:00:00.000Z      取り下げ
  ├── SK = SUB#01J…A                            申請（版 1）
  ├── SK = SUB#01J…A#REVIEW#2026-10-02T…        その審査の記録
  └── SK = SUB#01J…B                            申請（版 2）
```

なぜ 1 つのテーブルにするのでしょうか。

- **一緒に読むものを、一緒に置ける**: 1 つのチャンネルの申請の一覧は、`PK = CH#…`・`SK` が `SUB#` で始まる、の 1 回の `Query` で引ける
- **トランザクションが 1 つのテーブルの中で済む**（下で説明）
- **部品が少ない**: テーブルが 1 つなら、権限（[8-1](01-aws-basics.md)）も、バックアップの設定も、テストのテーブルの作り方（[7-4](../07-typescript/04-testing.md)）も 1 つで済む

### SK の並びを使う

SK は文字列の順に並びます。この性質を、キーの付け方で使っています。

- **申請の ID は ULID**（DM-001 M-12）: 作った時刻から始まる ID なので、ID の順 ＝ 作った順。`ScanIndexForward: false`（逆順）で引けば、新しい順の一覧になる
- **公開の履歴の `seq` は 10 桁で 0 埋め**（`SEQ#0000000129`）: 0 で埋めないと、文字列の順では `SEQ#10` が `SEQ#9` より前に来てしまう
- **操作の記録の SK は時刻から始まる**（`{at}#{eventId}`）: 時刻の順に並ぶ

[api/src/console/util.ts](../../michizure-console/api/src/console/util.ts) の `ulid`:

```ts
/** A ULID: sorts by creation time (DM-001 M-12). */
export function ulid(now = Date.now()): string {
  let time = '';
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = CROCKFORD[t % 32] + time;
  const random = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[random[i]! % 32];
  return time + rand;
}
```

時刻を 10 文字、乱数を 16 文字で表した、26 文字の ID です。

## GSI: 別の並べ方の索引

PK と SK だけでは引けない読み方があります。たとえば「チャンネル提供者ごとのチャンネルの一覧」（チャンネルの PK は `CH#…` なので、チャンネル提供者では引けない）や、「審査待ちの申請の一覧」（いろいろなチャンネルにまたがる）です。

**GSI**（グローバルセカンダリインデックス）は、テーブルの項目を、**別のキーで並べ直した索引** です。管理システムには GSI1 と GSI2 の 2 つがあります。

| 索引 | 使い道 |
|---|---|
| GSI1 | 持ち主ごとの一覧（チャンネル提供者のチャンネル）、対象ごとの操作の記録 |
| GSI2 | **疎なインデックス**: 審査待ち・リストに載せるもの・取り下げ・移し替え待ち・チャンネル提供者の一覧 |

### 疎なインデックス

GSI には、**GSI のキーを持っている項目だけ** が入ります。この性質を使うのが **疎なインデックス** です。

| 種類 | GSI2PK / GSI2SK（あるときだけ） |
|---|---|
| チャンネル | **載せるとき** `LISTED` / `CH#{channelId}` |
| 申請 | **審査待ちのとき** `QUEUE#REVIEW` / `{submittedAt}#{channelId}` |
| 取り下げ | **7 日のあいだ** `REVOKED` / `{revokedAt}#{channelId}` |

- 申請が審査待ちになったら、`GSI2PK = QUEUE#REVIEW` を付ける。審査を始めたら、`GSI2PK` を **消す**
- すると、GSI2 で `QUEUE#REVIEW` を引けば、**今まさに審査待ちの申請だけ** が、提出の古い順に出てくる

公開の Lambda が「リストに載せるチャンネルをすべて集める」（AP-10）のも、GSI2 の `LISTED` を引くだけです。テーブルの全部を見る（`Scan`）必要はありません。

取り下げを 7 日だけ `revoked` に載せる（API-002、[6-5](../06-trust/05-verify-in-app.md)）のも、同じ仕組みです。7 日を過ぎた取り下げの `GSI2PK` を、公開の Lambda が毎日の作り直しのときに消します。

## 同時の書き込みから守る: 条件つき書き込み

[7-3](../07-typescript/03-openapi.md) で、`If-Match` と `rev` による **楽観的ロック** を見ました。データベースの側では、それを **条件つき書き込み** で行います（DM-001 M-11）。

[api/src/console/operator.ts](../../michizure-console/api/src/console/operator.ts) の書き込みから:

```ts
ConditionExpression: 'rev = :rev AND #status = :from',
```

「今の `rev` が、画面が読んだときの `rev` と同じで、状態が想定どおりのときだけ書く」という条件です。だれかが先に書き換えていたら（`rev` が増えていたら）、DynamoDB は書き込みを **断り**、`ConditionalCheckFailedException` という例外を返します。

管理 API は、それを `412`（`precondition_failed`）に直しています（[api/src/console/deps.ts](../../michizure-console/api/src/console/deps.ts)）。

```ts
export async function guarded<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException || e instanceof TransactionCanceledException) {
      return fail('precondition_failed', 'changed by someone else; read it again');
    }
    throw e;
  }
}
```

ほかにも、条件つき書き込みは次のように使われています。

| 条件 | 使い道 |
|---|---|
| `attribute_not_exists(PK)` | まだないときだけ作る。チャンネルの ID・アカウントID を、先に取った人のものにする（DM-001 M-6・M-7） |
| `seq = :prev` | 公開の `seq` を、読んだ値の次にだけ進める（[6-4](../06-trust/04-two-tier-keys.md)、[8-3](03-lambda-apigw.md)） |
| `attribute_not_exists(uploads) OR uploads < :max` | 1 日の上限に達していないときだけ数を増やす（下で説明） |

**読んでから確かめて書く**、を自分で行うと、読んだあと書くまでの間に、ほかの書き込みが割り込めます。条件つき書き込みなら、「確かめて書く」を DynamoDB が **1 回で** 行うので、割り込まれません。

## 途中で止まらない: トランザクション

取り下げの操作は、いくつもの項目を書き換えます。

1. 取り下げの項目を作る（7 日のあいだ GSI2 の `REVOKED` に載せる）
2. チャンネルの状態を `revoked` にし、`rev` を増やし、リスト（GSI2 の `LISTED`）から外す
3. 承認済みだった申請の状態も `revoked` にする
4. 操作の記録を残す（ADR-001 A-16）

もし 2 だけ書けて、残りの前に止まったら？ チャンネルは取り下げられたのに、だれが取り下げたかの記録が残りません。

**トランザクション**（`TransactWriteCommand`）は、複数の書き込みを **全部行うか、全部行わないか** のどちらかにします。1 つでも条件が外れたら、ほかの書き込みも行われず、`TransactionCanceledException` になります。

```ts
await guarded(() =>
  deps.db.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { /* … 取り下げの項目。ConditionExpression: 'attribute_not_exists(PK)' … */ } },
        { Update: { /* … チャンネル。ConditionExpression: 'rev = :rev AND #status = :active' … */ } },
        // … 承認済みの申請があれば、その状態も（ConditionExpression: '#state = :approved'）…
        auditItem(deps, req.caller, { action: 'channel.revoke', /* … */ }),
      ],
    }),
  ),
);
```

DM-001 の決まりは「操作の記録は、状態を変えるトランザクションの中で書く」です。記録が抜けることも、記録だけが残ることもありません。

## 1 日の上限を数える

チャンネル提供者の申請は 1 日 20 回まで、試用チケットは 1 日 10 回まで（DM-001 M-2）。これも条件つき書き込みで数えます（[api/src/console/publisher.ts](../../michizure-console/api/src/console/publisher.ts)）。

```ts
{
  Update: {
    TableName: deps.table, Key: { PK: `PUB#${publisherId}`, SK: `QUOTA#${jstDate(now)}` },
    UpdateExpression: 'ADD uploads :one SET #ttl = :ttl',
    ConditionExpression: 'attribute_not_exists(uploads) OR uploads < :max',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: { ':one': 1, ':max': max, ':ttl': Math.floor(now.getTime() / 1000) + 3 * 24 * 3600 },
  },
},
```

- その日（**日本時間** の日付、`jstDate`）の項目 `QUOTA#2026-10-05` に、`uploads` を 1 足す（`ADD`）
- 条件: まだ数がないか、上限より少ないときだけ。上限に達していたら断られ、`429`（`quota_exceeded`）になる
- 申請の作成と **同じトランザクション** に入れているので、上限で断られたら、申請も作られない

### TTL: 自動で消す

`SET #ttl = :ttl` は、この項目に「3 日後に消してよい」という印を付けています。テーブルの `timeToLiveAttribute: 'ttl'`（[8-2](02-cdk.md)）の設定で、DynamoDB は `ttl`（UNIX の秒）を過ぎた項目を、自動で消します。1 日の数・一度きりの文字列（鍵の紐づけ）・送ったメールの印など、しばらくしたら要らなくなる項目に付けています。

## 書き換えられないカーソル

一覧（チャンネル提供者の一覧、操作の記録など）は、20 件ずつ（`limit`）返し、続きは **カーソル** で取ります。DynamoDB は、続きの位置を `LastEvaluatedKey`（最後に読んだ項目のキー）で返します。

これをそのまま画面に渡すと、テーブルのキーの形が外から見え、書き換えて送られることもあります。管理システムは、それを **AES-GCM で暗号化して** から渡しています（[api/src/console/util.ts](../../michizure-console/api/src/console/util.ts)、API-001 C-9）。

```ts
/**
 * Opaque list cursors (API-001 C-9): DynamoDB's LastEvaluatedKey, encrypted with AES-256-GCM so a
 * client can't read or forge one.
 */
export class CursorCodec {
  encode(lastKey: Record<string, unknown> | undefined): string | null {
    if (!lastKey) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(lastKey), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }
  // decode: 復号できなければ invalid_request
}
```

[4-5](../04-outside/05-storage.md) の API キーの暗号化と同じ AES-GCM です。GCM は改ざんを見つけられるので、書き換えたカーソルは復号に失敗し、`400` で断られます。管理 API のテストの `lists newest first, with a cursor that cannot be forged` が、これを確かめています。

## ハンズオン: 1 テーブル設計を手で動かす

Docker の DynamoDB Local で、管理システムと同じキーの付け方・疎なインデックス・条件つき書き込み・トランザクションを試します。

### 1. スクリプトを置き、DynamoDB Local を起動する

[scripts/single-table.mjs](scripts/single-table.mjs) をコピーします。

```sh
cd /c/Dev/apps/michizure-console
cp ../sanpo-tutorial/08-aws/scripts/single-table.mjs .local/
ID=$(docker run -d --rm -p 127.0.0.1::8000 amazon/dynamodb-local:latest -jar DynamoDBLocal.jar -inMemory)
PORT=$(docker port $ID 8000/tcp | head -1 | sed 's/.*://')
```

### 2. 動かす

```sh
DDB_ENDPOINT=http://127.0.0.1:$PORT node .local/single-table.mjs
```

```
1. テーブルを作りました: practice…
2. チャンネル 2 つと、申請 2 つを入れました
3. 申請（新しい順）: [ 'v2 awaiting_review', 'v1 approved' ]
4. リストに載せるチャンネル: [ '鎌倉歴史散歩' ]
5. rev 1 のつもりで書く → 成功（rev は 2 に）
   もう一度 rev 1 のつもりで書く → 失敗: ConditionalCheckFailedException
6. 古い rev で取り下げ → 失敗: TransactionCanceledException
   操作の記録の数: 0 （記録も書かれていない）
   正しい rev で取り下げ → 成功。操作の記録の数: 1 ／ リストに載せるチャンネル: []
```

スクリプトを開いて、番号ごとに見てください。

| 番号 | していること | この章の節 |
|---|---|---|
| 1 | PK・SK と、GSI2 のあるテーブルを作る | 1 つのテーブルに |
| 2 | チャンネル 2 つ（1 つだけ `GSI2PK = LISTED`）と、申請 2 つを、同じテーブルに入れる | 1 つのテーブルに |
| 3 | `PK = CH#kamakura-history`・`begins_with(SK, 'SUB#')`・逆順で、申請を新しい順に | SK の並びを使う |
| 4 | GSI2 で `LISTED` を引くと、`LISTED` を持つチャンネルだけが出る | 疎なインデックス |
| 5 | `rev = 1` の条件で書く。2 回目は `rev` が 2 なので断られる | 条件つき書き込み |
| 6 | 取り下げ（条件つきの更新）と操作の記録を、1 つのトランザクションで。条件が外れると、記録も書かれない。成功すると、`GSI2PK` を消したので、リストからも消える | トランザクション、疎なインデックス |

### 3. 試してみる

- 2 で `東京の自然` にも `GSI2PK: 'LISTED', GSI2SK: 'CH#tokyo-nature'` を足すと、4 の結果はどうなるでしょうか
- 3 の `ScanIndexForward: false` を消すと、並びはどうなるでしょうか

### 4. 片付け

```sh
docker stop $ID
rm .local/single-table.mjs
```

## つまずきやすいところ

- **読み方を先に決める**: あとから「この条件で探したい」と思っても、キーで引けなければ `Scan`（遅くて高い）になる
- **SK の文字列の並びに気をつける**: 数は 0 で埋める。ID は作った順に並ぶもの（ULID）を使う
- **「読んで確かめて書く」を自分でしない**: 条件つき書き込みで、確かめと書き込みを 1 回に
- **一緒に変えるものは、トランザクションで**: 途中で止まっても、半分だけ書かれた状態にならないように
- **`LastEvaluatedKey` をそのまま外に出さない**: 中が見え、書き換えられる

## 確認問題

<details>
<summary>問 1. 「審査待ちの申請の一覧」を、テーブルの全部を見ずに引けるのはなぜですか。</summary>

審査待ちの申請にだけ `GSI2PK = QUEUE#REVIEW` を付けているからです（疎なインデックス）。GSI2 には GSI のキーを持つ項目だけが入るので、`QUEUE#REVIEW` を引けば、今審査待ちの申請だけが出てきます。審査を始めたら `GSI2PK` を消すので、一覧から外れます。

</details>

<details>
<summary>問 2. 公開の履歴の SK を <code>SEQ#129</code> ではなく <code>SEQ#0000000129</code> にしているのはなぜですか。</summary>

SK は文字列の順に並ぶからです。0 で埋めないと、`SEQ#10` が `SEQ#9` より前に来るなど、数の順と文字列の順が食い違います。桁をそろえれば、文字列の順が数の順になります。

</details>

<details>
<summary>問 3. 取り下げの操作で、操作の記録を同じトランザクションの中で書くのはなぜですか。</summary>

取り下げと記録の両方が書かれるか、両方とも書かれないかのどちらかにするためです。別々に書くと、途中で止まったときに、記録のない取り下げや、取り下げのない記録が残るおそれがあります。

</details>

---

前: [8-4 Cognito でログイン](04-cognito.md) ／ 次: [8-6 S3 と CloudFront](06-s3-cloudfront.md)
