# 0-4 リポジトリの歩き方

[目次](../README.md) ＞ 第 0 部 ＞ 0-4

## この章で学ぶこと

- 2 つのリポジトリのフォルダの構成と、どこに何があるか
- 文書（ADR・契約書・設計書）の役割と読む順番
- コードの中で迷ったときの手がかり

## SanpoGuide のフォルダ

```
SanpoGuide/
├── apps/sanpoguide/
│   ├── app/                     Android アプリ本体（モジュール :apps:sanpoguide:app）
│   │   └── src/
│   │       ├── main/java/io/github/duwenji/sanpoguide/
│   │       │   ├── ui/          画面（Compose）と ViewModel
│   │       │   ├── walk/        常駐サービス WalkService、きっかけの見せ方
│   │       │   ├── companion/   話しかけの判断（TalkDecider・天気・施設・スポットの選び方）
│   │       │   ├── guide/       AI への解説の頼み方
│   │       │   ├── material/    素材の出どころ（Producer）、チャンネルのきっかけ
│   │       │   ├── station/     チャンネル（remote/ は第三者のチャンネル）、アプリのプロファイル
│   │       │   ├── history/     散歩の記録
│   │       │   └── settings/    設定
│   │       └── test/            単体テスト
│   └── prompts/                 プロンプト・パック（:apps:sanpoguide:prompts、素の JVM）
│       └── src/main/
│           ├── kotlin/…/prompt/          プロンプトの組み立て、組み込みのチャンネル、審査の見本
│           └── resources/sanpoguide/     組み込みのチャンネルとプロンプトの文面
├── platform/                    アプリをまたいで使う部品（michizure、ADR-003）
│   ├── core-format/             コア: チャンネル・パッケージと素材集の形式、署名の確認、リストの文書（素の JVM）
│   ├── core-prompt/             コア: プロンプトのテンプレートの仕組み（素の JVM）
│   ├── kit-voice/               キット: 読み上げ、背景音
│   ├── kit-llm/                 キット: AI の呼び出し、API キーの暗号化
│   ├── kit-geo/                 キット: スポット・施設・ルート・写真・天気の取得、地図
│   ├── kit-mood/                キット: 雰囲気
│   └── kit-companion/           キット: 話す判断のルールとゲート（素の JVM）
├── docs/                        文書
├── gradle/libs.versions.toml    依存ライブラリの版の一覧
├── build.gradle.kts             ビルドの設定（全体）
└── settings.gradle.kts          どのモジュールがあるか
```

パッケージ（フォルダ）は **機能ごと** に分かれています。「画面・ロジック・データ」のような層ごとではありません。たとえば話しかけに関わるものは `companion/` に集まっています。何かを探すときは、まず機能の名前でフォルダを探してください。

全体の図は [SanpoGuide/docs/architecture.md](../../SanpoGuide/docs/architecture.md) にあります。

## michizure-console のフォルダ

```
michizure-console/
├── packages/
│   ├── protocol/        API-002 の文書の作成と検証（署名・要約・鍵セット）★第 6 部
│   └── api-types/       管理 API の型（OpenAPI から生成）
├── api/src/
│   ├── publish/         公開の処理（リストを作って署名して置く）★第 6 部
│   ├── console/         管理 API
│   └── notify/          チャンネル提供者・素材提供者へのメール
├── web/                 画面（React）
├── validator/           機械審査（Kotlin）
├── infra/               AWS CDK
├── conformance/         API-002 の準拠テスト ★第 6 部
├── tools/
│   ├── root-key/        ルート鍵の CLI ★第 6 部
│   ├── provision/       初期登録
│   └── e2e/             通しの確認
└── docs/                文書
```

こちらは **パッケージ（npm workspace）ごと** に分かれています。`packages/protocol` はほかの多くのパッケージから使われる共通部品です。

全体の図は [michizure-console/docs/architecture.md](../../michizure-console/docs/architecture.md) にあります。

## 文書の読み方

両リポジトリには、コードと同じくらい大事な文書があります。種類ごとに役割が違います。

