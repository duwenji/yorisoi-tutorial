# 6-7 ハンズオン

[目次](../README.md) ＞ 第 6 部 ＞ 6-7

## このハンズオンでやること

第 6 部で学んだ仕組みを、手元で動かして確かめます。AWS のアカウントは要りません。

1. 管理システムの公開の処理で、リストのファイル一式を手元に作る
2. それを手元の HTTP サーバーで配る
3. 準拠テストをかけて、すべて合格することを見る
4. わざと壊して、正しいエラーで止まることを見る
5. アプリ側（Kotlin）の規則をわざと壊して、テストが落ちることを見る

所要時間はおよそ 30 分です。

## 準備

[0-3 開発環境の準備](../00-overview/03-setup.md) を済ませておいてください。とくに次の 2 つが要ります。

- sanpo-channel-console で `npm ci` が済んでいる
- SanpoGuide で `./gradlew :station-format:test` が通る

ターミナルを **2 つ** 開きます。ここでは「ターミナル A」「ターミナル B」と呼びます。どちらも Git Bash を使います。

## 手順 1. 公開する

ターミナル A で:

```sh
cd /c/Dev/apps/sanpo-channel-console
npm run publish:local -w api
```

```
published seq 1 to ../.local/site
provider: sc1yajr5krpx5u2nb4x45rijsrnvvtizhwl
```

`provider:` のあとの **リストID をメモしてください**。鍵は毎回新しく作るので、値は人によって、実行するたびに違います。以下では `<リストID>` と書きます。

### 何が起きたか

[api/src/publish/local-cli.ts](../../sanpo-channel-console/api/src/publish/local-cli.ts) が次のことをしました。

1. テスト用のリストを作る（ルート鍵・署名鍵を新しく作り、鍵セットにルート鍵で署名する。`makeTestProvider`）
2. 見本のチャンネルを 1 つ用意する（パッケージとアイコンは中身のない仮のファイル）
3. [6-4](04-two-tier-keys.md) で見た `publish` を、メモリの保存・フォルダへの書き出し・手元の鍵で動かす

作られたファイルを見てみましょう。

```sh
find .local/site/public -type f
```

```
.local/site/public/.well-known/sanpo-channels
.local/site/public/icons/0f4636c7….png
.local/site/public/pkg/14f0975c….zip
.local/site/public/v1/channels.json
```

API-002 の「エンドポイント一覧」と同じ並びです。パッケージとアイコンのファイル名は、中身の SHA-256 になっています。

### 中身をのぞく

リストの本体と要約をデコードしてみます。

```sh
node -e '
const d = JSON.parse(require("fs").readFileSync(".local/site/public/v1/channels.json"));
const open = (p) => JSON.parse(Buffer.from(p, "base64url"));
console.log("--- 要約（署名されている） keyId:", d.digest.keyId);
console.log(open(d.digest.payload));
console.log("--- 本体");
const body = open(d.payload);
console.log({ ...body, channels: body.channels.map((c) => c.id) });
'
```

確かめてほしい点:

- 要約の `type` は `channel-list-digest`、本体の `type` は `channel-list`（[6-3](03-signed-documents.md)）
- 要約の `provider`・`seq`・`issuedAt`・`expiresAt` は本体と同じ値
- 要約の `sha256` と `size` は、本体のバイト列のハッシュと大きさ（[6-4](04-two-tier-keys.md)）
- `expiresAt` は `issuedAt` の 14 日後
- 本体には、チャンネルの一覧（`channels`）と取り下げ（`revoked`）のほかに、素材集の一覧（`collections`）とその取り下げ（`revokedCollections`）もある（API-002 1.2）。この見本では空

## 手順 2. 配る

ターミナル B で:

```sh
cd /c/Dev/apps/sanpo-channel-console
npm run serve -w conformance
```

`http://127.0.0.1:8787` で `.local/site/public` の中身が配られます。このターミナルはそのままにしておきます（止めるときは Ctrl+C）。

## 手順 3. 準拠テストをかける

ターミナル A で（`<リストID>` は手順 1 でメモした値）:

```sh
npm run check -w conformance -- http://127.0.0.1:8787 --allow-local-http --provider <リストID>
```

