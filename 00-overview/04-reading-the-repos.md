# 0-4 リポジトリの歩き方

[目次](../README.md) ＞ 第 0 部 ＞ 0-4

## この章で学ぶこと

- 3 つのリポジトリのフォルダ構成と、どこに何があるか
- 文書（ADR・契約書・設計書）の役割と読む順番
- コードの中で迷ったときの手がかり

## SanpoGuide のフォルダ

SanpoGuide のコードは 2 つのリポジトリに分かれています。アプリそのものは `yorisoi-sanpoguide`、ほかの付き添いアプリとも共有する部品は `yorisoi-platform` にあります。アプリは、yorisoi-platform が GitHub Packages に公開した版を使います。

```
yorisoi-sanpoguide/
├── app/                         Android アプリ本体（モジュール :app）
│   └── src/
│       ├── main/java/io/github/duwenji/yorisoi/sanpoguide/
│       │   ├── ui/              画面（Compose）と ViewModel
│       │   ├── walk/            常駐サービス WalkService、きっかけの見せ方
│       │   ├── companion/       話しかけの判断（TalkDecider・天気・施設・スポットの選び方）
│       │   ├── guide/           AI への解説の頼み方
│       │   ├── material/        素材の出どころ（Producer）、チャンネルのきっかけ
│       │   ├── station/         チャンネル（remote/ は第三者のチャンネル）、アプリのプロファイル
│       │   ├── history/         散歩の記録
│       │   └── settings/        設定
│       └── test/                単体テスト
├── prompts/                     プロンプト・パック（:prompts、素の JVM）
│   └── src/main/
│       ├── kotlin/…/prompt/              プロンプトの組み立て、組み込みのチャンネル、審査の見本
│       └── resources/sanpoguide/         組み込みのチャンネルとプロンプトの文面
├── docs/                        アプリの文書
├── gradle/libs.versions.toml    依存ライブラリの版の一覧（yorisoi-platform の版もここ）
├── build.gradle.kts             ビルドの設定（全体）
└── settings.gradle.kts          どのモジュールがあるか、部品をどこから取るか

yorisoi-platform/                エコシステム共通の方針・契約と、アプリをまたいで使う部品
├── core-format/                 コア: チャンネル・パッケージと素材集の形式、署名の確認、リストの文書（素の JVM）
├── core-prompt/                 コア: プロンプトのテンプレートの仕組み（素の JVM）
├── kit-voice/                   キット: 読み上げ、背景音
├── kit-llm/                     キット: AI の呼び出し、API キーの暗号化
├── kit-geo/                     キット: スポット・施設・ルート・写真・天気の取得、地図
├── kit-mood/                    キット: 雰囲気
├── kit-companion/               キット: 話す判断のルールとゲート（素の JVM）
└── docs/                        共通文書（decisions/・contracts/・overview/・policies/・work/）とアプリの手引き
```

パッケージ（フォルダ）は **機能ごと** に分かれています。「画面・ロジック・データ」のような層ごとではありません。たとえば話しかけに関わるものは `companion/` に集まっています。何かを探すときは、まず機能の名前でフォルダを探してください。