| 種類 | 何が書いてあるか | 読むとき |
|---|---|---|
| README.md | 何のためのリポジトリか、使い方 | 最初に |
| architecture.md | 部品の構成を図で | 全体をつかみたいとき |
| ADR（`docs/adr/`） | 大事な判断と、**なぜそう決めたか**、ほかの選択肢 | 「なぜこうなっているのか」と思ったとき |
| API 契約書 | システムの間でやりとりするデータの形と約束 | 境界のコードを読むとき |
| データモデル（DM） | 何をどう保存するか | データベースのコードを読むとき |
| 設計書（DES） | 実装の細部 | 特定の機能を深く読むとき |
| TODO.md | 進め方、次にやること | 今どこまでできているか知りたいとき |
| 利用ガイド（console の `docs/guide/`） | 立場ごとの使い方 | 実際に操作するとき |

### 文書番号を手がかりにする

コードのコメントには、よく文書の番号が出てきます。

```ts
/** Builds the channel list and signs its digest (API-002 P-8). */
```

これは「この関数は API-002 の決定事項 P-8 に従っている」という意味です。**コードだけでは分からない「なぜ」は、その番号の文書に書いてあります。** 第 6 部では、このつながりを何度もたどります。

主な文書の場所:

| 番号 | 文書 | 場所 |
|---|---|---|
| API-002 | 承認済みチャンネル・リスト 契約書 | [SanpoGuide/docs/channel-list-api.md](../../SanpoGuide/docs/channel-list-api.md) |
| API-003 | チャンネル・パッケージ形式 | [SanpoGuide/docs/channel-package-format.md](../../SanpoGuide/docs/channel-package-format.md) |
| API-004 | 素材の素材提供者インタフェース（素材集の形式を含む） | [SanpoGuide/docs/material-producer-api.md](../../SanpoGuide/docs/material-producer-api.md) |
| ADR-001（SanpoGuide） | 第三者のチャンネルは審査と署名を経たものだけ取り込む | [SanpoGuide/docs/adr/](../../SanpoGuide/docs/adr/) |
| ADR-002（SanpoGuide） | 素材の素材提供者をチャンネルから切り出し、共通のインタフェースで扱う | [SanpoGuide/docs/adr/](../../SanpoGuide/docs/adr/) |
| 関係者と呼び方 | 散策者・チャンネル提供者・素材提供者・運営、リスト（呼び方の正本） | [SanpoGuide/docs/stakeholders.md](../../SanpoGuide/docs/stakeholders.md) |
| ADR-001（console） | AWS の構成 | [michizure-console/docs/adr/](../../michizure-console/docs/adr/) |
| API-001（console） | 管理 API | [michizure-console/docs/console-api.md](../../michizure-console/docs/console-api.md) |
| DM-001 | データモデル | [michizure-console/docs/data-model.md](../../michizure-console/docs/data-model.md) |

**同じ番号でもリポジトリが違えば別の文書** なので注意してください。ADR-001 は両方にあり、API-001 も SanpoGuide 側（秘密メッセージ API）と console 側（管理 API）で別物です。

## コードの中で迷ったら

1. **入口から追う**: アプリなら `MainActivity` と `WalkService`、管理システムなら各 Lambda の `handler.ts`
2. **テストを読む**: テストは「この関数に何を渡すと何が返るか」の具体例の集まりです。本体より先に読むと分かりやすいことがよくあります
3. **コメントの文書番号を引く**: 「なぜ」が分かります
4. **全文検索する**: VS Code の検索（Ctrl+Shift+F）で、関数名や、エラーメッセージの文字列を探す

## 確認問題

<details>
<summary>問 1. コードのコメントに「(API-002 P-6)」とあったら、何を見ればよいですか。</summary>

SanpoGuide の `docs/channel-list-api.md`（API-002）の決定事項 P-6 です。そのコードがなぜそうなっているかの理由が書いてあります。

</details>

<details>
<summary>問 2. SanpoGuide で「天気の急変を知らせる」コードを探すなら、まずどのフォルダを見ますか。</summary>

`companion/` です（話しかけの判断が集まっている）。実際に `WeatherChange.kt` と `WeatherClient.kt` があります。

</details>

---

前: [0-3 開発環境の準備](03-setup.md) ／ 次: [1-1 Kotlin の文法](../01-kotlin-android/01-kotlin-syntax.md)。先に [第 6 部 信頼の仕組み](../06-trust/01-why-signatures.md) へ進むこともできます
