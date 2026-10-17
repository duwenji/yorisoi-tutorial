# 1-2 Gradle とビルド

[目次](../README.md) ＞ 第 1 部 ＞ 1-2

> Gradle の仕組みと最小のプロジェクトの作り方は [技術カード: Gradle](../ref/gradle.md) にあります。この章は、散策ガイドのビルドの設定を読みます。

## この章で学ぶこと

- 散策ガイドのビルドの設定ファイルが、それぞれ何を決めているか
- モジュール（アプリ・プロンプト・パック・コア・キット）の関係と、別のリポジトリの部品を使う方法
- 依存ライブラリの書き方と、版の決まり方（バージョンカタログ）
- 自分で作ったタスク（`channelIndex`）が何をしているか

## ビルドの設定ファイル

SanpoGuide のコードは 2 つのリポジトリに分かれています。アプリは `yorisoi-sanpoguide`、ほかの付き添いアプリとも共有する部品（コアとキット）は `yorisoi-platform` です。どちらも Gradle のプロジェクトで、設定ファイルの形は同じです。

```
yorisoi-sanpoguide/
├── settings.gradle.kts          どのモジュールがあるか、ライブラリをどこから取るか
├── build.gradle.kts             全体: プラグインの版
├── gradle.properties            Gradle の設定と、自分で決めた値
├── gradle/libs.versions.toml    依存ライブラリとプラグインの版の一覧（バージョンカタログ）
├── gradle/wrapper/              Gradle 本体の版（Gradle Wrapper）
├── gradlew, gradlew.bat         Gradle を動かす入口
├── app/build.gradle.kts         :app（Android アプリ）
└── prompts/build.gradle.kts     :prompts（プロンプト・パック、JVM ライブラリ）

yorisoi-platform/
├── settings.gradle.kts・build.gradle.kts・gradle.properties・gradle/ など（同じ形）
├── core-format/build.gradle.kts :core-format（コア、JVM ライブラリ）
├── core-prompt/build.gradle.kts :core-prompt（コア、JVM ライブラリ）
└── kit-voice/… など             :kit-*（キット。kit-companion 以外は Android ライブラリ）
```

ファイル名が `.kts` で終わるのは、設定を **Kotlin で書いている**（Kotlin DSL）からです。1-1 の文法がそのまま使えます。

> 共通の部品（コアとキット）は、付き添いアプリのエコシステム（[platform ADR-ECOSYSTEM-PLATFORM（旧 ADR-003）](https://github.com/duwenji/yorisoi-platform/blob/main/docs/decisions/ADR-ECOSYSTEM-PLATFORM.md)）のために、別のリポジトリ yorisoi-platform にあります（[5-1](../05-station-format/01-jvm-library.md)）。

## settings.gradle.kts: 全体の地図

[settings.gradle.kts](https://github.com/duwenji/yorisoi-sanpoguide/blob/main/settings.gradle.kts)（アプリ側。少し省略しています）:

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // The yorisoi platform. …
        if (gprUser != null && gprKey != null) {
            maven {
                url = uri("https://maven.pkg.github.com/duwenji/yorisoi-platform")
                credentials { username = gprUser; password = gprKey }
                content { includeGroup("io.github.duwenji.yorisoi") }
            }
        }
        mavenLocal {
            content { includeGroup("io.github.duwenji.yorisoi") }
        }
    }
}
rootProject.name = "SanpoGuide"
include(":app")
include(":prompts")