```
PASS V-01 rootKey gives the provider id — sc1yajr5krpx5u2nb4x45rijsrnvvtizhwl
PASS V-02 keyset is signed by the root key — keyset seq 1, keys k-test
PASS V-03 list digest is signed by a valid signing key and matches the body — seq 1, signed by k-test
PASS V-04 list expires within 14 days and has not expired — expires 2026-10-26T00:10:46.729Z
SKIP V-05 seq has not gone back — no previous seq given
PASS V-06 channel ids are unique and well-formed — 1 channels
PASS V-07 packages and icons match their SHA-256 and size — all files match
PASS V-08 size limits are kept — list ≤ 1MB, packages ≤ 2MB, icons ≤ 100KB
PASS V-09 every URL is HTTPS — 4 URLs
PASS V-15 digest is small enough for KMS to sign — 251 bytes
PASS V-16 publisher changes are well-formed — 0 changes
PASS V-19 collection ids are unique and well-formed, and their packages match — 0 collections
PASS V-20 collections a channel declares are listed, new enough and granted to its publisher — 1 channels
PASS V-21 media and resourcesSize are well-formed — media and resourcesSize are well-formed
PASS V-25 collections’ tags, regions and grants match their packages — 0 collections
```

- `--allow-local-http`: 本来 API-002 は HTTPS を求めますが、手元の確認のために `http://127.0.0.1` を許します。アプリのデバッグビルドが `http://localhost` などを許すのと同じです
- V-05（巻き戻し）が SKIP なのは、「前回の `seq`」を渡していないからです。手順 4-3 で試します
- V-15 の `251 bytes` は要約の大きさです。KMS の上限 4,096 バイトに対して十分小さいことが分かります
- V-19 以降は素材集の確認です（API-002 1.2）。素材集の ID とパッケージ、チャンネルが宣言した素材集がリストにあって使ってよいか（V-20）、チャンネルの `media`・`resourcesSize`（V-21）、素材集のタグ・地域・利用許諾がパッケージと合うか（V-25）。見本には素材集がないので、数は 0 です

## 手順 4. わざと壊す

### 4-1. 違うリストID を渡す（なりすまし）

散策者が登録したリストID と、サーバーが返す鍵が合わない場面です。

