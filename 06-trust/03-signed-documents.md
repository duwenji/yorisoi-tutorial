# 6-3 署名つき文書の形

[目次](../README.md) ＞ 第 6 部 ＞ 6-3

## この章で学ぶこと

- このシステムの署名つき文書の形（`payload`・`keyId`・`sig`）
- JSON そのものではなく **バイト列** に署名する理由
- 文書に `type` を入れて、種類の取り違えを防ぐ理由
- 署名して、確かめるコード（TypeScript と Kotlin）

## 署名つき文書の形

API-002 の署名つき文書は、どれも次の形をしています（決定事項 P-3）。

```json
{
  "payload": "<base64url(署名する JSON のバイト列)>",
  "keyId": "<署名した鍵の ID>",
  "sig": "<base64url(payload のバイト列への Ed25519 署名)>"
}
```

| 項目 | 中身 |
|---|---|
| `payload` | 本当に伝えたい JSON を、**UTF-8 のバイト列にして base64url にしたもの** |
| `keyId` | どの鍵で署名したか。確かめる側は、この ID で公開鍵を選ぶ |
| `sig` | `payload` をデコードしたバイト列への署名（64 バイト）を base64url にしたもの |

中身の JSON を直接置かず、わざわざ base64url に包んでいるのが特徴です。たとえば鍵セットはこうなります。

```json
{
  "payload": "eyJ0eXBlIjoia2V5c2V0IiwicHJvdmlkZXIiOiJzYzFham5pdjNo…",
  "keyId": "sc1ajniv3h7pigusni2qmvzlacuhghuufdh",
  "sig": "sfx6JukLEqjhL8jU7bY_nHq4ufCZpwWv7t3D5v6DpwR8-TsXzV7wpvxdWypP6V36PnTX3ZDR7LuqwYGzlN8vAQ"
}
```

`payload` をデコードすると、中身の JSON が出てきます。

```json
{"type":"keyset","provider":"sc1ajniv3h7pigusni2qmvzlacuhghuufdh","seq":1,"issuedAt":"2026-10-04T09:09:44.224Z","keys":[…],"revokedKeys":[]}
```

## なぜバイト列に署名するのか

署名は **バイト列** に対して行うものです。JSON のような構造のあるデータに署名するには、まずバイト列にしなければなりません。ここに落とし穴があります。

**同じ意味の JSON でも、バイト列は 1 通りではありません。**

```json
{"seq":1,"type":"keyset"}
{"type":"keyset","seq":1}
{ "type": "keyset", "seq": 1 }
```

この 3 つは JSON としては同じ意味ですが、バイト列はすべて違います。もし「JSON の中身」に署名したつもりでも、

1. 署名する側が JSON をバイト列にして署名する
2. 送る途中や受け取ったライブラリが、項目の順番や空白を変える
3. 確かめる側が JSON をバイト列に戻すと、署名したときと違うバイト列になり、署名が合わない

ということが起こります。これを避ける方法の 1 つは、「JSON をバイト列にする方法を 1 つに決める」（**正規化**）ことですが、すべての言語・ライブラリで同じ正規化を正しく実装するのは意外に難しく、食い違いが脆弱性の原因になったこともあります。

このシステムは別の方法を取りました。**署名したバイト列そのものを、base64url に包んで送る** のです。確かめる側は、

1. `payload` をデコードして、署名されたバイト列そのものを取り出す
2. そのバイト列で署名を確かめる
3. 確かめられたら、**そのバイト列を** JSON として読む

という順に処理します。JSON をバイト列に戻す手順がないので、正規化の問題が起きません。API-002 は「JSON の正規化が要らない」と書いています。

> **順番が大事**: 「JSON として読んでから確かめる」のではなく「確かめてから JSON として読む」。確かめていないデータを先に解釈すると、解釈の違いを突かれるおそれがあります。

## 署名する側のコード

[signed.ts](../../sanpo-channel-console/packages/protocol/src/signed.ts) を見ます。

