# 9-5 決めたことを残す

[目次](../README.md) ＞ 第 9 部 ＞ 9-5

## この章で学ぶこと

- 2 つのリポジトリの `docs/` にある文書の種類と、それぞれの役目
- ADR: 何を、なぜ決めたか。捨てた案も残す
- 契約書・データモデル・設計書と、文書の ID でコードまでたどる仕組み（トレーサビリティ）
- 決めたことが実装の途中で変わるときの進め方
- 文書の ID を手がかりに、決定からコードとテストまでたどる

## なぜ書いて残すのか

ここまでの章で、何度も「ADR-001 A-14」「API-001 C-8」「DM-001」といった記号が出てきました。コードのコメントにも出てきます。

```ts
/** The `If-Match` value for a resource read earlier (API-001 C-8). */
export const ifMatch = (rev: number) => ({ 'If-Match': `"${rev}"` });
```

コードは **何をするか** を語りますが、**なぜそうしたのか**、**ほかに何を考えて捨てたのか** は語りません。半年後の自分や、新しく加わった人が「なぜ秘密鍵をサーバーに置かないのか」「なぜリストを API でなく静的なファイルで出すのか」と疑問に思ったとき、答えがどこかに書いてあれば、同じ議論を繰り返さずに済みます。間違って「直して」しまうことも防げます。

この 2 つのリポジトリは、**決めてから作る**、**決めたことを文書に残す**、**コードから文書へたどれるようにする** を徹底しています。

## 文書の種類

管理システムの [docs/](../../yorisoi-console/docs/) を例にします。

| 種類 | 文書 | 答える問い |
|---|---|---|
| ADR（設計の決定の記録） | [ADR-001](../../yorisoi-console/docs/adr/ADR-001-aws-architecture.md) | 何を、なぜ選んだか。ほかの案はなぜ捨てたか |
| API 契約書 | [API-001](../../yorisoi-console/docs/console-api.md) ＋ [OpenAPI](../../yorisoi-console/docs/api/console.openapi.yaml) | 画面と API の間で、何をどんな形でやりとりするか（[7-3](../07-typescript/03-openapi.md)） |
| データモデル | [DM-001](../../yorisoi-console/docs/data-model.md) | 何をどんなキーで保存し、どう取り出すか（[8-5](../08-aws/05-dynamodb.md)） |
| 機能設計書 | [DES-001〜010](../../yorisoi-console/docs/design/) | 実装の 1 段ごとに、どう作り、どう確かめたか（DES-007〜010 は素材集） |
| 利用ガイド | [guide/](../../yorisoi-console/docs/guide/README.md) | 運営・チャンネル提供者・素材提供者・保守する人は、どう使うか |
| 運用の手順 | [operations/](../../yorisoi-console/docs/operations/) | 配備の手順（[deploy.md](../../yorisoi-console/docs/operations/deploy.md)）、費用（[cost.md](../../yorisoi-console/docs/operations/cost.md)） |
| 構成図 | [architecture.md](../../yorisoi-console/docs/architecture.md) | 全体がどうつながっているか |
| TODO | [TODO.md](../../yorisoi-console/docs/TODO.md) | 残っている作業 |

SanpoGuide の [docs/](../../yorisoi-sanpoguide/docs/) にも、同じ種類の文書があります。アプリと管理システムの境界を決める文書（API-002 [channel-list-api.md](../../yorisoi-platform/docs/channel-list-api.md)・API-003 [channel-package-format.md](../../yorisoi-platform/docs/channel-package-format.md)・API-004 [material-producer-api.md](../../yorisoi-platform/docs/material-producer-api.md)）は、アプリの側に置いています（[0-1](../00-overview/01-what-we-build.md)）。アプリが受け取るものの形は、アプリが決めるからです。素材提供者を切り出す決定（[ADR-002](../../yorisoi-platform/docs/adr/ADR-002-material-producers.md)）と、2 つのリポジトリに共通する関係者の呼び方（[stakeholders.md](../../yorisoi-platform/docs/stakeholders.md)）も、SanpoGuide の側にあります。

