# 6-2 Ed25519 と「鍵の指紋」の ID

[目次](../README.md) ＞ 第 6 部 ＞ 6-2

## この章で学ぶこと

- このシステムが使う署名の方式 Ed25519 の特徴と、選ばれた理由
- 鍵や署名を文字にする方法（base64url と base32）
- 公開鍵から作る ID（リストID `sc1…`、アカウントID `sg1…`）の仕組みと、その利点
- 同じ計算を TypeScript と Kotlin で書くとどうなるか

## Ed25519 とは

> Node.js・ブラウザ・Java での最小の使い方は [技術カード: 公開鍵暗号と Ed25519](../ref/ed25519.md) にあります。

**Ed25519** は、公開鍵で署名を確かめる方式の 1 つです（規格は RFC 8032）。このシステムでは、すべての署名に Ed25519 を使います。

| 特徴 | 値・内容 | このシステムでうれしい点 |
|---|---|---|
| 公開鍵の大きさ | 32 バイト | QR コードや ID に収まる |
| 署名の大きさ | 64 バイト | 文書が大きくならない |
| 決定的 | 同じ鍵・同じデータなら、署名はいつも同じ | テストの期待値を固定できる（[6-6](06-same-rules.md)） |
| 使える場所 | Node.js、Java 15 以上、Android 13 以上、ブラウザ（WebCrypto）、AWS KMS、Tink | 管理システム・画面・アプリ・KMS のどこでも同じ方式を使える |

最後の行が大事です。散策ガイドの署名は、**KMS が署名し、Node.js が確かめ、Android が確かめ、ブラウザが署名する** という具合に、いろいろな場所を行き来します。どこでも扱える方式でなければなりません。

ただし Android は 13 になるまで Ed25519 を標準では持っていません。散策ガイドは Android 8 から動かしたいので、Google の暗号ライブラリ **Tink** を使います（[6-5](05-verify-in-app.md)）。

## 体験: 鍵を作って署名する

管理システムの `packages/protocol` を使って、鍵を作り、署名し、確かめてみましょう。スクリプトは [scripts/try-ed25519.ts](scripts/try-ed25519.ts) にあります。

```sh
cd /c/Dev/apps/michizure-console
mkdir -p .local
cp ../sanpo-tutorial/06-trust/scripts/try-ed25519.ts .local/
npx tsx .local/try-ed25519.ts
```

`.local/` は Git の対象外（`.gitignore` に入っている）なので、ここに置いたファイルがリポジトリに混ざる心配はありません。`tsx` は、TypeScript のファイルを事前のビルドなしで直接実行する道具です。

出力の例（鍵は毎回新しく作るので、値は毎回変わります）:

```
公開鍵（base64url）: impvHSb6VYtjGviYyG-5Kwo814qhkFz81g7EJWLJEpo (32 バイト)
リストID として : sc1fudx6pajz2ozvj4h7ylpvb3imjx6fteb
アカウントID として: sg1fudx6pajz2ozvj4h7ylpvb3imjx6fteb
署名: UHckgtIuI218fhWpSniWXM7rDPlXSRCdINX6LuhcbSf9rSBmGB7mlFU95GjxRklcUR03qYDuZyI4yUBcmPfmDg (64 バイト)
確かめる: true
1 文字変えて確かめる: false
もう一度署名すると同じ？: true
```

- 公開鍵は 32 バイト、署名は 64 バイト
- 1 文字変えたデータでは、署名が確かめられない
- 同じデータにもう一度署名すると、まったく同じ署名になる（決定的）

## バイト列を文字にする: base64url

> base64url と base32 の仕組み、ライブラリごとのデコードの寛容さの違いは [技術カード: base64url と base32](../ref/base64url-base32.md) にあります。

鍵や署名は **バイト列**（0〜255 の数の並び）です。JSON や URL に入れるには文字にする必要があります。このシステムは **base64url（パディングなし）** を使います。

base64 は 3 バイトを 4 文字（英大小文字・数字・2 つの記号）で表す方法です。普通の base64 は記号に `+` と `/` を使い、末尾を `=` で埋めますが、これらは URL の中で特別な意味を持ちます。base64url は記号を `-` と `_` に替え、`=` を付けません。だから URL や QR コードにそのまま入れられます。

`packages/protocol` の [encoding.ts](../../michizure-console/packages/protocol/src/encoding.ts) にある `b64url` を見てみましょう。

