# 7-4 テスト

[目次](../README.md) ＞ 第 7 部 ＞ 7-4

> Vitest と Docker の仕組みと最小の使い方は [技術カード: Vitest](../ref/vitest.md)・[技術カード: Docker](../ref/docker.md) にあります。

## この章で学ぶこと

- Vitest でのテストの書き方（`describe`・`it`・`expect`）
- AWS を呼ぶコードを、AWS なしでテストする 3 つの方法
  1. 部品を差し替えられる作りにして、メモリの代役を渡す
  2. AWS の SDK の呼び出しを、代役（aws-sdk-client-mock）に受け止めさせる
  3. 本物そっくりのデータベース（DynamoDB Local）を Docker で動かす
- テストを 1 つだけ流す方法、時刻を固定する方法

## 管理システムのテスト

```sh
cd /c/Dev/apps/michizure-console
npx vitest run
```

```
 Test Files  13 passed (13)
      Tests  135 passed (135)
   Duration  15.11s
```

13 個のファイル、135 件のテストが、15 秒ほどで終わります。AWS のアカウントは要りません（Docker は要ります）。

| ファイル | 何を確かめるか | AWS の代わり |
|---|---|---|
| `packages/protocol/test/protocol.test.ts` | 署名つき文書の作成と検証（第 6 部） | 要らない |
| `api/test/publisher.test.ts` | 公開の処理（[6-4](../06-trust/04-two-tier-keys.md)） | メモリの代役、aws-sdk-client-mock |
| `api/test/console.test.ts`・`publisher-api.test.ts`・`review.test.ts`・`notify.test.ts` | 管理 API（運営・チャンネル提供者・審査）、メールの知らせ | DynamoDB Local（Docker） |
| `api/test/collections.test.ts` | 素材提供者の役割、素材集の申請・審査、素材集を使うチャンネル、素材集を載せた公開 | DynamoDB Local（Docker） |
| `api/test/external.test.ts` | 素材集の外の素材の毎日の確認、確かめてよい宛先かどうか | 要らない（取ってくる部品を代役に） |
| `conformance/test/end-to-end.test.ts` | 準拠テスト | 手元の HTTP サーバー |
| `tools/root-key/test/root-key.test.ts` | ルート鍵の CLI | 要らない |
| `infra/test/console-stack.test.ts` | CDK の定義（第 8 部） | 要らない |
| `web/test/publisher-crypto.test.ts`・`ai.test.ts` | 画面の中の鍵と署名、審査の見本（[9-3](../09-console/03-keys-in-browser.md)） | 要らない |

どのファイルを流すかは、[vitest.config.ts](../../michizure-console/vitest.config.ts) が決めています。

```ts
export default defineConfig({
  test: {
    include: ['**/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/cdk.out/**'],
  },
});
```

全パッケージの `test/` フォルダの `*.test.ts` を、いちばん上のフォルダから 1 回で流します（[7-2](02-workspaces.md) のモノレポ）。

## Vitest の書き方

**Vitest** は、TypeScript のテストを書いて流す道具です。`.ts` のテストを、事前のビルドなしで直接流せます（[7-2](02-workspaces.md) の表）。

[packages/protocol/test/protocol.test.ts](../../michizure-console/packages/protocol/test/protocol.test.ts) から:

```ts
import { describe, expect, it } from 'vitest';

describe('encoding and ids', () => {
  it('uses lowercase base32 without padding (RFC 4648 test vectors)', () => {
    // …
    expect(base32(utf8.encode('foobar'))).toBe('mzxw6ytboi');
  });
});
```

| 書き方 | 意味 | JUnit（Kotlin）では |
|---|---|---|
| `describe('…', () => { … })` | テストのまとまり | テストのクラス |
| `it('…', () => { … })` | 1 つのテスト。名前は文章で | `@Test fun \`…\`()` |
| `expect(値).toBe(期待)` | 等しいか（同じもの） | `assertEquals` |
| `expect(値).toEqual(期待)` | 中身が等しいか | `assertEquals`（data class） |
| `expect(値).toMatchObject({ … })` | 書いた項目だけが一致するか | — |
| `await expect(promise).rejects.toThrow('…')` | 例外で失敗するか | `assertThrows` |
| `beforeEach`・`beforeAll`・`afterAll` | 前後の準備と片付け | `@Before`・`@BeforeClass`・`@AfterClass` |

`it` の名前を文章で書く習慣は、Kotlin の側（`` `a close toilet comes up after walking a while` ``）と同じです。テストの一覧が、そのまま仕様の一覧になります。

### 時刻を固定する

```ts
const now = new Date('2026-10-03T03:00:00.000Z');
const days = (n: number) => new Date(now.getTime() + n * 24 * 3600_000);
```

