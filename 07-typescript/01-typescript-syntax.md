# 7-1 TypeScript の文法

[目次](../README.md) ＞ 第 7 部 ＞ 7-1

## この章で学ぶこと

- 管理システムのコードを読むのに必要な TypeScript の文法
- Kotlin（第 1〜6 部）と比べて、何が同じで何が違うか
- 「取りうる値を型で絞る」書き方（ユニオン型、判別できるユニオン）
- 中身の分からない値（`unknown`）を、確かめてから使う書き方
- `async`/`await` と `Promise`

第 6 部で TypeScript のコードを少し読みました（`packages/protocol`）。ここでは文法を整理します。Kotlin を学んだ人なら、多くはすぐに読めるはずです。

## TypeScript とは

**TypeScript** は、JavaScript に **型** を足した言語です。Microsoft が作っています。

- 書いたコードは、型を取り除いて JavaScript として動く。だから Node.js（サーバー）でも、ブラウザ（画面）でも動く
- 型は **コンパイルのときだけ** 確かめられ、実行するときには消えている
- 管理システムは、API（Lambda）・画面（React）・ツール・インフラの定義（CDK）を、すべて TypeScript で書いている

管理システムは TypeScript 7 を使っています（`npx tsc -v` で `Version 7.0.2`）。

## 変数と関数

```ts
const name = '鎌倉歴史散歩';   // 再代入できない（Kotlin の val）
let count = 0;                  // 再代入できる（Kotlin の var）
count += 1;

function lengthLabel(meters: number): string {
  return `${meters}m`;
}

const lengthLabel2 = (meters: number): string => `${meters}m`;   // アロー関数
```

| | TypeScript | Kotlin |
|---|---|---|
| 変わらない変数 | `const` | `val` |
| 変わる変数 | `let` | `var` |
| 型の書き方 | `name: string`（後ろに） | `name: String`（後ろに） |
| 文字列の埋め込み | `` `${a}` ``（バッククォート） | `"$a"`・`"${a}"` |
| 関数 | `function f(x: number): string`、`(x: number) => …` | `fun f(x: Int): String`、`{ x -> … }` |
| 数の型 | `number`（整数も小数も 1 つ） | `Int`・`Long`・`Double`… |

`var` という古い書き方もありますが、管理システムでは使っていません。

## 型: interface と type

[packages/protocol/src/types.ts](../../yorisoi-console/packages/protocol/src/types.ts) から:

```ts
/** API-002: the signed document form (P-3). */
export interface SignedDocument {
  payload: string;
  keyId: string;
  sig: string;
}

export interface ChannelEntry {
  id: string;
  version: number;
  publisher: string;
  publisherChange?: { from: string; at: string; reason: string };
  description?: string;
  // …
}
```

- `interface` は「こういう項目を持つもの」という型の約束。Kotlin のデータクラスに似ているが、**型だけ** で、実行するときには何も残らない
- `?:` の付いた項目（`description?: string`）は、あってもなくてもよい。Kotlin の `String?` に近い
- `type 名前 = …` でも型に名前を付けられる。下のユニオン型などは `type` で書く

### 構造で比べる

TypeScript の型は、**名前ではなく形（構造）で** 比べられます。

```ts
const doc = { payload: 'eyJ…', keyId: 'k-test', sig: 'AbC…' };
verify(doc);   // doc は SignedDocument と書いていないが、同じ形なので渡せる
```

Kotlin では、同じ項目を持っていても、宣言したクラスが違えば別の型でした。TypeScript では、必要な項目がそろっていれば同じ型として扱われます。JSON のように、形だけがあるデータを扱うのに向いた考え方です。

## 取りうる値を絞る: ユニオン型

[api/src/console/http.ts](../../yorisoi-console/api/src/console/http.ts) から:

```ts
export interface Caller {
  sub: string;
  roles: ('operator' | 'publisher')[];
}
```

`'operator' | 'publisher'` は「`'operator'` か `'publisher'` のどちらかの文字列」という型です。これを **ユニオン型** と呼びます。`roles` に `'admin'` を入れようとすると、コンパイルエラーになります。Kotlin なら enum で書くところを、TypeScript は文字列のまま型で絞れます。