providers.gradleProperty("yorisoi.platformDir").orNull?.let { includeBuild(it) }
```

- `include(…)`: このリポジトリには **2 つのモジュール** がある。名前はフォルダに対応します（`:app` は `app/`）
- `repositories`: ライブラリを取ってくる場所。`google()` は Google の Maven リポジトリ（AndroidX など）、`mavenCentral()` は Java・Kotlin のライブラリの集積所です
- `maven { url = … }`: yorisoi-platform が公開した部品を取ってくる場所（GitHub Packages）。読むにはトークンが要ります（[0-3](../00-overview/03-setup.md)）。`content { includeGroup(…) }` で、ここから取るのは `io.github.duwenji.yorisoi` の部品だけ、と絞っています
- `mavenLocal()`: 手元の Maven（`~/.m2`）。yorisoi-platform で `publishToMavenLocal` したものを使えます
- `includeBuild(…)`: 下の「別のリポジトリの部品を、ソースのまま使う」で説明します
- `FAIL_ON_PROJECT_REPOS`: 取ってくる場所をここ 1 か所で決め、モジュールごとに勝手に足すのを禁止しています。どこからライブラリが来るかを把握しやすくするためです

| 種類 | モジュール | リポジトリ | 中身 |
|---|---|---|---|
| アプリ | `:app` | yorisoi-sanpoguide | 画面・散策のサービス・設定など、SanpoGuide そのもの |
| プロンプト・パック | `:prompts` | yorisoi-sanpoguide | SanpoGuide のプロンプトの文面と組み込みのチャンネル（素の JVM） |
| コア | `:core-format`・`:core-prompt` | yorisoi-platform | チャンネルの形式と確認、テンプレートの仕組み（素の JVM。アプリをまたいで使う） |
| キット | `:kit-voice`・`kit-llm`・`kit-geo`・`kit-mood`・`kit-companion` | yorisoi-platform | 音声・AI の呼び出し・地図と天気・雰囲気（Android のライブラリ）、話す判断のルールとゲート（`kit-companion` だけは素の JVM） |

## build.gradle.kts（全体）: プラグインの版

[build.gradle.kts](https://github.com/duwenji/yorisoi-sanpoguide/blob/main/build.gradle.kts):

```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.jvm) apply false
}
```

**プラグイン** は、Gradle に「Android アプリのビルドの仕方」「Kotlin のコンパイルの仕方」などを教える部品です。ここでは版だけを決め、`apply false`（ここでは使わない）としています。実際に使うのは各モジュールです。こうすると、モジュールの間で Kotlin の版がずれません。

`libs.plugins.…` は、版を `gradle/libs.versions.toml`（**バージョンカタログ**）から読む書き方です（下の「版を 1 か所に集める」）。

| プラグイン | 役割 | 使うモジュール |
|---|---|---|
| `com.android.application`（AGP） | Android アプリのビルド | アプリ |
| `com.android.library`（AGP） | Android のライブラリのビルド | キット（`kit-companion` を除く） |
| `org.jetbrains.kotlin.android` | Android 向けの Kotlin | アプリ・キット |
| `org.jetbrains.kotlin.plugin.compose` | Jetpack Compose のコンパイラ | アプリ・画面の部品を持つキット（`kit-geo`・`kit-mood`） |
| `org.jetbrains.kotlin.jvm` | 普通の JVM 向けの Kotlin | コア・プロンプト・パック・`kit-companion` |

## app/build.gradle.kts: アプリの設定

[app/build.gradle.kts](https://github.com/duwenji/yorisoi-sanpoguide/blob/main/app/build.gradle.kts) の中心部分です。

```kotlin
android {
    namespace = "io.github.duwenji.yorisoi.sanpoguide"
    compileSdk = 36

    defaultConfig {
        // The Google Play ID: fixed once uploaded. …
        applicationId = "io.github.duwenji.yorisoi.sanpoguide"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }
    // … signingConfigs・buildTypes（1-4 で見ます）…
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}
```

| 項目 | 値 | 意味 |
|---|---|---|
| `namespace` | `io.github.duwenji.yorisoi.sanpoguide` | `R`・`BuildConfig` のクラスが入る Kotlin のパッケージ。ソースのパッケージと同じにする |
| `applicationId` | `io.github.duwenji.yorisoi.sanpoguide` | 端末やストアでアプリを見分ける ID。**一度公開したら変えない** |
| `minSdk` | 26 | 動く最低の Android の版。26 は Android 8.0 |
| `targetSdk` | 36 | どの版の振る舞いに合わせて作ったか。36 は Android 16。Google Play は新しいアプリと更新にこの版を求める |
| `compileSdk` | 36 | コンパイルに使う Android の API の版 |
| `versionCode` | 1 | 更新のたびに増やす整数。端末は大きい方を新しいと判断する。管理システムは、アプリが対応した機能（素材の段など）をこの値で見分ける |
| `versionName` | `1.0.0` | 人に見せる版 |
| `buildConfig = true` | — | `BuildConfig.VERSION_CODE`・`BuildConfig.DEBUG` などをコードから使えるようにする |

`applicationId` は、逆さにしたドメイン名で、世界で重ならない名前にします。Android Studio の雛形が入れる `com.example.…` は仮の名前で、Google Play には上げられません。散策ガイドは、自分の GitHub のアドレス（`duwenji.github.io`）を逆さにした `io.github.duwenji` の下に、エコシステムの名前 `yorisoi` とアプリの名前を続けた `io.github.duwenji.yorisoi.sanpoguide` にしています。`namespace`・Kotlin のパッケージ・プロンプト・パックの公開の名前（[5-3](../05-station-format/03-publish.md)）も同じ名前に揃えています（ADR-003 E-22）。`io.github.yorisoi` にしないのは、github.com/Yorisoi が別の人のアカウントで、その名前空間は自分のものではないからです。`applicationId` は公開後に変えられません。パッケージ名は後からでも変えられますが、使う人が増えるほど手間が増えるので、最初に揃えておきます。

`minSdk = 26` は、第 6 部で何度も出てきた「Android 8 から動かしたい」の正体です。Ed25519 のために Tink を入れた（[技術カード: Tink](../ref/tink.md)）のも、base64url に `java.util.Base64` を使える（API 26 から）のも、この値が決めています。

`BuildConfig` は第 6 部にも出てきました。`ThirdPartyChannels` が `appVersion = BuildConfig.VERSION_CODE`（`minAppVersions` との比較）と、`allowLocalHttp = BuildConfig.DEBUG`（デバッグビルドだけ `http://localhost` を許す）に使っています。