```sh
npm run check -w conformance -- http://127.0.0.1:8787 --allow-local-http --provider sc1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

```
FAIL V-01 rootKey gives the provider id — provider_mismatch: rootKey gives sc1yajr5…, expected sc1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
SKIP V-02 keyset is signed by the root key — not reached
…
```

V-01 で `provider_mismatch` になり、その先には進みません（`not reached`）。[6-2](02-ed25519-and-ids.md) の「ID を鍵の指紋にする」が働いています。

> npm がテストの失敗を受けて最後に `npm error …` を何行か出しますが、準拠テストの結果はその上に表示されています。気になる場合は `npx tsx conformance/src/cli.ts …` と直接実行すると、npm のメッセージが出ません。

### 4-2. リストの本体を書き換える（改ざん）

CDN が乗っ取られて、リストのチャンネル名が書き換えられた場面です。[scripts/tamper-list.mjs](scripts/tamper-list.mjs) は、リストの本体だけを書き換え、要約と署名はそのままにします。

```sh
node ../sanpo-tutorial/06-trust/scripts/tamper-list.mjs
npm run check -w conformance -- http://127.0.0.1:8787 --allow-local-http --provider <リストID>
```

```
PASS V-01 rootKey gives the provider id — …
PASS V-02 keyset is signed by the root key — …
FAIL V-03 list digest is signed by a valid signing key and matches the body — bad_signature: body does not match the digest
```

要約の署名は正しいので V-03 の前半は通りますが、本体の SHA-256 が要約と合わず `bad_signature` になります。[6-4](04-two-tier-keys.md) の「要約への署名が本体も守る」が働いています。

元に戻すには公開をやり直します。**リストID が変わる** ので、新しい値をメモし直してください。

```sh
npm run publish:local -w api
```

### 4-3. 前回より新しいリストを受け取っていたことにする（巻き戻し）

アプリが前に `seq` 5 のリストを受け取っていて、今 `seq` 1 のリストを配られた場面です。

```sh
npm run check -w conformance -- http://127.0.0.1:8787 --allow-local-http --provider <新しいリストID> --min-seq 5
```

```
FAIL V-05 seq has not gone back — rollback: seq 1 < 5
```

署名は本物でも、`seq` が戻っているので `rollback` になります（[6-5](05-verify-in-app.md)）。

### 4-4. 自分で試す

余裕があれば、次のことも試して、どの確認観点がどのエラーで落ちるか予想してから実行してみてください。

- 公開されたパッケージ（`.local/site/public/pkg/` の中のファイル）の中身を 1 文字変える
- `.well-known/sanpo-channels` の `keyset.payload` を、[6-3](03-signed-documents.md) の体験のようにデコードして `seq` を書き換え、包み直す

<details>
<summary>予想の答え</summary>

- パッケージを変える: V-07 が FAIL（SHA-256 と大きさがリストと合わない）。アプリなら `hash_mismatch`
- 鍵セットの `seq` を変える: V-02 が FAIL（ルート鍵の署名が合わない、`bad_signature`）。署名の内側を書き換えたからです

</details>

## 手順 5. アプリ側の規則を壊す

最後に、アプリ側（Kotlin）の規則をわざと間違えて、[6-6](06-same-rules.md) のテストベクタが食い違いを見つけることを確かめます。ターミナル B のサーバーは止めてかまいません。

### 5-1. まず通ることを確かめる

```sh
cd /c/Dev/apps/SanpoGuide
./gradlew :station-format:test --tests '*ProviderDocumentsTest*'
```

`BUILD SUCCESSFUL` になります。

### 5-2. リストの期限の上限を 13 日に変える

[ProviderDocuments.kt](../../SanpoGuide/station-format/src/main/kotlin/io/github/duwenji/sanpoguide/station/format/ProviderDocuments.kt) の `companion object` にある次の行を探して、

```kotlin
val LIST_LIFETIME: Duration = Duration.ofDays(14)
```

`14` を `13` に変えて保存し、もう一度テストを流します。

```sh
./gradlew :station-format:test --tests '*ProviderDocumentsTest*'
```

```
8 tests completed, 3 failed
```

落ちたテストは、Gradle が表示するレポート（`station-format/build/reports/tests/test/index.html`）をブラウザで開くと見られます。

| テスト | 失敗の理由 |
|---|---|
| the list checks out and reads every field | `expired: expiresAt is more than 14 days after issuedAt` |
| a 1_2 list reads collections, their revocations and the channels' media | 同じ（素材集を載せた API-002 1.2 のリストも、同じ期限で拒まれる） |
| a list is refused when it is expired, rolled back, altered or … | `expected:<ROLLBACK> but was:<EXPIRED>` |

管理システムが作ったリスト（期限 14 日）を、アプリが「期限が長すぎる」と拒むようになりました。**管理システムは正しいと思って公開しているのに、アプリが受け入れない** という、[6-6](06-same-rules.md) の「食い違い」を、テストが見つけています。

2 つ目の失敗も見てください。巻き戻しを確かめるテストが、期限の確認で先に止まってしまい、期待した `ROLLBACK` ではなく `EXPIRED` になっています。確認の **順番** にも意味がある、ということが分かります。

> エラーメッセージが「13 days」ではなく「14 days」のままなのに気づいたでしょうか。メッセージの文字列は定数とは別に書かれているからです。定数を変えるときは、メッセージやコメントもそろえる必要があります。

### 5-3. 元に戻す

```sh
git checkout -- station-format/src/main/kotlin/io/github/duwenji/sanpoguide/station/format/ProviderDocuments.kt
git status
```

`git status` で変更がないことを確かめてください。

## 片付け

- ターミナル B のサーバーを Ctrl+C で止める
- `.local/` は Git の対象外なので、残しておいてかまいません。消したいときは `rm -rf .local/site`（sanpo-channel-console のフォルダで）

## ふりかえり

| やったこと | 働いた仕組み | 学んだ章 |
|---|---|---|
| 違うリストID で `provider_mismatch` | ID は鍵の指紋。ID が分かれば鍵を確かめられる | [6-2](02-ed25519-and-ids.md) |
| 本体の書き換えで `bad_signature` | 要約は本体のハッシュを含み、要約は署名で守られる | [6-3](03-signed-documents.md)・[6-4](04-two-tier-keys.md) |
| `--min-seq` で `rollback` | 署名だけでは古さが分からない。通し番号で防ぐ | [6-5](05-verify-in-app.md) |
| Kotlin の上限を変えてテストが落ちる | テストベクタが、2 つの言語の食い違いを見つける | [6-6](06-same-rules.md) |

第 6 部はここまでです。ここで出てきた技術のうち、

- `publish` を支える DynamoDB・S3・CloudFront・KMS と CDK は **第 8 部**
- `packages/protocol` のようなパッケージの分け方と、依存を外から渡す作りは **第 7 部**
- `:station-format` をライブラリとして公開する方法は **第 5 部**
- チャンネル提供者の鍵をブラウザの中で作る方法は **[9-3](../09-console/03-keys-in-browser.md)**

で、くわしく扱います。

---

前: [6-6 2 つの言語で同じ規則を守る](06-same-rules.md) ／ 次: [7-1 TypeScript の文法](../07-typescript/01-typescript-syntax.md)