```mermaid
flowchart TB
    subgraph SG["SanpoGuide"]
        SADR["ADR-001<br/>第三者のチャンネルを審査して取り込む"] --> API2["API-002<br/>承認済みチャンネル・リスト"]
        SADR --> API3["API-003<br/>チャンネルのパッケージ"]
        SADR2["ADR-002<br/>素材提供者を切り出す"] --> API4["API-004<br/>素材集と素材提供者の共通の形"]
        SADR2 --> API2
        SADR2 --> API3
    end
    subgraph CC["yorisoi-console"]
        ADR["ADR-001<br/>AWS の構成"] --> API1["API-001 ＋ OpenAPI<br/>管理 API"]
        ADR --> DM["DM-001<br/>データモデル"]
        API1 --> DM
        API1 --> DES["DES-001〜010<br/>実装の段ごとの設計"]
        DM --> DES
    end
    API2 --> ADR
    API3 --> ADR
    API4 --> ADR
    DES --> CODE["コードとテスト<br/>（コメントに文書の ID）"]
```

上の文書が「何を守るか」を決め、下の文書がそれを満たす作り方を決め、コードが実際に作ります。

## ADR: 何を、なぜ決めたか

**ADR**（Architecture Decision Record、設計の決定の記録）は、大事な設計の決定を 1 つずつ残す文書です。[ADR-001](../../yorisoi-console/docs/adr/ADR-001-aws-architecture.md) の章立ては次のとおりです。

| 章 | 中身 |
|---|---|
| 文書情報 | ID・種類・作成者・**承認者**・**ステータス**（草案・承認済）・**版** |
| 目的・背景 | なぜ決める必要があるか。開発者が示した条件 |
| スコープ・非スコープ | この文書が決めること・決めないこと |
| 対応元ID | どの上位の文書の、どの決まりに応えるか |
| 方針・決定事項 | 決めたことを、1 行ずつ ID 付きで（D-1…・A-1…） |
| 判断テーマ | 何について悩んだか |
| 検討した代替案と比較軸 | 案ごとの評価。**捨てた案と、捨てた理由** |
| 採用案と採否理由 | 選んだ組み合わせと、その理由 |
| 影響範囲・追従タスク | この決定で、ほかに何をしなければならないか（T-1…） |
| 未決事項・リスク | まだ決めていないこと、いつ決めるか |

いちばん価値があるのは **「検討した代替案」** です。ADR-001 の表から抜き出します。

| 案 | 評価 |
|---|---|
| 公開 1. API Gateway と Lambda でリストを返す | 管理システムが止まるとアプリが取得できない（P-7 に反する）。呼ばれるたびに費用がかかる → **不採用** |
| 公開 2. S3 と CloudFront で静的ファイルとして出す | P-7 のとおり。費用はほぼ配信量だけ → **採用（A-7）** |
| 署名 C. 秘密鍵を KMS で暗号化して保管し、Lambda で署名 | 契約は変わらない。秘密鍵が Lambda のメモリに出る → **不採用** |
| ログイン 1. チャンネル提供者の鍵だけで入る（署名でログイン） | パスワードが要らない。鍵をなくすとログインもできず、移し替えの本人確認ができない → **不採用** |

「Lambda で返したほうが簡単では？」「鍵でログインさせればパスワードは要らないのでは？」と思った人は、ここを読めば、同じことを考えて捨てた理由が分かります。

### 決定に ID を付ける

決定事項は、1 行ずつ ID を持ちます。

- `D-1`〜: 開発者が決めたこと（「審査の見本は、運営の API キーでブラウザから AI を呼ぶ」= D-4）
- `A-1`〜: 構成の決定（Claude が提案し、開発者が承認したもの。「審査の見本の作り方」= A-14）
- `T-1`〜: 追従タスク（「ルート鍵の手順書」= T-1）

ID があるので、ほかの文書やコードのコメントから **1 行単位で指せます**。

## ID でたどる: 決定からコードとテストまで

[9-3](03-keys-in-browser.md) で見た「AI の API キーをサーバーに送らない」を、文書からコードまでたどってみます。