## 依存ライブラリ

```kotlin
dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.okhttp)
    implementation(libs.anthropic.java)
    implementation(project(":prompts"))
    implementation(libs.yorisoi.kit.voice)
    // … kit-llm・kit-geo・kit-mood・kit-companion
    implementation(libs.tink.android)
    // …

    testImplementation(libs.junit)
    // The real org.json; Android's is a stub in local unit tests.
    testImplementation(libs.json)
}
```

`libs.okhttp` のような名前は、バージョンカタログの `[libraries]` に書いた 1 行を指しています。

```toml
# gradle/libs.versions.toml
[versions]
okhttp = "4.12.0"
json = "20240303"

[libraries]
okhttp = { module = "com.squareup.okhttp3:okhttp", version.ref = "okhttp" }
```

### 書き方: `グループ:名前:版`

`com.squareup.okhttp3:okhttp` と版 `4.12.0` を合わせた `com.squareup.okhttp3:okhttp:4.12.0` は、「`com.squareup.okhttp3` という組織の `okhttp` というライブラリの 4.12.0」という意味です。カタログを使わずに `implementation("com.squareup.okhttp3:okhttp:4.12.0")` と直接書くこともできます（管理システムの `validator` はこの書き方です）。Gradle は `settings.gradle.kts` に書いた場所からこれを探して取ってきます。

### 依存の種類（configuration）

| 書き方 | いつ使うか | 例 |
|---|---|---|
| `implementation` | アプリ本体のコンパイルと実行 | OkHttp、Tink |
| `debugImplementation` | デバッグビルドだけ | Compose のプレビューの道具 |
| `testImplementation` | 単体テストだけ | JUnit、本物の `org.json` |
| `compileOnly` | コンパイルのときだけ。配らない | コアの `org.json`（下で説明） |

`testImplementation("org.json:json:…")` のコメントに注目してください。Android の `org.json` は端末の中にありますが、パソコンで流す単体テストでは **中身のない代役（stub）** になっていて、呼ぶとエラーになります。そこで、テストのときだけ本物を入れています。

### 版を決める: BOM

Compose のライブラリには版が書いてありません（カタログの `compose-ui = { module = "androidx.compose.ui:ui" }`）。代わりに `platform(libs.compose.bom)`（`androidx.compose:compose-bom:2025.06.00`）があります。**BOM**（Bill of Materials）は「互いに組み合わせて動くことを確かめた版の一覧」です。BOM の版を 1 つ決めれば、Compose の各ライブラリの版が決まります。

実際にどの版になったかは、ハンズオンで確かめます（`ui -> 1.8.2` のように表示されます）。