リストの期限（14 日）のように時刻に関わる振る舞いは、時刻を固定しないと、テストを流す日によって結果が変わります。管理システムの関数は、時刻を引数（`now`）や部品（`deps.now`）で受け取るので、テストでは決まった時刻を渡せます。[2-3](../02-compose/03-manual-di.md) の「時刻も依存」、[6-6](../06-trust/06-same-rules.md) のテストベクタの `now` と同じ考え方です。

## AWS なしでテストする方法 1: メモリの代役

[6-4](../06-trust/04-two-tier-keys.md) で見たとおり、公開の処理 `publish` は、保存先・CDN・署名を引数（`deps`）で受け取ります。テストでは、メモリの代役を渡します。

```ts
// api/test/publisher.test.ts
import { MemoryStorage, MemoryStore, noCdn, publish, type PublishDeps } from '../src/publish/index.js';

beforeEach(async () => {
  p = await makeTestProvider({ now });
  store = new MemoryStore();
  storage = new MemoryStorage();
  deps = { store, storage, cdn: noCdn, signerFor: () => p.signing, config: { rootPublicKey: p.rootKey, name: '…' }, now: () => now };
});
```

| 本物 | テストの代役 |
|---|---|
| DynamoDB（`DynamoStore`） | `MemoryStore`（メモリの表） |
| S3（`S3Storage`） | `MemoryStorage` |
| CloudFront（`CloudFrontCdn`） | `noCdn`（何もしない） |
| KMS（`kmsSigner`） | `p.signing`（手元の鍵、`makeTestProvider`） |

これは第 6 部のハンズオンの `npm run publish:local -w api` と同じ代役です。**本物と代役が同じ約束（`PublicationStore` などのインターフェース）を守っている** ので、`publish` のロジックは、代役でテストすれば本物でも同じように動きます。約束は [api/src/publish/ports.ts](../../michizure-console/api/src/publish/ports.ts) にまとめてあります。

## 方法 2: SDK の呼び出しを代役に受け止めさせる

では、本物の部品（`kmsSigner`・`DynamoStore`）そのものは、どうテストするのでしょう。中で AWS の SDK を呼んでいます。

**aws-sdk-client-mock** は、AWS の SDK の呼び出しを、インターネットに出さずに受け止めて、決めた答えを返す道具です。

```ts
// api/test/publisher.test.ts
import { mockClient } from 'aws-sdk-client-mock';

it('signs with KMS as pure Ed25519 over the raw message', async () => {
  const kms = mockClient(KMSClient);
  kms.on(SignCommand).resolves({ Signature: new Uint8Array([1, 2, 3]) });
  const signer = kmsSigner({ keyId: 'k-2026-10', kmsKeyArn: 'arn:aws:kms:ap-northeast-1:1:key/x', status: 'active' }, new KMSClient({ region: 'ap-northeast-1' }));

  expect(await signer.sign(new Uint8Array([9]))).toEqual(new Uint8Array([1, 2, 3]));
  expect(kms.commandCalls(SignCommand)[0]?.args[0].input).toMatchObject({
    KeyId: 'arn:aws:kms:ap-northeast-1:1:key/x',
    MessageType: 'RAW',
    SigningAlgorithm: 'ED25519_SHA_512',
  });
  await expect(signer.sign(new Uint8Array(4097))).rejects.toThrow('4096');
  kms.restore();
});
```

1. `mockClient(KMSClient)`: KMS の SDK の呼び出しを、代役が受け止めるようにする
2. `kms.on(SignCommand).resolves({ … })`: `SignCommand` が来たら、この答えを返す
3. `kmsSigner` を動かして、返ってきた署名を確かめる
4. `kms.commandCalls(SignCommand)`: 実際にどんな要求が送られたかを確かめる。**`MessageType: 'RAW'`・`SigningAlgorithm: 'ED25519_SHA_512'` で頼んでいるか**（[技術カード: AWS KMS](../ref/aws-kms.md) の「よくある間違い」の 1 つ目を、ここで防いでいる）
5. 4,097 バイトのデータは、KMS に送る前に断るか（[6-4](../06-trust/04-two-tier-keys.md)）
6. `kms.restore()`: 代役を外す

本物の KMS の署名は確かめていません。確かめているのは「**正しい頼み方をしているか**」です。KMS が正しい頼み方に正しく応えることは、AWS を信じます。

## 方法 3: 本物そっくりのデータベースを動かす

管理 API は、DynamoDB の **条件つき書き込み**（「`rev` が 4 のときだけ書く」）や **トランザクション**（複数の項目をまとめて書く）、**GSI**（別の並べ方の索引）に深く頼っています（第 8 部）。こうした振る舞いをメモリの代役で真似るのは難しく、真似方を間違えると、テストは通るのに本番で動かない、ということになります。