```ts
export const b64url = {
  encode: (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url'),
  /** Rejects anything that isn't strict base64url, rather than decoding it loosely. */
  decode: (text: string): Uint8Array => {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('not base64url');
    return new Uint8Array(Buffer.from(text, 'base64url'));
  },
};
```

`decode` は、変換の前に **正規表現で文字の種類を確かめて** います。Node.js の `Buffer.from(…, 'base64url')` は寛容で、知らない文字を黙って読み飛ばしてしまいます。署名を確かめるコードでは「なんとなく読めた」は危険なので、決まった形以外は拒みます。セキュリティに関わるコードでは、**入力は厳しく確かめる** のが基本です。

Kotlin 側の [PublisherSignature.kt](../../SanpoGuide/platform/core-format/src/main/kotlin/io/github/duwenji/michizure/core/format/PublisherSignature.kt) にある `decodeBase64Url` も、同じように正規表現で確かめてから変換します。

```kotlin
private val BASE64URL = Regex("[A-Za-z0-9_-]*")

/** Strict base64url (no padding, nothing else), or null. */
internal fun decodeBase64Url(text: String): ByteArray? =
    if (BASE64URL.matches(text)) runCatching { Base64.getUrlDecoder().decode(text) }.getOrNull() else null
```

> **Kotlin の読み方メモ**
> - `fun 名前(引数: 型): 戻り値の型 = 式` は、本体が 1 つの式だけの関数の書き方です
> - `ByteArray?` の `?` は「null かもしれない」という意味。Kotlin は null になりうる型とならない型を区別します
> - `if … else …` は Kotlin では値を返す **式** です
> - `runCatching { … }.getOrNull()` は「中で例外が起きたら null を返す」

## 鍵の指紋を ID にする

### リストID とアカウントID

このシステムには 2 種類の ID があります。

| ID | 例 | 何の ID か | 何の鍵から作るか |
|---|---|---|---|
| リストID | `sc1fudx6pajz2ozvj4h7ylpvb3imjx6fteb` | 承認済みチャンネル・リスト（の発行元） | ルート鍵の公開鍵（[6-4](04-two-tier-keys.md)） |
| アカウントID | `sg1fudx6pajz2ozvj4h7ylpvb3imjx6fteb` | チャンネルを作るチャンネル提供者 | チャンネル提供者の公開鍵 |

作り方はどちらも同じです（API-002 P-2）。

```
ID = 接頭辞 + base32( SHA-256(公開鍵 32 バイト) ) の先頭 32 文字
```

[encoding.ts](../../michizure-console/packages/protocol/src/encoding.ts) では次のように書かれています。

```ts
/** An id that is also a key fingerprint: prefix + base32(SHA-256(public key)), first 32 characters. */
function fingerprintId(prefix: string, publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new Error('an Ed25519 public key is 32 bytes');
  return prefix + base32(sha256(publicKey)).slice(0, 32);
}

export const providerId = (rootPublicKey: Uint8Array): string => fingerprintId('sc1', rootPublicKey);
export const accountId = (publicKey: Uint8Array): string => fingerprintId('sg1', publicKey);
```

さっきの体験で、同じ公開鍵から作ったリストID とアカウントID が、接頭辞以外まったく同じだったのはこのためです。

### なぜ ID を鍵の指紋にするのか

普通のシステムでは、ID はデータベースが振る番号や、利用者が決める名前です。ここで ID を「公開鍵のハッシュ」にしているのには、はっきりした理由があります。

**ID を知っていれば、その ID の本物の鍵かどうかを、だれにも頼らず確かめられる** からです。

アプリが新しいリストを足す場面を考えます。

1. 散策者は、リストの URL とリストID を、**別の経路**（リストの公式サイト、QR コードなど）で手に入れる
2. アプリは URL から `/.well-known/sanpo-channels` を取ってくる。中には公開鍵（`rootKey`）が入っている
3. アプリは、受け取った公開鍵からリストID を計算し、散策者が入力した ID と比べる
4. 一致すれば、その公開鍵は本物。一致しなければ `provider_mismatch` で拒む

サーバーが乗っ取られて偽の公開鍵を返しても、ID と一致する公開鍵を作ることは事実上できません（ハッシュの性質）。だから **ID さえ正しく伝われば、鍵も正しく伝わります**。

API-002 は、ID を **URL から自動で取ってはいけない** と決めています（「設定画面のリスト」）。サーバーが返す ID をそのまま信じたら、照合の意味がなくなるからです。