### 版の衝突を直す

```kotlin
// A dependency pulls in a Fragment older than 1.3, too old for the ActivityResult API
// (lint fails release builds with InvalidFragmentVersionForActivityResult).
implementation(libs.androidx.fragment)   // androidx.fragment:fragment:1.8.8
```

アプリは Fragment を直接使っていません。でも、ほかのライブラリが **古い Fragment を連れてくる**（推移的依存）ため、リリースビルドの検査（lint）が失敗しました。そこで、新しい版を明示して上書きしています。依存ライブラリは、さらに別のライブラリに依存していることを覚えておいてください。

### 版を 1 か所に集める: バージョンカタログ

モジュールが増えると、同じライブラリ（OkHttp や `org.json`）を何か所にも書くことになり、版がずれやすくなります。そこで、版を [gradle/libs.versions.toml](https://github.com/duwenji/yorisoi-sanpoguide/blob/main/gradle/libs.versions.toml) にまとめ、どのモジュールも `libs.…` の名前で参照しています。版を上げるときは、このファイルの 1 行を直すだけです。

### モジュールへの依存と、別のリポジトリの部品への依存

`implementation(project(":prompts"))` は、**同じリポジトリ** のプロンプト・パックに依存するという意味です。アプリをビルドすると、先にプロンプト・パックがビルドされます。

一方、`implementation(libs.yorisoi.kit.voice)` は、**別のリポジトリ（yorisoi-platform）が公開した部品** への依存です。カタログには、ほかのライブラリと同じ形で書いてあります。

```toml
# gradle/libs.versions.toml
[versions]
yorisoi = "1.0.0"

[libraries]
yorisoi-kit-voice = { module = "io.github.duwenji.yorisoi:kit-voice", version.ref = "yorisoi" }
yorisoi-core-format = { module = "io.github.duwenji.yorisoi:core-format", version.ref = "yorisoi" }
```

アプリから見ると、yorisoi-platform の部品は OkHttp と同じ「外のライブラリ」です。版（`yorisoi = "1.0.0"`）を固定して使うので、yorisoi-platform が変わっても、アプリは自分の都合の良いときに版を上げられます。

プロンプト・パックは、コアに `api` で依存しています。

```kotlin
// prompts/build.gradle.kts
dependencies {
    api(libs.yorisoi.core.format)
    api(libs.yorisoi.core.prompt)
}
```

`implementation` で依存したものは、自分を使う側からは見えません。`api` にすると、自分を使う側（アプリ）からも見えます。プロンプト・パックの関数は、引数や戻り値にコアの型（`StationPackage` など）を使うので、使う側にもコアが見えていなければなりません。だから `api` です。

### 別のリポジトリの部品を、ソースのまま使う: composite build

キットを直しながらアプリで試したいとき、毎回 yorisoi-platform で公開してから版を上げるのは手間です。そこで、**composite build**（複合ビルド）を使います。`settings.gradle.kts` の最後の行です。

```kotlin
providers.gradleProperty("yorisoi.platformDir").orNull?.let { includeBuild(it) }
```

`-Pyorisoi.platformDir=../yorisoi-platform` を付けて Gradle を動かすと、`includeBuild` で yorisoi-platform のプロジェクトがビルドに加わります。yorisoi-platform のモジュールは、`group`（`io.github.duwenji.yorisoi`）と名前（`kit-voice` など）が公開の座標と同じなので、Gradle は **公開の版の代わりに、隣のフォルダのソースを自動で使います**。

```sh
cd /c/Dev/apps/yorisoi-sanpoguide
./gradlew :app:assembleDebug -Pyorisoi.platformDir=../yorisoi-platform
```

CI ではこの値を設定しません。CI は常に、公開された版で確かめます。

## コアの build.gradle.kts: JVM ライブラリ

[core-format/build.gradle.kts](https://github.com/duwenji/yorisoi-platform/blob/main/core-format/build.gradle.kts)（yorisoi-platform）は、Android ではなく **普通の JVM のライブラリ** の設定です。

```kotlin
plugins {
    alias(libs.plugins.kotlin.jvm)
}

description = "Channel and collection package formats, … Requires org.json on the classpath."

dependencies {
    // Android ships org.json; bundling the jar into the app would clash with it
    // (lint: DuplicatePlatformClasses). Other users add it themselves.
    compileOnly(libs.json)
    // …
}
```

- `kotlin.jvm` プラグインなので、Android の SDK がなくてもビルド・テストできます（[0-3](../00-overview/03-setup.md) で最初に流したのはこれです）
- `org.json` は `compileOnly`: Android は `org.json` を標準で持っているので、ライブラリに同梱すると重複して lint に叱られます。使う側（管理システムの `validator`）が自分で足します
- `group`・`version`・公開の設定は、モジュールごとには書かず、yorisoi-platform の全体の [build.gradle.kts](https://github.com/duwenji/yorisoi-platform/blob/main/build.gradle.kts) の `subprojects { … }` でまとめて決めています。版は [gradle.properties](https://github.com/duwenji/yorisoi-platform/blob/main/gradle.properties) の `yorisoiVersion`（すべてのモジュールで 1 つ）です。公開の仕組みは [5-3](../05-station-format/03-publish.md) で見ます

アプリ側の [gradle.properties](https://github.com/duwenji/yorisoi-sanpoguide/blob/main/gradle.properties):

```properties
org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8
android.useAndroidX=true
# …
sanpoguidePromptsVersion=1.0.0
```

`sanpoguidePromptsVersion` はプロンプト・パックの公開の版です。アプリの版（`1.0.0`）とは別に管理しています。

### 自分で作ったタスク: channelIndex

プロンプト・パックの [build.gradle.kts](https://github.com/duwenji/yorisoi-sanpoguide/blob/main/prompts/build.gradle.kts) には、自分で作ったタスクがあります。

```kotlin
// A jar (or the APK) can't list a resource folder, so the built-in channels come with a list of
// their files (BuiltInChannels.INDEX).
val channelsDir = layout.projectDirectory.dir("src/main/resources/sanpoguide/channels")
val channelIndexDir = layout.buildDirectory.dir("generated/channel-index")
val channelIndex by tasks.registering {
    inputs.dir(channelsDir)
    outputs.dir(channelIndexDir)
    doLast {
        // channels/ の下のファイルの一覧を index.txt に書き出す
    }
}
sourceSets.main {
    resources.srcDir(channelIndex)
}
```

組み込みのチャンネルのファイルは、jar や APK の中に「リソース」として入ります。ところが、実行時に **リソースのフォルダの中身を一覧することはできません**。そこで、ビルドのときにファイルの一覧（`index.txt`）を作って一緒に入れ、実行時はそれを読みます。

- `inputs.dir`・`outputs.dir`: このタスクが何を読んで何を書くかを Gradle に教えています。入力が変わっていなければ、Gradle はタスクを飛ばします（`UP-TO-DATE`）
- `resources.srcDir(channelIndex)`: タスクの出力をリソースに加えます。こう書くと、リソースを処理する前に必ず `channelIndex` が走ります。タスクの順番を手で決めなくてよいのです

## ハンズオン: ビルドの中をのぞく

### 1. モジュールの一覧

```sh
cd /c/Dev/apps/yorisoi-sanpoguide
./gradlew projects
```

```
Root project 'SanpoGuide'
+--- Project ':app'
\--- Project ':prompts'
```

yorisoi-platform で同じことをすると、コアとキットの 7 つが出ます。

```sh
cd ../yorisoi-platform && ./gradlew projects && cd ../yorisoi-sanpoguide
```

### 2. アプリが使うライブラリと、実際の版

```sh
./gradlew :app:dependencies --configuration releaseRuntimeClasspath | grep -E '^[+\\]--- '
```

```
+--- org.jetbrains.kotlin:kotlin-stdlib:2.2.0
+--- androidx.compose:compose-bom:2025.06.00
+--- androidx.compose.ui:ui -> 1.8.2
+--- androidx.compose.material3:material3 -> 1.3.2
…
+--- com.anthropic:anthropic-java:2.34.0
+--- project :prompts
+--- io.github.duwenji.yorisoi:kit-voice:1.0.0
…
+--- io.github.duwenji.yorisoi:kit-companion:1.0.0
+--- com.google.crypto.tink:tink-android:1.23.0
\--- com.google.android.gms:play-services-code-scanner:16.1.0
```

`ui -> 1.8.2` が、BOM が決めた版です。`grep` を外すと、それぞれのライブラリが連れてくるライブラリまで木の形で全部見えます（とても長いです）。

同じコマンドに `-Pyorisoi.platformDir=../yorisoi-platform` を付けると、yorisoi の部品が `io.github.duwenji.yorisoi:kit-voice:1.0.0 -> project :yorisoi-platform:kit-voice` のように、ソースに置き換わったことが分かります。

### 3. 自分で作ったタスクを動かす

```sh
./gradlew :prompts:channelIndex
head -5 prompts/build/generated/channel-index/sanpoguide/channels/index.txt
```

```
gourmet/channel.json
gourmet/prompts/companion/persona.md
gourmet/prompts/companion/topics.md
gourmet/prompts/guide/focus.md
gourmet/prompts/guide/persona.md
```

もう一度 `./gradlew :prompts:channelIndex --console=plain` を実行すると、今度は `> Task :prompts:channelIndex UP-TO-DATE` と表示され、何もしません。入力が変わっていないからです。

### 4. デバッグ版の APK を作る

```sh
./gradlew :app:assembleDebug
ls -la app/build/outputs/apk/debug/
```

`app-debug.apk` ができます（40MB 近くあります）。エミュレータや実機にそのまま入れるには `./gradlew installDebug` です。

### 5. キットをソースに差し替えて試す

```sh
./gradlew :app:assembleDebug -Pyorisoi.platformDir=../yorisoi-platform
```

yorisoi-platform のモジュールも一緒にビルドされます（`> Task :yorisoi-platform:kit-voice:…` のような行が出ます）。キットを直してアプリで試すときは、この形で動かします。

## つまずきやすいところ

- **Gradle の同期を待つ**: Android Studio で設定ファイルを変えたら、上に出る「Sync Now」を押します。同期が終わるまで、コードの補完やエラー表示が正しくありません
- **版を上げるときは BOM ごと**: Compose の個々のライブラリの版を BOM と別に指定すると、組み合わせが崩れることがあります
- **`applicationId` を変えない**: 変えると、端末からは別のアプリに見え、更新ではなく新しいアプリとして入ります
- **版はカタログで**: モジュールの `build.gradle.kts` に版を直接書くと、モジュールごとに版がずれていきます
- **yorisoi の部品が見つからない**（`Could not find io.github.duwenji.yorisoi:…`）: GitHub Packages のトークン（`gpr.user`・`gpr.key`）がないか、yorisoi-platform をまだ `publishToMavenLocal` していません（[0-3](../00-overview/03-setup.md)）

## 確認問題

<details>
<summary>問 1. コア（<code>core-format</code>）が Android のプラグインではなく <code>kotlin.jvm</code> を使うのはなぜですか。</summary>

管理システムの機械審査（普通の JVM で動く Lambda）でも同じライブラリを使うためです。Android に依存しないので、Android の SDK がなくてもビルド・テストでき、JVM のどこでも使えます。

</details>

<details>
<summary>問 2. 単体テストに <code>testImplementation("org.json:json:…")</code> を足しているのはなぜですか。</summary>

パソコンで流す単体テストでは、Android の `org.json` が中身のない代役（stub）になっていて使えないからです。テストのときだけ本物の `org.json` を入れています。

</details>

<details>
<summary>問 3. <code>minSdk</code> を 33（Android 13）に上げたら、散策ガイドのどこが簡単になりますか。</summary>

Ed25519 を Android の標準の暗号機能で扱えるようになるので、Tink がなくても署名を確かめられます（コアの `JcaEd25519` を使える）。その代わり、Android 8〜12 の端末では動かなくなります。

</details>


<details>
<summary>問 4. プロンプト・パックがコアに <code>implementation</code> ではなく <code>api</code> で依存しているのはなぜですか。</summary>

プロンプト・パックの関数が、引数や戻り値にコアの型を使うからです。`implementation` だと、プロンプト・パックを使うアプリからコアの型が見えず、その関数を呼べません。`api` にすると、使う側にもコアが見えます。

</details>

---

前: [1-1 Kotlin の文法](01-kotlin-syntax.md) ／ 次: [1-3 Android アプリの部品](03-android-components.md)