そこで、AWS が配っている **DynamoDB Local**（手元で動く DynamoDB）を、**Docker** のコンテナで動かしています。[api/test/dynamo-local.ts](../../michizure-console/api/test/dynamo-local.ts):

```ts
/**
 * DynamoDB Local for tests that depend on conditions, transactions and GSIs. Uses
 * $DYNAMODB_ENDPOINT when set (CI service container), otherwise starts a Docker container.
 */
export async function startDynamoLocal(): Promise<{ endpoint: string; stop: () => void }> {
  if (process.env.DYNAMODB_ENDPOINT) return { endpoint: process.env.DYNAMODB_ENDPOINT, stop: () => {} };
  const id = execFileSync('docker', ['run', '-d', '--rm', '-p', '127.0.0.1::8000', 'amazon/dynamodb-local:latest', '-jar', 'DynamoDBLocal.jar', '-inMemory'], {
    encoding: 'utf8',
  }).trim();
  const port = execFileSync('docker', ['port', id, '8000/tcp'], { encoding: 'utf8' }).trim().split(':').pop();
  // … 応えるようになるまで待つ …
  return { endpoint, stop: () => execFileSync('docker', ['stop', id]) };
}
```

- `docker run -d --rm … amazon/dynamodb-local:latest`: DynamoDB Local のコンテナを裏で動かす。`--rm` で、止めたら消える
- `-p 127.0.0.1::8000`: コンテナの 8000 番を、パソコンの **空いている番号** につなぐ。テストのファイルが同時にいくつ動いても、ぶつからない
- `-inMemory`: データをメモリにだけ持つ。止めれば消える
- CI では、ワークフローの `services:` で DynamoDB Local を用意し、`DYNAMODB_ENDPOINT` を渡すので、自分では起動しない（[技術カード: GitHub Actions](../ref/github-actions.md)）

テストごとに、新しいテーブルを作ります。

```ts
/** A fresh table per test, so tests don't see each other's items. */
export async function freshTable(endpoint: string) {
  const raw = rawClient(endpoint);
  // Test files run in parallel against one endpoint in CI: a random name never collides.
  const table = `t${randomUUID().replace(/-/g, '')}`;
  await raw.send(new CreateTableCommand(tableDefinition(table)));
  // …
}
```

テーブルの形（キーと GSI）は、`infra` の CDK の定義と同じにしてあります（コメント: "The DM-001 table, as infra/lib/console-stack.ts creates it."）。

### API を通しでテストする

[api/test/console.test.ts](../../michizure-console/api/test/console.test.ts) は、ルーター（`route`）に要求を渡して、応答を確かめます。

```ts
async function call(method: string, path: string, options: { body?: unknown; ifMatch?: number | string; caller?: Caller; query?: Record<string, string> } = {}) {
  const res: Response = await route(deps, {
    method,
    path,
    query: options.query ?? {},
    headers: options.ifMatch !== undefined ? { 'if-match': `"${options.ifMatch}"` } : {},
    body: options.body,
    caller: options.caller ?? operator,
    requestId: 'req-1',
  });
  return { status: res.statusCode, headers: res.headers, body: res.body ? JSON.parse(res.body) : undefined };
}
```

API Gateway や Lambda は通さず、その奥の `route` を直接呼んでいます。HTTP のサーバーを立てなくても、API の振る舞い（ステータス・ヘッダー・本文）をそのまま確かめられます。ログインした人（`caller`）も、引数で渡すだけです。

[7-3](03-openapi.md) の `If-Match` の決まりは、こう確かめられています。

```ts
it('suspends and resumes with If-Match, and records why', async () => {
  const id = await seedPublisher();
  expect((await call('POST', `/api/admin/publishers/${id}/suspend`, { body: { reason: '規約違反の疑い' } })).status).toBe(428);
  expect((await call('POST', `/api/admin/publishers/${id}/suspend`, { body: { reason: 'x' }, ifMatch: 9 })).status).toBe(412);
  const suspended = await call('POST', `/api/admin/publishers/${id}/suspend`, { body: { reason: '規約違反の疑い' }, ifMatch: 1 });
  expect(suspended.body).toMatchObject({ status: 'suspended', statusReason: '規約違反の疑い', rev: 2 });
  expect(suspended.headers.etag).toBe('"2"');
  // …
});
```

- `If-Match` なし → 428
- 違う版（9） → 412
- 正しい版（1） → 停止され、版が 2 になり、`ETag` も `"2"` になる

API-001 の C-8 の決まりが、そのままテストになっています。

## 3 つの方法の使い分け

| 方法 | 速さ | 何を確かめられるか | 使う場面 |
|---|---|---|---|
| メモリの代役 | 速い | ロジック（`publish` の手順） | 依存を差し替えられる作りのとき |
| SDK の代役（aws-sdk-client-mock） | 速い | AWS への **頼み方** | 本物の部品（アダプター）の中身 |
| DynamoDB Local（Docker） | 少し遅い（起動に数秒） | データベースの **本物の振る舞い**（条件・トランザクション・索引） | データベースに深く頼るコード |

