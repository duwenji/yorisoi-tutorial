# 0-3 開発環境の準備

[目次](../README.md) ＞ 第 0 部 ＞ 0-3

## この章で学ぶこと

- 2 つのリポジトリを動かすのに要る道具と、その役割
- 道具が正しく入ったかの確かめ方

ここでは Windows を前提に書きます（両リポジトリとも Windows で開発されています）。macOS や Linux でも、同じ道具を入れれば動きます。

## 要る道具

| 道具 | 版 | 何に使うか | 要る部 |
|---|---|---|---|
| Git | 最新 | リポジトリの取得 | すべて |
| JDK（Java の開発キット） | 17 以上 | Kotlin のコードのビルド（Gradle を動かす） | 1〜6、8 |
| Android Studio | 最新 | アプリの開発、エミュレータ | 1〜4 |
| Node.js | 22 以上 | TypeScript のコードの実行とビルド | 6〜9 |
| Docker Desktop | 最新 | 管理 API のテストで DynamoDB Local を動かす | 7〜8 |
| VS Code | 最新 | コードを読む（このチュートリアルのリンクを開く） | すべて |
| AWS のアカウント | — | 実際に配備するとき | 8 の一部だけ |

**AWS のアカウントは、ほとんどの章で要りません。** 管理システムのコードは、AWS の部品を差し替えられるように作られていて、手元だけで動かしたりテストしたりできます。第 6 部のハンズオンも AWS なしで最後まで進めます。

### 道具ごとのメモ

- **JDK**: Android Studio に同梱の JDK（JetBrains Runtime）でもかまいません。どちらのリポジトリも Java 17 向けにビルドする設定です（`JavaVersion.VERSION_17`）
- **Gradle 本体は入れなくてよい**: 両リポジトリには `gradlew`（Gradle Wrapper）が入っていて、初回の実行時に決められた版の Gradle を自動で取ってきます。SanpoGuide は Gradle 8.14.3 です
- **Node.js**: michizure-console の `package.json` に `"engines": { "node": ">=22" }` と書かれています。22 より古いと動きません
- **Docker**: 第 7〜8 部のテストの一部（管理 API のテスト）だけで使います。なくても、ほかのテストは流せます

## リポジトリの置き方

3 つのフォルダを同じ親フォルダに並べてください。このチュートリアルのリンクも、管理システムの一部のスクリプトも、この並びを前提にしています。

```
c:\Dev\apps\
├── SanpoGuide\           Android アプリ
├── michizure-console\    チャンネル管理システム
└── michizure-tutorial\   このチュートリアル
```

```sh
cd /c/Dev/apps
git clone https://github.com/duwenji/SanpoGuide.git
git clone https://github.com/duwenji/michizure-console.git
```

### Windows での改行コードの注意

Git for Windows の既定（`core.autocrlf=true`）では、取得したファイルの改行が CRLF に変わります。SanpoGuide のチャンネルのプロンプトのように、**中身のバイト列がそのまま意味を持つファイル**（ハッシュを取る、署名する）は、改行が変わると別物になってしまいます。そのため SanpoGuide は `.gitattributes` でそうしたファイルを LF に固定しています。

自分で同じ種類のファイルを足すときは、`.gitattributes` に入れるのを忘れないでください。なぜバイト列が変わると困るのかは、第 6 部で分かります。

## 動作確認

### 1. SanpoGuide（Kotlin）

コア（`core-format`）のテストを流します。Android の SDK がなくても動く、素の Kotlin のモジュールです。

```sh
cd /c/Dev/apps/SanpoGuide
./gradlew :platform:core-format:test
```

初回は Gradle と依存ライブラリのダウンロードで数分かかります。最後に `BUILD SUCCESSFUL` と出れば成功です。

アプリ全体のビルドは Android Studio で SanpoGuide のフォルダを開き、Gradle の同期が終わってから「Run」で行います。初回は Android SDK の取得を求められるので、案内に従ってください。

> `local.properties`（Android SDK の場所）と `keystore.properties`（リリース用の署名鍵）は Git に入っていません。`local.properties` は Android Studio が作ってくれます。`keystore.properties` は、なければリリース APK が署名なしになるだけで、開発には要りません。

### 2. michizure-console（TypeScript）

```sh
cd /c/Dev/apps/michizure-console
npm ci          # 依存ライブラリを package-lock.json のとおりに入れる
npx tsc -b      # 型の確認（何も出なければ成功）
npx vitest run  # テスト
```

`npm ci` と `npm install` の違い: `npm ci` は `package-lock.json` に書かれた版を **そのまま** 入れます。人によって入る版が違う、ということが起きないので、取得した直後や CI ではこちらを使います。

Docker が動いていないと、管理 API のテストは DynamoDB Local を起動できずに失敗します。その場合も、ほかのテストの結果は見られます。

### 3. 手元で「公開」してみる（AWS なし）

最後に、管理システムの公開の処理を手元で動かします。第 6 部のハンズオンでくわしく扱うので、ここでは動くことだけ確かめます。

```sh
cd /c/Dev/apps/michizure-console
npm run publish:local -w api
```

次のように出れば成功です（`provider:` のあとの値は毎回変わります）。

```
published seq 1 to ../.local/site
provider: sc1ajniv3h7pigusni2qmvzlacuhghuufdh
```

`-w api` は「workspace `api` の中で」という意味です。npm workspaces については第 7 部で説明します。

## つまずきやすいところ

| 症状 | 原因と対処 |
|---|---|
| `./gradlew` が「JAVA_HOME is not set」で止まる | JDK が見つからない。JDK 17 以上を入れて `JAVA_HOME` を設定するか、Android Studio の JDK の場所を指定する |
| `npm ci` が `EBADENGINE` などで止まる | Node.js が古い。22 以上を入れる |
| `npx vitest run` で一部のテストが接続エラー | Docker Desktop が起動していない |
| PowerShell で `./gradlew` が動かない | PowerShell では `.\gradlew.bat`。このチュートリアルのコマンドは Git Bash を前提にしている |

## 確認問題

<details>
<summary>問 1. このチュートリアルの大半で AWS のアカウントが要らないのはなぜですか。</summary>

管理システムのコードが、AWS の部品（DynamoDB、S3、KMS など）を差し替えられるように作られていて、手元では代役（メモリ上の保存、フォルダへの書き出し、手元の鍵）で動かせるからです。

</details>

<details>
<summary>問 2. `npm ci` を使うのはどんなときですか。</summary>

リポジトリを取得した直後や CI など、`package-lock.json` に書かれたとおりの版を、だれの環境でも同じように入れたいときです。

</details>

---

前: [0-2 技術の地図](02-technology-map.md) ／ 次: [0-4 リポジトリの歩き方](04-reading-the-repos.md)