```mermaid
flowchart LR
    D4["ADR-001 D-4<br/>運営の API キーで<br/>ブラウザから AI を呼ぶ"] --> A14["ADR-001 A-14<br/>キーはブラウザのメモリだけ<br/>CSP で通信先を限る"]
    A14 --> DES5["DES-005<br/>対応元ID に D-4"]
    DES5 --> AI["web/src/ai.ts<br/>(ADR-001 D-4, DES-005)"]
    DES5 --> CSP["infra/lib/console-app.ts<br/>connect-src に AI の API"]
    AI --> T["web/test/ai.test.ts<br/>決めた窓口とキーで呼ぶか"]
```

- [ADR-001](../../yorisoi-console/docs/adr/ADR-001-aws-architecture.md) の D-4 と A-14 が決める
- [DES-005](../../yorisoi-console/docs/design/DES-005-review.md) の「対応元ID（トレーサビリティ）」の表が、`ADR-001 … D-4（AI の見本は運営のキーでブラウザから） | 実装` と、応えたことを記録する
- [web/src/ai.ts](../../yorisoi-console/web/src/ai.ts) の先頭のコメント `The review samples' AI (ADR-001 D-4, DES-005)` が、どの決定を実装したかを示す
- [infra/lib/console-app.ts](../../yorisoi-console/infra/lib/console-app.ts) の CSP にも同じ ID のコメント
- [web/test/ai.test.ts](../../yorisoi-console/web/test/ai.test.ts) が、決めた窓口とキーで呼ぶことを確かめる

逆向きにもたどれます。コードを読んでいて「なぜブラウザから直接 AI を呼ぶのだろう、サーバーを通したほうが安全では？」と思ったら、コメントの `ADR-001 D-4` から決定に、そこから比較と理由にたどり着けます。

## 決めたことが変わるとき

決めたことが、実装してみて合わないと分かることもあります。そのときは、**文書を黙って無視せず、文書を直してから（または同時に）コードを変えます**。

たとえば ADR-001 の A-4 は「MFA（TOTP）は全員に必須」です。Cognito の MFA は **ユーザープール単位** でしか決められないので（[8-4](../08-aws/04-cognito.md)）、「運営だけに必須」にはできません。もし文書が「運営だけ」と書いていて、実装の途中でこの制約に気づいたら、次のように進めます。

1. 開発者に判断を仰ぐ（「全員に MFA を求める」か、プールを分けるか）
2. 決まったら、ADR の A-4 を新しい決定に書き換える
3. 同じコミットで、コードとコメント（`(ADR-001 A-4: one pool, TOTP MFA for everyone)`）を変える

文書には **今の決定だけ** を書きます。前の決定と、変えた理由は、コミットのメッセージと差分（git の履歴）に残ります。こうしておけば、「ADR には運営だけと書いてあるのに、コードは全員に MFA を求めている。どちらが正しい？」という混乱が起きず、経緯も git でたどれます。

### 承認とステータス

文書には **ステータス**（草案 → 承認済）と **承認者** があります。このリポジトリでは、文書は Claude が開発者と相談しながら書き、**開発者が承認** してから、それに沿って実装に進みます。承認を待っている文書は TODO.md やメモに「承認待ち」と書き、承認前のものに沿って勝手に実装を進めません。

## ハンズオン: 文書の ID でたどる

読むだけのハンズオンです。何も変えません。

### 1. コードが、どの文書をいくつ指しているか

```sh
cd /c/Dev/apps/yorisoi-console
grep -rhoE "\b(ADR-001|API-00[0-9]|DM-001|DES-0[0-9][0-9])" api/src web/src infra/lib infra/bin validator/src packages \
  --include=*.ts --include=*.tsx --include=*.kt | sort | uniq -c | sort -rn
```

```text
     64 DM-001
     50 API-001
     37 API-002
     37 ADR-001
     24 DES-007
     19 DES-008
     16 DES-009
     10 API-003
      6 API-004
      5 DES-010
      4 DES-006
      2 DES-005
      1 DES-003
```

（main で数えたもの。コードが変われば数も変わります）

データモデル・API 契約書・ADR がよく指されています。SanpoGuide の文書（API-002・API-003・API-004）も、管理システムのコードから指されています。アプリとの境界を守るコードだからです。素材集を足した段（DES-007〜010）の設計書が多く指されているのは、新しく書いたコードほど、どの決定に従ったかをコメントに残しているからです。

### 2. 1 つの決定をたどる