### 判別できるユニオン

[packages/protocol/src/verify.ts](../../yorisoi-console/packages/protocol/src/verify.ts) のエラーコードは、ユニオン型で書かれています。

```ts
export type ErrorCode =
  | 'provider_mismatch'
  | 'unsupported_version'
  | 'bad_signature'
  // …
  | 'bad_document';
```

さらに、「共通の項目の値で、どの形かが分かる」ユニオンを **判別できるユニオン** と呼びます。Kotlin の sealed（[1-1](../01-kotlin-android/01-kotlin-syntax.md)）に当たるものです。

```ts
type Check =
  | { ok: true; channelId: string }
  | { ok: false; code: 'bad_value' | 'forbidden_text'; detail: string };

function describe(check: Check): string {
  // check.ok を確かめると、その枝の中では型が絞られる
  if (check.ok) return `合格: ${check.channelId}`;
  return `不合格（${check.code}）: ${check.detail}`;
}
```

`if (check.ok)` の中では `check` は「合格」の形なので `channelId` を読めます。外では「不合格」の形なので `code` と `detail` を読めます。不合格の枝で `check.channelId` を読もうとすると、コンパイルエラーになります（ハンズオンで試します）。

## null と undefined

JavaScript には「値がない」が 2 種類あります。

| 値 | 意味 |
|---|---|
| `undefined` | まだ決まっていない、項目そのものがない |
| `null` | 「ない」とはっきり入れた |

管理システムの `tsconfig.base.json` は `"strict": true` で、Kotlin と同じように、null や undefined になりうる型とならない型を区別します。

| やりたいこと | TypeScript | Kotlin |
|---|---|---|
| null なら代わりの値 | `a ?? b` | `a ?: b` |
| null なら全体を undefined に | `a?.b` | `a?.b` |
| 「null ではない」と断言 | `a!` | `a!!` |

さらに `"noUncheckedIndexedAccess": true` も指定しています。配列や表から取り出した値（`list[0]`、`record['x']`）を「ないかもしれない」（`| undefined`）として扱う設定です。[router.ts](../../yorisoi-console/api/src/console/router.ts) の `match` に `want[i]!` のような `!` があるのは、そのためです。

```ts
for (let i = 0; i < want.length; i++) {
  const w = want[i]!;   // 範囲の中なので、必ずある
  // …
}
```

## 中身の分からない値: unknown

外から来たデータ（HTTP の要求の本文、`JSON.parse` の結果）は、どんな形か分かりません。TypeScript では、そういう値を **`unknown`** として受け取り、**確かめてから** 使います。

[api/src/console/http.ts](../../yorisoi-console/api/src/console/http.ts):

```ts
export interface Request {
  method: string;
  path: string;
  body: unknown;      // 中身はまだ分からない
  // …
}

export function object(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : fail('invalid_request', 'the body must be a JSON object');
}
```

- `unknown` の値は、そのままでは項目を読めない（コンパイルエラー）
- `typeof body === 'object'` などで確かめると、その先では型が絞られる
- `as Record<string, unknown>` は「この型だとみなす」という指定（型アサーション）。確かめたあとでだけ使う

`any` という「何でもあり」の型もありますが、型の確認がすべて外れてしまうので、管理システムのソース（`api/src`・`web/src`・`packages/protocol/src` など）には 1 つもありません。**外から来たものは `unknown` で受け、確かめてから使う** のが、安全な TypeScript の基本です。第 6 部の `verifyDiscovery(value: unknown, …)` も、この形でした（[6-5](../06-trust/05-verify-in-app.md)）。

## 失敗を投げる関数: never

```ts
export const fail = (code: ProblemCode, detail: string, errors: { path: string; message: string }[] = []): never => {
  throw new ApiError(code, detail, errors);
};
```

戻り値の型 `never` は「この関数は決して普通に戻らない（必ず例外を投げる）」という意味です。Kotlin の `Nothing` に当たります。だから `?? fail(…)` のように書くと、`fail` の側は型の計算から外れ、左の値の型だけが残ります。

