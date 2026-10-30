# 5-5 2 本目のアプリで部品を使い回す

[目次](../README.md) ＞ 第 5 部 ＞ 5-5

## この章で学ぶこと

- 2 本目の付き添いアプリ CycleGuide が、散策ガイドと何を共有し、何を自分で持つか
- アプリにあったコードを、共有の部品（キット）に移すときの進め方
- アプリごとの違いを、部品の中に書かずに **引数で渡す** 作り（`AppProfile`・ルールの並び・検索の中心）
- 共有の部品を直すと、使っている全部のアプリに効く。その怖さと、手元で両方を確かめる方法

## CycleGuide とは

[yorisoi-cycleguide](https://github.com/duwenji/yorisoi-cycleguide) は、自転車で走る人のそばで、周りの見どころや安全の情報を声で伝えるアプリです。散策ガイドと同じエコシステム（yorisoi）の 2 本目のアプリで、同じチャンネル・同じ管理システム・同じ運営の AI を使います。

散歩と自転車では、付き添い方が大きく違います。

| | 散策ガイド | CycleGuide |
|---|---|---|
| 速さ | 時速 4 km ほど | 時速 15 km 前後。止まったり走ったりする |
| 画面 | 歩きながら見てもよい | **走行中は見せない**（「走行中」とだけ出す暗い画面） |
| いつ話すか | スポットに近づいたら | **前方** の見どころに、着く前に話し終える |
| 話さない場面 | 立ち止まっている間はスポットを次々に案内しない | 信号の近くや速いときは、安全の知らせ以外を話さない |
| 話の長さ | チャンネルの解説の長さ | 止まっているか動いているかで、字数の上限を変える |

それでも、チャンネルを読む・AI を呼ぶ・地図や天気を取る・声で話す、という部品は同じです。CycleGuide の設計（[docs/architecture.md](https://github.com/duwenji/yorisoi-cycleguide/blob/main/docs/architecture.md)）の最初の一文は「SanpoGuide と同じ作りを基本にします」です。

## 共有するもの、アプリが持つもの

[CycleApp.kt](https://github.com/duwenji/yorisoi-cycleguide/blob/main/app/src/main/java/io/github/duwenji/yorisoi/cycleguide/CycleApp.kt) の `onCreate` を見ると、[2-3](../02-compose/03-manual-di.md) で読んだ `SanpoApp` とよく似ています。DI のライブラリを使わず、部品を 1 つずつ作ってつなぐ形も同じです。

```kotlin
val relay = OperatorAi.create(this, BuildConfig.AI_RELAY_URL, BuildConfig.PLAY_CLOUD_PROJECT_NUMBER)
settings = SettingsRepository(this, operatorAvailable = relay != null)
ai = AiGateway({ settings.settings.value.connection }, AiUsage.of(this), relay)
diagnostics = SessionRecorder(File(filesDir, "diagnostics"), startType = "ride_start", endType = "ride_end") { /* … */ }
// …
channels = ThirdPartyChannels(
    dir = File(filesDir, "channels"),
    http = OkHttpProviderHttp("CycleGuide/${BuildConfig.VERSION_NAME}"),
    verifier = TinkEd25519,
    profile = CycleProfile.of(BuildConfig.VERSION_CODE),
    // …
)
stations = StationRepository(BuiltInChannels.load(), BuiltInChannels.STANDARD, choice, appScope, channels.stations)
spots = SpotRepository(
    OverpassClient(),
    shops = { stations.current.value.searchedKinds },
    cache = SpotCache(File(cacheDir, "spots")),
    // Ahead of the rider, half the style's distance (architecture.md「前方」).
    searchCenter = { location -> Ahead.searchCenter(/* 今の位置・進む向き・走り方の「前方を探す距離」 */) },
    signals = true,
    // …
)
```

| 部品 | 置き場所 | 散策ガイド | CycleGuide |
|---|---|---|---|
| AI の入口・中継・回数・出力の確認 | `kit-llm` | 同じもの | 同じもの |
| チャンネル・第三者の取り込み・素材・きっかけ | `kit-channel` | 同じもの | 同じもの |
| スポット・施設・天気・地図・検索のキャッシュ | `kit-geo` | 現在地の周りを探す | **前方** を探す。信号の位置も取る |
| 話す判断のエンジン・開発者の記録 | `kit-companion` | 散歩のルールを渡す | 走行のルールを渡す |
| 読み上げ | `kit-voice` | 同じもの | 同じもの |
| 判断のルール・走り方・前方・話さない場面 | 各アプリ | `TalkDecider` | `RideDecider`・`Motion`・`Ahead`・`QuietZones`・`SpeechBudget` |
| プロンプトの文面・組み込みのチャンネル | 各アプリの `:prompts` | 散歩の語り | 走行の語り |
| 色・画面の上部のバー・アイコンの背景 | `kit-ui`・`kit-mood` | 雰囲気で色を変える（`MoodTheme`）。雰囲気がないときは `kit-ui` の緑 | `kit-ui` の緑（`YorisoiTheme`）。アイコンの枠も同じ緑で、見分けは絵 |
| 画面 | 各アプリ | 地図が主役 | 止まっているときは地図が主役、走行中は暗い画面 |

**仕組みは共有し、値と判断はアプリが持つ**。これが分け方の決まりです（platform の [ADR-ECOSYSTEM-PLATFORM](https://github.com/duwenji/yorisoi-platform/blob/main/docs/decisions/ADR-ECOSYSTEM-PLATFORM.md) E-4・E-7）。

## 移すのは、2 本目が使う直前に

キットの多くは、最初から platform にあったわけではありません。`kit-channel` の中身（`ChannelSync`・`Producer`・`Cues` など）は、もともと散策ガイドのアプリの中にありました。[第 5 部の最初](01-jvm-library.md)で見た `core-format` の切り出しと同じく、あとから移したものです。

移す時期には決まりがあります（E-4）。

> アプリにあったコードは、2 本目のアプリ（CycleGuide）が使う段階の前に、使うものから移す。移すときに散歩だけの前提（間隔の値・散歩の記録・散歩の状態）を外し、値はアプリが持つ。

1 本目しかないうちに「共通になりそうだから」と先に部品にすると、散歩だけの前提を部品に閉じ込めたまま固めてしまいがちです。2 本目が本当に使う段になって初めて、何が共通で何が散歩だけのものかが見えます。そこで CycleGuide の設計では、移すものを段階ごとに表にしています（[architecture.md の「platform に移すもの」](https://github.com/duwenji/yorisoi-cycleguide/blob/main/docs/architecture.md)）。その中で、移すたびに **散歩だけの前提を引数に変えて** います。

| 移したもの | 散歩だけの前提 | 引数にしたもの |
|---|---|---|
| `StationRepository` | 散策ガイドの設定（`GuideSettings`）を読んでいた | 選んだチャンネル（`ChannelChoice`）の流れを受け取る（[2-2](../02-compose/02-state-viewmodel.md)） |
| `ChannelSync` | 散策ガイドの機能の一覧（`SanpoProfile`）を読んでいた | アプリの種類と機能（`AppProfile`）を受け取る |
| `Producer` | 散歩の出来事（`TalkEvent`）や散歩の状態を読んでいた | 汎用の文脈（`MaterialContext`）。散歩の題材はアプリが足す（[4-3](../04-outside/03-ai.md) の `PoiSubject`） |
| `SessionRecorder` | 出来事の名前が `walk_start`・`walk_end` だった | 始まりと終わりの名前を受け取る（散策ガイドは `walk_start` のまま） |
| `WeatherChangeDetector` | 設定のしきい値（`Thresholds`）を読んでいた | 先を見る時間と強い雨の量を受け取る（[3-4](../03-walk/04-maybe-talk.md)） |
| `SpotRepository` | いつも現在地の周りを探していた | 探す中心を決める関数（`searchCenter`）を受け取る。渡さなければ今までどおり |

移したあとは、**まず散策ガイドを新しいキットに上げて、散策ガイドの動きが変わらないことを確かめて** から、CycleGuide で使います。[5-1](01-jvm-library.md) の「動きを変えずに切り出す」と同じ進め方です。

## アプリの違いを引数にする: AppProfile

チャンネルを取り込むとき、`ChannelSync` は「このアプリで、このチャンネルを使えるか」を確かめます。チャンネルによっては、散歩でしか使えないスロットや見せ方を使っているからです。その判断に使うのが `AppProfile` です。

```kotlin
// 散策ガイド（SanpoProfile.kt）
val FEATURES: Set<Feature> = Feature.entries.toSet() - Feature.PRESENT_PLAY - Feature.PRESENT_AMBIENT
fun of(versionCode: Int) = AppProfile(AppIds.SANPOGUIDE, Activity.WALK, FEATURES, versionCode)

// CycleGuide（CycleProfile.kt）
val FEATURES: Set<Feature> = setOf(Feature.SLOT_GUIDE, Feature.SLOT_COMPANION, Feature.TRIGGER_SPOT, Feature.TRIGGER_POINT, Feature.PRESENT_SPEAK)
fun of(versionCode: Int) = AppProfile(AppIds.CYCLEGUIDE, Activity.CYCLE, FEATURES, versionCode)
```

- 散策ガイドは、録音の音声（第 2 段）以外のほとんどの機能を持つ
- CycleGuide は、解説と話しかけのスロット、スポットと地点のきっかけ、**読み上げ** だけ。走行中は画面を見せないので、カードや画像の見せ方は持たない
- 過ごし方（`Activity.WALK`・`Activity.CYCLE`）が、チャンネルの `activities` と合うかも確かめる

`ChannelSync` は「散策ガイドなら」「CycleGuide なら」と分岐を書きません。受け取った `AppProfile` と、チャンネルが使う機能を比べるだけです。3 本目のアプリが来ても、`ChannelSync` は直さずに済みます。管理システムも、同じ機能の一覧（yorisoi-console の [ecosystem.ts](https://github.com/duwenji/yorisoi-console/blob/main/packages/protocol/src/ecosystem.ts)）を持っていて、どのアプリでそのチャンネルを使えるかを一覧に書きます。

## 判断の仕組みは共有、判断の中身はアプリ

[3-4](../03-walk/04-maybe-talk.md) で、散策ガイドの `TalkDecider` が「ルールの並び」で何を話すかを決めるのを見ました。上から順に聞き、ゲートが開いているルールのうち最初に答えたものを話す、という仕組みは、kit-companion の [TalkEngine.kt](https://github.com/duwenji/yorisoi-platform/blob/main/kit-companion/src/main/kotlin/io/github/duwenji/yorisoi/kit/companion/TalkEngine.kt) にあります。

```kotlin
class TalkEngine<S : TalkGates<G>, D : Any, G>(val rules: List<TalkRule<S, D, G>>, private val nothing: D) {
    fun decide(situation: S): D {
        for (rule in rules) {
            if (rule.gates.all(situation::isOpen)) rule.decide(situation)?.let { return it }
        }
        return nothing
    }
}
```

型の引数が 3 つあります。`S` は場面（散歩の `TalkSituation`、走行の `RideSituation`）、`D` は決めたこと（`TalkDecision`・`RideDecision`）、`G` はゲートの種類です。**エンジンはどれの中身も知りません**。ゲートの種類さえ、アプリが決めます。

CycleGuide の [RideDecider.kt](https://github.com/duwenji/yorisoi-cycleguide/blob/main/app/src/main/java/io/github/duwenji/yorisoi/cycleguide/companion/RideDecider.kt) は、自分のゲートとルールを並べます。

| ゲート | 開いている条件 |
|---|---|
| `NOT_QUIET` | 止まっている。または、信号から 30m より離れていて、走り方の「話さない速さ」より遅い |
| `SPOT_GAP` | 前の見どころの話から、間隔が過ぎた |
| `CHAT_GAP` | 前の話から、雑談の間隔が過ぎた |
| `NOT_SWITCHED` | チャンネルを切り替えてから 1 分が過ぎた |

ルールは、天気の急変と日の入り（安全なのでゲートなし）、切り替えた直後の一言、前方の見どころ、きっかけの地点、取っておいた話、施設、休憩、距離の区切り、の順です。散歩の `TalkDecider` と並びはよく似ていますが、「信号の近くでは話さない」「前方の見どころに、着く前に話し終える」「話しきれない話は止まるまで取っておく」は自転車だけのものです。

## 同じ部品を、違う使い方で

キットは、使う側が引数で振る舞いを選べるように作っています。

| 部品 | 散策ガイド | CycleGuide |
|---|---|---|
| `SpotRepository` の `searchCenter` | 渡さない（現在地） | 進む向きに「前方を探す距離」の半分進んだ点 |
| `SpotRepository` の `signals` | 渡さない（取らない） | `true`。信号の位置も取り、話さない場面に使う |
| `SpotMap` の `fitWalked` | 使わない | 前回の走行の、走った道の全体を映す（[4-2](../04-outside/02-map.md)） |
| `SessionRecorder` の出来事の名前 | `walk_start`・`walk_end` | `ride_start`・`ride_end` |
| `OkHttpProviderHttp` の名乗り | `SanpoGuide/<版>` | `CycleGuide/<版>` |

既定値を「今までどおり」にしておけば、散策ガイドは何も変えずに済みます。CycleGuide のために足した引数が、散策ガイドの動きを変えないことは、散策ガイドのテストで確かめます。

## 共有の部品を直す怖さ

キットを直すと、使っている **すべての** アプリに効きます。散策ガイドのために直したつもりが、CycleGuide を壊すかもしれません。

| 守り | 仕組み |
|---|---|
| アプリは版を固定して使う | キットの新しい版が出ても、アプリは自分で版を上げて確かめるまで前の版のまま（[5-3](03-publish.md)） |
| 手元で、両方のアプリをキットのソースで確かめる | composite build（`-Pyorisoi.platformDir=../yorisoi-platform`、[1-2](../01-kotlin-android/02-gradle.md)）で、公開する前に両方のテストを流す |
| 判断は場面のテストで守る | `TalkDeciderTest`・`RideDeciderTest` は、エンジンの変更も見張る |

ハンズオンで、共有のエンジンを壊したときに何が起きるかを見てみましょう。

## ハンズオン: 共有の判断エンジンを壊して、2 つのアプリで確かめる

yorisoi-platform・yorisoi-sanpoguide・yorisoi-cycleguide の 3 つのリポジトリを、同じ親フォルダに置いておきます（[0-3](../00-overview/03-setup.md)）。

### 1. CycleGuide の判断のテストを流す

```sh
cd ../yorisoi-cycleguide
./gradlew -Pyorisoi.platformDir=../yorisoi-platform :app:testDebugUnitTest --tests '*RideDeciderTest*'
```

`BUILD SUCCESSFUL` になります。16 件の場面のテストです。

### 2. エンジンからゲートを外す

platform の [TalkEngine.kt](https://github.com/duwenji/yorisoi-platform/blob/main/kit-companion/src/main/kotlin/io/github/duwenji/yorisoi/kit/companion/TalkEngine.kt) の `decide` の中の、

```kotlin
if (rule.gates.all(situation::isOpen)) rule.decide(situation)?.let { return it }
```

を、ゲートを見ない形に変えます。

```kotlin
rule.decide(situation)?.let { return it }
```

### 3. 3 か所でテストを流す

```sh
cd ../yorisoi-platform
./gradlew :kit-companion:test
cd ../yorisoi-sanpoguide
./gradlew -Pyorisoi.platformDir=../yorisoi-platform :app:testDebugUnitTest --tests '*TalkDeciderTest*'
cd ../yorisoi-cycleguide
./gradlew -Pyorisoi.platformDir=../yorisoi-platform :app:testDebugUnitTest --tests '*RideDeciderTest*'
```

| どこで | 結果 | 落ちるテストの例 |
|---|---|---|
| platform の `TalkEngineTest` | 11 件のうち 2 件 | a closed gate means the rule isn't even asked |
| 散策ガイドの `TalkDeciderTest` | 21 件のうち 7 件 | no spot talk out of reach, twice on one walk, while standing, right after a switch or too soon |
| CycleGuide の `RideDeciderTest` | 16 件のうち 5 件 | near a light or at speed only safety speaks |

エンジンの 1 行が、2 つのアプリの「話してはいけない場面」を同時に壊しました。CycleGuide では「信号の近くや速いときは、安全の知らせ以外を話さない」が破れています。自転車では、事故につながりかねない壊れ方です。

platform の自分のテストだけでも気づけますが、**どの場面がどう壊れるか** は、使う側の場面のテストで初めて分かります。共有の部品を直すときは、使っているアプリのテストまで流してから公開します。

### 4. 元に戻す

```sh
cd ../yorisoi-platform
git checkout -- kit-companion/src/main/kotlin/io/github/duwenji/yorisoi/kit/companion/TalkEngine.kt
git status
```

## つまずきやすいところ

- **1 本目しかないうちに、共通の部品を作りすぎない**: 2 本目が使う直前に移すと、何が共通かが見えている
- **移すときは、前提を引数にする**: アプリの設定や状態を部品の中で読まない。既定値は「今までどおり」に
- **アプリの名前で分岐しない**: 「CycleGuide なら」と書かず、`AppProfile` のような機能の一覧で比べる。3 本目でも直さずに済む
- **共有の部品を直したら、使っている全部のアプリで確かめる**: composite build で、公開する前に

## 確認問題

<details>
<summary>問 1. <code>ChannelSync</code> を <code>kit-channel</code> に移すとき、<code>SanpoProfile</code> を読むのをやめて <code>AppProfile</code> を受け取るようにしたのはなぜですか。</summary>

`SanpoProfile` は散策ガイドの機能の一覧で、散策ガイドだけの前提だからです。`AppProfile` を引数で受け取れば、CycleGuide は自分の `CycleProfile` を渡すだけで、同じ `ChannelSync` でチャンネルを確かめられます。`ChannelSync` の中に「どのアプリか」の分岐を書かずに済み、3 本目のアプリでも直す必要がありません。

</details>

<details>
<summary>問 2. 「2 本目のアプリが使う段階の前に、使うものから移す」と決めているのはなぜですか。最初から全部をキットにしておけばよいのでは。</summary>

1 本目しかないうちは、何が共通で、何がそのアプリだけの前提かが見えにくいからです。早く部品にすると、散歩だけの前提（間隔の値・散歩の記録など）を部品の中に閉じ込めたまま固めてしまいがちです。2 本目が実際に使う直前に移せば、そのアプリの使い方と照らして、前提を引数に変えながら移せます。

</details>

<details>
<summary>問 3. ハンズオンで、platform の <code>TalkEngineTest</code> が落ちるのに、散策ガイドと CycleGuide のテストまで流したのはなぜですか。</summary>

エンジンのテストは「ゲートを見ているか」を確かめますが、それが散歩や走行のどの場面をどう壊すかまでは分からないからです。使う側の場面のテストで、「信号の近くで話してしまう」のような、利用者にとっての壊れ方が分かります。共有の部品を直すときは、使っている全部のアプリで確かめてから公開します。

</details>

---

前: [5-4 素材ときっかけ](04-materials-cues.md) ／ 次: [第 6 部 信頼の仕組み](../06-trust/01-why-signatures.md)（管理システム側から読むなら [7-1 TypeScript の文法](../07-typescript/01-typescript-syntax.md)）