```sh
grep -n "^| D-4 \|^| A-14 " docs/adr/ADR-001-aws-architecture.md
grep -n "D-4" docs/design/DES-005-review.md
grep -rn "D-4" web/src infra/lib
```

ADR の決定 → 設計書の対応元ID → 画面のコードと CDK のコメント、とつながっているのが見えます。

### 3. 決定が変わった記録をたどる

```sh
git log --oneline -- docs/adr/ADR-001-aws-architecture.md
git log -p -S "A-4" -- docs/adr/ADR-001-aws-architecture.md
```

1 つ目は、ADR-001 を変えたコミットの一覧です。2 つ目は、`A-4` を含む行が増えたり減ったりしたコミットを、差分つきで出します。文書には今の決定だけが書かれているので、「前はどうだったか」「なぜ変えたか」は、こうして git の履歴から読みます。決定の変更と、それに合わせた実装が、同じコミットに入っていることも確かめられます。

## チュートリアルのおわりに

これで、2 つのリポジトリを通して使われている技術をひととおり見ました。

| 部 | 学んだこと |
|---|---|
| 第 0 部 | 何を作っているか、技術の地図、手元の準備 |
| 第 1〜4 部 | Kotlin と Android、Compose、散策の仕組み、外の世界とのやりとり |
| 第 5 部 | アプリと管理システムが共有する形式（コアとプロンプト・パック） |
| 第 6 部 | 署名と信頼: なぜ、どう確かめるか |
| 第 7 部 | TypeScript のモノレポ、契約から始める作り方、テスト |
| 第 8 部 | AWS のサーバーレス: CDK・Lambda・Cognito・DynamoDB・S3・CloudFront・SQS・Kotlin の Lambda |
| 第 9 部 | 管理画面（React・ログイン・ブラウザの中の鍵）、CI、文書 |

次の一歩としては:

- 興味を持った部分の **テストを読む**。テストは、その部分に何が求められているかを一番正確に語る
- 各章の「やってみよう」のように、**わざと壊して、どのテストが止めるかを見る**
- 小さな変更を考え、**文書（どの決定に関わるか）→ コード → テスト → CI** の順に進めてみる

コードは日々変わります。このチュートリアルの見直しの手順は [MAINTENANCE.md](../MAINTENANCE.md) にあります。

## つまずきやすいところ

- **コードは「何を」、文書は「なぜ」**: なぜを知りたいときは、コメントの文書の ID からたどる
- **捨てた案こそ残す**: 同じ議論を繰り返さないため
- **決定が合わなくなったら、文書を直す**: 黙ってコードだけ変えない。文書には今の決定を書き、経緯は git に残す
- **境界の文書は、受け取る側に置く**: アプリが受け取る形（API-002・API-003）はアプリのリポジトリに
- **承認前の文書に沿って、勝手に作り込まない**

## 確認問題

<details>
<summary>問 1. 「承認済みチャンネル・リストを Lambda で返せば、もっと簡単なのに」と思いました。どこを読めば、なぜそうしなかったかが分かりますか。</summary>

管理システムの ADR-001 の「検討した代替案と比較軸」です。「公開 1. API Gateway と Lambda でリストを返す」は、管理システムが止まるとアプリがリストを取れない（API-002 P-7 に反する）、呼ばれるたびに費用がかかる、という理由で捨てられ、S3 と CloudFront の静的ファイル（A-7）が選ばれています。

</details>

<details>
<summary>問 2. コードに <code>(ADR-001 A-4: one pool, TOTP MFA for everyone)</code> と、決定の中身まで書いてあるのはなぜですか。</summary>

ID だけでなく中身を一言添えると、コードを読む人が、文書を開かなくても何に従っているかが分かるからです。決定が変わったときも、コメントと文書を見比べれば、コードが今の決定に追従しているかをすぐに確かめられます。

</details>

<details>
<summary>問 3. 実装の途中で、ADR の決定どおりには作れないと分かりました。どう進めますか。</summary>

気づいたことを記録し、決める人（開発者）に判断を仰ぎます。決まったら、ADR の該当する行を今の決定に書き換え、同じコミットでコードを変えます。前の決定と理由は git の履歴に残ります。

</details>

---

前: [9-4 CI](04-ci.md) ／ [目次へ戻る](../README.md)