```ts
const key = keyset.keys.find((k) => k.keyId === digestDoc.keyId) ?? fail('unknown_key', `${digestDoc.keyId} is not in the keyset`);
// key の型は SigningKeyEntry（undefined ではない）
```

[6-5](../06-trust/05-verify-in-app.md) で読んだ Kotlin の `?: fail(…)` と、まったく同じ書き方です。

## クラス

```ts
/** An error the API reports as RFC 9457 Problem Details with a `code` (API-001 C-2). */
export class ApiError extends Error {
  constructor(
    readonly code: ProblemCode,
    detail: string,
    readonly errors: { path: string; message: string }[] = [],
  ) {
    super(detail);
  }

  get status() {
    return STATUS[this.code];
  }
}
```

- `constructor(readonly code: …)` は、引数を受け取ると同時に、読み取りだけの項目にする書き方。Kotlin の `class ApiError(val code: …)` に当たる
- `get status()` は、項目のように読める関数（ゲッター）。Kotlin の `val status get() = …` に当たる
- `extends Error` は継承

## モジュール: import と export

```ts
import { b64url, providerId, sha256Hex, utf8 } from './encoding.js';
import type { ChannelList, Keyset } from './types.js';

export function verifyChannelList(…) { … }
```

- 1 つのファイルが 1 つの **モジュール**。`export` したものだけが、ほかのファイルから `import` できる
- `import type` は型だけを取り込む（実行するときには消える）。`tsconfig` の `"verbatimModuleSyntax": true` で、型だけの取り込みには `import type` と書くよう決めている
- 中身は `.ts` なのに `'./encoding.js'` と書くのは、Node.js の ES モジュールの決まり（実行するときのファイル名で書く）です。最初は戸惑うところですが、そういうものと覚えてください
- `'@yorisoi-console/protocol'` のような名前は、同じリポジトリのほかのパッケージ（[7-2](02-workspaces.md)）

## async と await

[3-1](../03-walk/01-coroutines.md) で学んだ Kotlin の `suspend` に当たるのが、TypeScript の `async`/`await` です。

```ts
/** Signs bytes with one Ed25519 key: a root key on an offline machine, or a signing key in KMS. */
export interface Signer {
  readonly keyId: string;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

export async function signDocument(content: object, signer: Signer): Promise<SignedDocument> {
  const bytes = payloadBytes(content);
  return { payload: b64url.encode(bytes), keyId: signer.keyId, sig: b64url.encode(await signer.sign(bytes)) };
}
```

| | TypeScript | Kotlin |
|---|---|---|
| 待つことがある関数 | `async function f(): Promise<T>` | `suspend fun f(): T` |
| 結果を待つ | `await f()` | `f()`（そのまま呼ぶ） |
| 同時に始めて全部待つ | `await Promise.all([a(), b()])` | `async { a() }` と `async { b() }` を `await` |

大きな違いは、TypeScript では呼ぶ側に **`await` が要る** ことです。`await` を忘れると、結果ではなく `Promise`（「あとで結果が入る入れ物」）を受け取ってしまいます。

[publisher.ts](../../yorisoi-console/api/src/publish/publisher.ts) の `publish` には、同時に待つ例があります。

```ts
const since = new Date(now.getTime() - (config.revokedDays ?? 7) * DAY);
const [listed, collections, revoked, revokedCollections] = await Promise.all([
  store.listedChannels(now),
  store.listedCollections(now),
  store.revocations(since),
  store.collectionRevocations(since),
]);
```

リストに載せるチャンネル・素材集と、それぞれの取り下げの 4 つを、データベースに同時に問い合わせています。1 つずつ `await` すると 4 回分待ちますが、`Promise.all` なら一番遅いもの 1 回分で済みます。結果は配列で返るので、分割代入（`const [a, b, …] =`）で受け取ります。

JavaScript は、基本的に 1 本のスレッドで動きます。`await` で待っている間、そのスレッドはほかの仕事をします。Kotlin のコルーチンのような「ディスパッチャ」はなく、通信やファイルの読み書きは、最初から待つ形（`Promise` を返す形）で作られています。

## ハンズオン: 型で止まることを確かめる

### 1. 練習用のファイルを動かす