どれも「本物の AWS を呼ばない」点は同じです。本物の AWS での確かめは、開発用の環境に配備して、通しの確認（`tools/e2e`）で行います（第 8 部）。

## ハンズオン: テストを絞って流し、壊す

```sh
cd /c/Dev/apps/michizure-console
```

### 1. 1 つのパッケージだけ流す

```sh
npx vitest run packages/protocol
```

```
      Tests  16 passed (16)
   Duration  197ms
```

ファイルやフォルダを指定すると、そこだけを流します。Docker も要らず、一瞬で終わります。

### 2. SDK の代役のテストを壊す

[api/src/publish/aws.ts](../../michizure-console/api/src/publish/aws.ts) の末尾の `kmsSigner` で、`MessageType: 'RAW'` を `MessageType: 'DIGEST'` に変えて、公開の処理のテストを流します。

```sh
npx vitest run api/test/publisher.test.ts
```

```
     × signs with KMS as pure Ed25519 over the raw message
…
- Expected
+ Received

  {
    "KeyId": "arn:aws:kms:ap-northeast-1:1:key/x",
-   "MessageType": "RAW",
+   "MessageType": "DIGEST",
    "SigningAlgorithm": "ED25519_SHA_512",
  }
```

本物の KMS なら、`ED25519_SHA_512` と `DIGEST` の組み合わせは受け付けられません（[技術カード: AWS KMS](../ref/aws-kms.md)）。配備して初めて気づく誤りを、AWS なしのテストが見つけてくれました。元に戻します（`git checkout -- api/src/publish/aws.ts`）。

### 3. DynamoDB Local のテストを、名前で絞って流す

Docker Desktop が動いていることを確かめてから:

```sh
npx vitest run api/test/console.test.ts -t "If-Match"
```

```
      Tests  1 passed | 12 skipped (13)
   Duration  4.86s
```

`-t` で、名前に「If-Match」を含むテストだけを流します（ほかは skipped）。数秒かかるのは、DynamoDB Local のコンテナを起動して待つからです。テストが終わると、コンテナは止まって消えます。

### 4. If-Match の決まりを壊す

[api/src/console/http.ts](../../michizure-console/api/src/console/http.ts) の `ifMatch` で、

```ts
if (!header) return fail('precondition_required', 'If-Match is required');
```

を `if (!header) return 1;`（`If-Match` がなければ版 1 とみなす）に変えて、手順 3 と同じテストを流します。

```
- Expected
+ Received

- 428
+ 200
```

`If-Match` なしの変更が通ってしまう（200）のを、テストが見つけました。古い画面のまま、ほかの人の変更を上書きできてしまう不具合です。元に戻します。

```sh
git checkout -- api/src/console/http.ts
git status
```

## つまずきやすいところ

- **AWS を直接呼ぶコードは、差し替えられる作りに**: 部品を引数で受け取れば、テストでは代役を渡せる
- **代役で確かめられるのは「頼み方」まで**: 本物の振る舞いが大事なところ（データベースの条件など）は、本物そっくりのもの（DynamoDB Local）で
- **テストどうしを干渉させない**: テストごとに新しいテーブルを作る、ランダムな名前にする
- **時刻を固定する**: `new Date()` を直接使うと、日によって結果が変わる
- **Docker が動いていないと、DynamoDB Local のテストは失敗する**: ほかのテストは流せる

## 確認問題

<details>
<summary>問 1. <code>kmsSigner</code> のテストでは、本物の KMS の署名を確かめていません。では何を確かめていますか。</summary>

KMS への頼み方（どの鍵に、`MessageType: 'RAW'`・`SigningAlgorithm: 'ED25519_SHA_512'` で頼んでいるか）と、KMS の答えをそのまま返すこと、4,096 バイトを超えるデータを送る前に断ることです。

</details>

<details>
<summary>問 2. 管理 API のテストで、メモリの代役ではなく DynamoDB Local を使うのはなぜですか。</summary>

管理 API が、DynamoDB の条件つき書き込み・トランザクション・GSI に深く頼っていて、それをメモリの代役で正しく真似るのが難しいからです。真似方を間違えると、テストは通るのに本番で動かない、ということになります。

</details>

<details>
<summary>問 3. DynamoDB Local のコンテナを、決まった番号（8000）ではなく空いている番号につなぐのはなぜですか。</summary>

テストのファイルがいくつも同時に動いても、番号がぶつからないようにするためです。また、パソコンでほかに 8000 番を使っているものがあっても困りません。

</details>

---

前: [7-3 契約から始める（OpenAPI）](03-openapi.md) ／ 次: [8-1 AWS の基本](../08-aws/01-aws-basics.md)