全体の図は [yorisoi-sanpoguide/docs/architecture.md](https://github.com/duwenji/yorisoi-sanpoguide/blob/main/docs/architecture.md) にあります。

## yorisoi-console のフォルダ

```
yorisoi-console/
├── packages/
│   ├── protocol/        platform API-CHANNEL-LIST の文書の作成と検証（署名・要約・鍵セット）★第 6 部
│   └── api-types/       管理 API の型（OpenAPI から生成）
├── api/src/
│   ├── publish/         公開の処理（リストを作って署名して置く）★第 6 部
│   ├── console/         管理 API
│   └── notify/          チャンネル提供者・素材提供者へのメール
├── web/                 画面（React）
├── validator/           機械審査（Kotlin）
├── infra/               AWS CDK
├── conformance/         platform API-CHANNEL-LIST の準拠テスト ★第 6 部
├── tools/
│   ├── root-key/        ルート鍵の CLI ★第 6 部
│   ├── provision/       初期登録
│   └── e2e/             通しの確認
└── docs/                文書
```

こちらは **パッケージ（npm workspace）ごと** に分かれています。`packages/protocol` はほかの多くのパッケージから使われる共通部品です。

全体の図は [yorisoi-console/docs/architecture.md](https://github.com/duwenji/yorisoi-console/blob/main/docs/architecture.md) にあります。

## 文書の読み方

3 つのリポジトリには、コードと同じくらい大事な文書があります。共通ルールと各システムの実装判断は、正本となるリポジトリの文書で確認します。

| 種類 | 何が書いてあるか | 読むとき |
|---|---|---|
| README.md | 何のためのリポジトリか、使い方 | 最初に |
| architecture.md | 部品の構成を図で | 全体をつかみたいとき |
| ADR（console `docs/adr/`、platform `docs/decisions/`） | 大事な判断と、**なぜそう決めたか**、ほかの選択肢 | 「なぜこうなっているのか」と思ったとき |
| API 契約書 | システムの間でやりとりするデータの形と約束 | 境界のコードを読むとき |
| データモデル（DM） | 何をどう保存するか | データベースのコードを読むとき |
| 設計書（DES） | 実装の細部 | 特定の機能を深く読むとき |
| TODO.md | 進め方、次にやること | 今どこまでできているか知りたいとき |
| 利用ガイド（SanpoGuide と console の `docs/`） | 立場ごとの使い方 | 実際に操作するとき |

### 文書番号を手がかりにする

コードのコメントには、よく文書の番号が出てきます。

```ts
/** Builds the channel list and signs its digest (API-002 P-8). */
```

このコードコメントは旧番号 API-002 で記録されています。これは「この関数は platform の API-CHANNEL-LIST、決定事項 P-8 に従っている」という意味です。**コードだけでは分からない「なぜ」は、canonical ID と旧番号の対応を確認してから正本をたどります。** 第 6 部では、このつながりを何度もたどります。

主な文書の場所:

| 番号 | 文書 | 場所 |
|---|---|---|
| platform API-SECRET-MESSAGES（旧 API-001） | 秘密メッセージ サーバー API 契約書（OpenAPI は `docs/api/`） | [API-SECRET-MESSAGES](https://github.com/duwenji/yorisoi-platform/blob/main/docs/contracts/API-SECRET-MESSAGES.md) |
| platform API-CHANNEL-LIST（旧 API-002） | 承認済みチャンネル・リスト契約 | [API-CHANNEL-LIST](https://github.com/duwenji/yorisoi-platform/blob/main/docs/contracts/API-CHANNEL-LIST.md) |
| platform API-CHANNEL-PACKAGE（旧 API-003） | チャンネル・パッケージ形式 | [API-CHANNEL-PACKAGE](https://github.com/duwenji/yorisoi-platform/blob/main/docs/contracts/API-CHANNEL-PACKAGE.md) |
| platform API-MATERIAL-PRODUCER（旧 API-004） | 素材提供者インタフェース（素材集の形式を含む） | [API-MATERIAL-PRODUCER](https://github.com/duwenji/yorisoi-platform/blob/main/docs/contracts/API-MATERIAL-PRODUCER.md) |
| platform ADR-CHANNEL-CURATION（旧 ADR-001） | 第三者のチャンネルは審査と署名を経たものだけ取り込む | [ADR-CHANNEL-CURATION](https://github.com/duwenji/yorisoi-platform/blob/main/docs/decisions/ADR-CHANNEL-CURATION.md) |
| platform ADR-MATERIAL-PRODUCERS（旧 ADR-002） | 素材提供者と素材集の共通方針 | [ADR-MATERIAL-PRODUCERS](https://github.com/duwenji/yorisoi-platform/blob/main/docs/decisions/ADR-MATERIAL-PRODUCERS.md) |
| platform ADR-ECOSYSTEM-PLATFORM（旧 ADR-003） | エコシステムの共通基盤 | [ADR-ECOSYSTEM-PLATFORM](https://github.com/duwenji/yorisoi-platform/blob/main/docs/decisions/ADR-ECOSYSTEM-PLATFORM.md) |
| platform 関係者と共通用語 | 散策者・チャンネル提供者・素材提供者・運営、リスト | [関係者と共通用語](https://github.com/duwenji/yorisoi-platform/blob/main/docs/overview/roles-and-vocabulary.md) |
| platform の審査方針 | チャンネルの確認・承認・取り下げ | [チャンネル審査方針](https://github.com/duwenji/yorisoi-platform/blob/main/docs/policies/channel-review.md) |
| console ADR-001 | AWS の構成 | [console ADR-001](https://github.com/duwenji/yorisoi-console/blob/main/docs/adr/ADR-001-aws-architecture.md) |
| console API-001 | 管理 API | [yorisoi-console/docs/console-api.md](https://github.com/duwenji/yorisoi-console/blob/main/docs/console-api.md) |
| console DM-001 | データモデル | [console DM-001](https://github.com/duwenji/yorisoi-console/blob/main/docs/data-model.md) |
| console 文書一覧 | console の設計・ガイド・運用文書 | [console docs/README.md](https://github.com/duwenji/yorisoi-console/blob/main/docs/README.md) |

**同じ旧番号でもリポジトリが違えば別の文書** なので注意してください。たとえば `console ADR-001` と `platform ADR-CHANNEL-CURATION` は別の判断です。また、platform の旧 `API-001` は `API-SECRET-MESSAGES`、console の `API-001` は管理 API です。platform 文書は canonical ID、console 文書は `console` を添えて呼びます。一覧は [platform ADR 一覧](https://github.com/duwenji/yorisoi-platform/blob/main/docs/decisions/README.md)、[platform API 契約一覧](https://github.com/duwenji/yorisoi-platform/blob/main/docs/contracts/README.md)、[console 文書一覧](https://github.com/duwenji/yorisoi-console/blob/main/docs/README.md)を参照してください。

## コードの中で迷ったら

1. **入口から追う**: アプリなら `MainActivity` と `WalkService`、管理システムなら各 Lambda の `handler.ts`
2. **テストを読む**: テストは「この関数に何を渡すと何が返るか」の具体例の集まりです。本体より先に読むと分かりやすいことがよくあります
3. **コメントの文書番号を引く**: 「なぜ」が分かります
4. **全文検索する**: VS Code の検索（Ctrl+Shift+F）で、関数名や、エラーメッセージの文字列を探す

## 確認問題

<details>
<summary>問 1. コードのコメントに「(API-002 P-6)」とあったら、何を見ればよいですか。</summary>

[platform API-CHANNEL-LIST（旧 API-002）](https://github.com/duwenji/yorisoi-platform/blob/main/docs/contracts/API-CHANNEL-LIST.md) の決定事項 P-6 です。そのコードがなぜそうなっているかの理由が書いてあります。

</details>

<details>
<summary>問 2. SanpoGuide で「天気の急変を知らせる」コードを探すなら、まずどのフォルダを見ますか。</summary>

`companion/` です（話しかけの判断が集まっている）。実際に `WeatherChange.kt` と `WeatherClient.kt` があります。

</details>

---

前: [0-3 開発環境の準備](03-setup.md) ／ 次: [1-1 Kotlin の文法](../01-kotlin-android/01-kotlin-syntax.md)。先に [第 6 部 信頼の仕組み](../06-trust/01-why-signatures.md) へ進むこともできます