[scripts/ts-practice.ts](scripts/ts-practice.ts) を、管理システムの `.local/`（Git の対象外、[6-2](../06-trust/02-ed25519-and-ids.md)）にコピーして動かします。

```sh
cd /c/Dev/apps/yorisoi-console
mkdir -p .local
cp ../yorisoi-tutorial/07-typescript/scripts/ts-practice.ts .local/
npx tsx .local/ts-practice.ts
```

```
（名前なし）
true
合格: kamakura-history
不合格（forbidden_text）: URL がある
鎌倉歴史散歩
待った時間: 213ms
```

この章の文法（ユニオン型、判別できるユニオン、`unknown`、`??`、`async`/`await`、`Promise.all`）が、1 つのファイルに入っています。開いて読んでみてください。

`tsx` は、型を確かめずに、型を取り除いてすぐに実行する道具です。**`tsx` で動いても、型が正しいとは限りません**。

### 2. 型を確かめる

型の確認は `tsc`（TypeScript のコンパイラ）で行います。

```sh
npx tsc --ignoreConfig --noEmit --strict --target es2023 --module nodenext --types node .local/ts-practice.ts
```

何も表示されなければ、型は正しいということです。

- `--noEmit`: JavaScript のファイルを書き出さず、確かめるだけ
- `--ignoreConfig`: リポジトリの `tsconfig.json` を使わず、このファイルだけを確かめる（TypeScript 7 では、ファイルを直接指定するときに必要）

### 3. 壊してみる

`.local/ts-practice.ts` を次のように変えて、そのたびに手順 2 のコマンドを実行してください。

1. `roles: ['operator']` を `roles: ['admin']` にする
2. `describe` の最後の行を `return check.channelId;` にする

```
error TS2322: Type '"admin"' is not assignable to type 'Role'.
error TS2339: Property 'channelId' does not exist on type '{ ok: false; code: "bad_value" | "forbidden_text"; detail: string; }'.
```

どちらも、手順 1 の `tsx` では **動いてしまいます**（型を確かめないため）。型の誤りを見つけるのは `tsc` の仕事です。管理システムの CI が、テストの前に `npx tsc -b` を流しているのはこのためです（[技術カード: GitHub Actions](../ref/github-actions.md)）。

VS Code でファイルを開いていれば、保存しなくても、誤りの場所に赤い波線が出ます。

### 4. 片付け

```sh
rm .local/ts-practice.ts
```

## つまずきやすいところ

- **型は実行するときには消える**: 外から来たデータが型どおりとは限らない。`unknown` で受けて確かめる
- **`any` を使わない**: 型の確認が全部外れる。分からないものは `unknown`
- **`await` を忘れない**: 忘れると `Promise` を受け取ってしまう。`async` の関数の中で待ちたいものには必ず `await`
- **`import` のパスは `.js`**: 中身が `.ts` でも、Node.js の ES モジュールでは `.js` と書く
- **`tsx` で動いても型が正しいとは限らない**: `tsc` で確かめる

## 確認問題

<details>
<summary>問 1. <code>roles: ('operator' | 'publisher')[]</code> は、Kotlin ならどう書きますか。</summary>

`enum class Role { OPERATOR, PUBLISHER }` を作って、`roles: List<Role>` と書くのが近い書き方です。TypeScript は、文字列のまま取りうる値を型で絞れます。

</details>

<details>
<summary>問 2. HTTP の要求の本文を <code>body: unknown</code> で受け取るのはなぜですか。</summary>

外から来たデータは、どんな形か分からないからです。`unknown` にしておくと、確かめずに項目を読もうとしたときにコンパイルエラーになります。`typeof` などで確かめてから使うことを、型が強制してくれます。

</details>

<details>
<summary>問 3. <code>?? fail(…)</code> と書いたとき、左の値の型から <code>undefined</code> が消えるのはなぜですか。</summary>

`fail` の戻り値の型が `never`（決して普通に戻らない）だからです。左の値が `undefined` なら `fail` が例外を投げて先に進まないので、`??` の結果は左の値（`undefined` ではないもの）だけになります。Kotlin の `?: fail(…)`（`Nothing`）と同じです。

</details>

---

次: [7-2 npm workspaces とプロジェクト参照](02-workspaces.md)