### なぜ base32 で、なぜ 32 文字か

- **base32** は 5 ビットずつ、英小文字 26 字と数字 `2`〜`7` の 32 種類で表します。大文字と小文字の区別がなく、`0` と `O`、`1` と `l` のような紛らわしい組み合わせもありません。人が読み上げたり、手で入力したりする ID に向いています
- **32 文字** は 32 × 5 = 160 ビットです。SHA-256 の 256 ビットのうち 160 ビットを使います。同じ ID になる別の鍵を探すには、およそ 2 の 160 乗回の試行が要り、現実には不可能です
- **接頭辞の `sc1`・`sg1`** は、ID の種類と形式の版を示します。種類の違う ID を取り違えても、接頭辞で気づけます

base32 の変換は [encoding.ts](../../michizure-console/packages/protocol/src/encoding.ts) の `base32` にあり、Kotlin 側の [PublisherSignature.kt](../../SanpoGuide/platform/core-format/src/main/kotlin/io/github/duwenji/michizure/core/format/PublisherSignature.kt) の `base32` とほとんど同じ形をしています。2 つを並べて読み比べてみてください。ビットを 8 ずつためて 5 ずつ取り出す、という同じ手順が見えるはずです。

## 生の鍵と DER: 環境ごとの鍵の形

最後に、少し細かい話です。コードを読むと、次のような定数が両方のリポジトリに出てきます。

```ts
// DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows it.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
```

API-002 では、公開鍵を **生の 32 バイト** で扱います。ところが Node.js の `crypto` や Java の `KeyFactory` は、公開鍵を **DER（SubjectPublicKeyInfo）** という、鍵の種類などの情報を前に付けた形で受け取ります。Ed25519 の場合、その「前に付ける情報」はいつも同じ 12 バイトなので、生の鍵の前にくっつければ DER になります。

- TypeScript: [ed25519.ts](../../michizure-console/packages/protocol/src/ed25519.ts) の `publicKeyFromRaw` と `rawPublicKey`
- Kotlin: [PublisherSignature.kt](../../SanpoGuide/platform/core-format/src/main/kotlin/io/github/duwenji/michizure/core/format/PublisherSignature.kt) の `JcaEd25519`

Tink（アプリ）やブラウザの WebCrypto は生の 32 バイトをそのまま受け取れるので、この変換は要りません。**同じ鍵でも、ライブラリによって受け取る形が違う** ことは、暗号のコードでよくつまずく点です。

## つまずきやすいところ

- **base64 と base64url を混ぜない**: 見た目はよく似ていますが、`+`/`-`、`/`/`_` が違います。普通の base64 でデコードすると、`-` や `_` を含む値で失敗したり、別の値になったりします
- **ID は鍵が変われば変わる**: 鍵をなくして作り直すと、ID も変わります。つまり **別人になる** ということです。ルート鍵を大事に保管しなければならない理由がここにあります（[6-4](04-two-tier-keys.md)）

## 確認問題

<details>
<summary>問 1. リストのサーバーが乗っ取られ、<code>/.well-known/sanpo-channels</code> の <code>rootKey</code> と <code>provider</code> が、攻撃者の鍵とその鍵から計算した ID に書き換えられました。アプリはどうやって気づきますか。</summary>

アプリは `rootKey` から計算した ID を、文書の `provider` だけでなく、**散策者が登録したリストID** とも比べます（`ProviderDocuments.discovery` の `expectedProvider`）。攻撃者の鍵から作った ID は登録した ID と一致しないので、`provider_mismatch` で拒みます。

</details>

<details>
<summary>問 2. Ed25519 の署名が「決定的」であることは、テストでどう役に立ちますか。</summary>

固定した鍵で同じ文書に署名すれば、いつも同じ署名になります。そのため、署名つきの文書をファイルに保存しておき、別の言語のテストで「この文書が正しく確かめられるか」を確かめる、という使い方ができます。[6-6](06-same-rules.md) のテストベクタがこれです。

</details>

<details>
<summary>問 3. ID に base32 を使うのはなぜですか。</summary>

大文字と小文字の区別がなく、紛らわしい文字（`0`/`O`、`1`/`l`）も使わないので、人が読み上げたり手で入力したりしやすいからです。

</details>

---

前: [6-1 なぜ署名が要るのか](01-why-signatures.md) ／ 次: [6-3 署名つき文書の形](03-signed-documents.md)