```ts
/** Signs bytes with one Ed25519 key: a root key on an offline machine, or a signing key in KMS. */
export interface Signer {
  readonly keyId: string;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

/** The JSON bytes a document is signed over; signing the bytes avoids canonicalizing JSON (P-3). */
export function payloadBytes(content: object): Uint8Array {
  return utf8.encode(JSON.stringify(content));
}

export async function signDocument(content: object, signer: Signer): Promise<SignedDocument> {
  const bytes = payloadBytes(content);
  return { payload: b64url.encode(bytes), keyId: signer.keyId, sig: b64url.encode(await signer.sign(bytes)) };
}
```

`signDocument` は、JSON をバイト列にし（`payloadBytes`）、そのバイト列に署名し、両方を base64url にして返します。**署名したのと同じ `bytes` を `payload` に入れている** ところが要点です。

### `Signer` という差し替え口

署名を実際に行うのは `Signer` です。`Signer` は「`keyId` を持ち、バイト列を受け取って署名を返す」ものなら何でもよい、という **約束（インターフェース）** です。

| 実装 | どこで使うか | 秘密鍵の場所 |
|---|---|---|
| `localSigner`（[signed.ts](../../sanpo-channel-console/packages/protocol/src/signed.ts)） | ルート鍵の CLI、テスト、手元での公開 | メモリの中 |
| KMS の Signer（[api/src/publish/aws.ts](../../sanpo-channel-console/api/src/publish/aws.ts) の末尾） | AWS の上での公開 | KMS の中（取り出せない） |

`signDocument` はどちらの実装でも同じように動きます。だから、手元では `localSigner` で、本番では KMS で、同じコードを使えます。[0-3](../00-overview/03-setup.md) で「AWS なしで公開できる」と書いたのは、こうした差し替え口があちこちにあるからです。

`sign` が `Promise` を返す（`async`）のは、KMS での署名がネットワーク越しの呼び出しで、時間がかかるからです。

> **TypeScript の読み方メモ**
> - `interface` は「こういう項目を持つもの」という型の約束です。Kotlin の `interface` とほぼ同じです
> - `Promise<Uint8Array>` は「あとで `Uint8Array` が手に入る」という値。`await` を付けると、手に入るまで待ってから値を取り出します
> - `Uint8Array` はバイト列の型です。Kotlin の `ByteArray` に当たります

## `type`: 文書の取り違えを防ぐ

署名つきの文書は 4 種類あります。

| `type` | 文書 | だれが署名するか |
|---|---|---|
| `keyset` | 鍵セット | ルート鍵 |
| `channel-list` | 承認済みチャンネル・リストの本体 | （本体には直接署名しない。[6-4](04-two-tier-keys.md)） |
| `channel-list-digest` | リストの要約 | 署名鍵 |
| `test-ticket` | 試用チケット | 署名鍵 |

`channel-list-digest` と `test-ticket` は、**同じ署名鍵** で署名されます。もし中身に種類の印がなかったら、攻撃者は「本物の試用チケット」を「リストの要約」として差し出すかもしれません。署名は本物なので、確かめは通ってしまいます。項目の名前がたまたま重なれば、意図しない意味に読まれるおそれがあります。

そこで、**署名されるバイト列の中に `type` を必ず入れ**、確かめる側は「期待した `type` か」を署名と一緒に確かめます。`type` は署名の内側にあるので、書き換えれば署名が合わなくなります。

確かめる側の TypeScript（[verify.ts](../../sanpo-channel-console/packages/protocol/src/verify.ts) の `openSigned`）:

```ts
/** Checks a signature and the payload's `type`, which keeps a document from passing for another kind (P-3). */
function openSigned(doc: SignedDocument, publicKey: Uint8Array, type: string, what: string) {
  const bytes = decodeBytes(doc.payload, `${what}.payload`);
  if (!verifyEd25519(publicKey, bytes, decodeBytes(doc.sig, `${what}.sig`))) fail('bad_signature', `${what}: signature does not verify`);
  const json = parseJson(bytes, `${what}.payload`);
  if (json.type !== type) fail('bad_signature', `${what}: type is ${String(json.type)}, not ${type}`);
  return { json, bytes };
}
```

同じことをする Kotlin（[ProviderDocuments.kt](../../SanpoGuide/station-format/src/main/kotlin/io/github/duwenji/sanpoguide/station/format/ProviderDocuments.kt) の `open`）:

```kotlin
/** Checks a signature and the payload's `type`, which keeps one kind of document from passing for another (P-3). */
private fun open(signed: JSONObject, publicKey: ByteArray, type: String, what: String): Opened {
    val payload = bytes(signed.getString("payload"), "$what.payload")
    if (!ed25519.verify(publicKey, payload, bytes(signed.getString("sig"), "$what.sig"))) fail(ProviderError.BAD_SIGNATURE, "$what: the signature does not verify")
    val json = JSONObject(String(payload, Charsets.UTF_8))
    if (json.optString("type") != type) fail(ProviderError.BAD_SIGNATURE, "$what: type is ${json.opt("type")}, not $type")
    return Opened(json)
}
```

2 つの言語で、手順がまったく同じであることに注目してください。

1. `payload` をデコードしてバイト列にする
2. そのバイト列で署名を確かめる（合わなければ `bad_signature`）
3. 確かめてから JSON として読む
4. `type` を確かめる（違えば `bad_signature`）

`type` が違うときのエラーも `bad_signature` です。API-002 のエラー表で「署名が合わない、`type` が違う、`payload` が読めない」をまとめて `bad_signature` にしているためです。

> **Kotlin の読み方メモ**
> - `"$what.payload"` は文字列の中に変数を埋め込む書き方（テンプレート）。`${…}` で式も埋め込めます
> - `private fun` はこのクラスの中だけで使える関数

## 知らない項目は無視する

API-002 には「知らない項目は無視する。項目の追加は互換性のある変更として扱う」とあります。将来、リストの発行元が文書に新しい項目を足しても、古いアプリはそれを無視して動き続けられます。

これは **署名つき文書の形だからこそ安全に** できることです。足された項目も署名の内側にあるので、途中で足されたものではなく、リストの発行元が足したものだと分かります。

## 体験: 文書の中身をのぞく

[0-3](../00-overview/03-setup.md) で `npm run publish:local -w api` を実行していれば、手元に公開ファイルがあります。鍵セットの `payload` をデコードしてみましょう。

```sh
cd /c/Dev/apps/sanpo-channel-console
node -e '
const d = JSON.parse(require("fs").readFileSync(".local/site/public/.well-known/sanpo-channels"));
console.log("keyId:", d.keyset.keyId);
console.log(JSON.parse(Buffer.from(d.keyset.payload, "base64url")));
'
```

`type: 'keyset'` や、使ってよい署名鍵の一覧（`keys`）が見えるはずです。`keyId` がリストID と同じなのは、鍵セットはルート鍵で署名され、ルート鍵の ID はリストID だからです（API-002「署名した鍵の ID。ルート鍵ならリストID」）。

## つまずきやすいところ

- **`payload` を JSON に直してから署名を確かめない**: 必ずデコードしたバイト列のまま確かめます
- **`type` の確認を忘れない**: 署名が合っても、期待した種類の文書とは限りません

## 確認問題

<details>
<summary>問 1. あるリストの発行元が、JSON の項目の順番を毎回ランダムに並べて文書を作っています。アプリで署名の確かめが失敗することはありますか。</summary>

ありません。署名されたバイト列そのものが `payload` に入っていて、アプリはそのバイト列で確かめるからです。順番がどうであれ、署名したときのバイト列と確かめるときのバイト列は同じです。

</details>

<details>
<summary>問 2. 本物の試用チケット（署名鍵で署名されている）を、承認済みチャンネル・リストの <code>digest</code> の位置に入れて配りました。アプリはどうしますか。</summary>

署名は合いますが、`payload` の `type` が `test-ticket` で、期待した `channel-list-digest` ではないので、`bad_signature` で拒みます。

</details>

<details>
<summary>問 3. <code>Signer</code> をインターフェースにしておくと、どんな良いことがありますか。</summary>

署名を実際に行う方法（メモリの中の鍵、KMS）を差し替えられます。署名の文書を作るコードは 1 つのままで、手元・テストではメモリの鍵、AWS の上では KMS を使えます。

</details>

---

前: [6-2 Ed25519 と「鍵の指紋」の ID](02-ed25519-and-ids.md) ／ 次: [6-4 鍵を 2 段にする](04-two-tier-keys.md)
