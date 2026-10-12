# 1-2 Gradle とビルド

[目次](../README.md) ＞ 第 1 部 ＞ 1-2

> Gradle の仕組みと最小のプロジェクトの作り方は [技術カード: Gradle](../ref/gradle.md) にあります。この章は、散策ガイドのビルドの設定を読みます。

## この章で学ぶこと

- 散策ガイドのビルドの設定ファイルが、それぞれ何を決めているか
- 2 つのモジュール（`:app` と `:station-format`）の関係
- 依存ライブラリの書き方と、版の決まり方
- 自分で作ったタスク（`channelIndex`）が何をしているか

## ビルドの設定ファイル

```
SanpoGuide/
├── settings.gradle.kts          どのモジュールがあるか、ライブラリをどこから取るか
├── build.gradle.kts             全体: プラグインの版
├── gradle.properties            Gradle の設定と、自分で決めた値
├── gradle/wrapper/              Gradle 本体の版（Gradle Wrapper）
├── gradlew, gradlew.bat         Gradle を動かす入口
├── app/build.gradle.kts         :app（Android アプリ）の設定
└── station-format/build.gradle.kts   :station-format（JVM ライブラリ）の設定
```

ファイル名が `.kts` で終わるのは、設定を **Kotlin で書いている**（Kotlin DSL）からです。1-1 の文法がそのまま使えます。

## settings.gradle.kts: 全体の地図

[settings.gradle.kts](../../SanpoGuide/settings.gradle.kts):

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
    }
}
rootProject.name = "SanpoGuide"
include(":app")
include(":station-format")
```

- `include(":app")`・`include(":station-format")`: このリポジトリには **2 つのモジュール** がある。`:` で始まる名前は、フォルダの名前に対応します
- `repositories`: ライブラリを取ってくる場所。`google()` は Google の Maven リポジトリ（AndroidX など）、`mavenCentral()` は Java・Kotlin のライブラリの集積所です
- `FAIL_ON_PROJECT_REPOS`: 取ってくる場所をここ 1 か所で決め、モジュールごとに勝手に足すのを禁止しています。どこからライブラリが来るかを把握しやすくするためです

## build.gradle.kts（全体）: プラグインの版

[build.gradle.kts](../../SanpoGuide/build.gradle.kts):

```kotlin
plugins {
    id("com.android.application") version "8.11.1" apply false
    id("org.jetbrains.kotlin.android") version "2.2.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.0" apply false
    id("org.jetbrains.kotlin.jvm") version "2.2.0" apply false
}
```

**プラグイン** は、Gradle に「Android アプリのビルドの仕方」「Kotlin のコンパイルの仕方」などを教える部品です。ここでは版だけを決め、`apply false`（ここでは使わない）としています。実際に使うのは各モジュールです。こうすると、2 つのモジュールで Kotlin の版がずれません。

| プラグイン | 役割 | 使うモジュール |
|---|---|---|
| `com.android.application`（AGP） | Android アプリのビルド | `:app` |
| `org.jetbrains.kotlin.android` | Android 向けの Kotlin | `:app` |
| `org.jetbrains.kotlin.plugin.compose` | Jetpack Compose のコンパイラ | `:app` |
| `org.jetbrains.kotlin.jvm` | 普通の JVM 向けの Kotlin | `:station-format` |

## app/build.gradle.kts: アプリの設定

[app/build.gradle.kts](../../SanpoGuide/apps/sanpoguide/app/build.gradle.kts) の中心部分です。

```kotlin
android {
    namespace = "io.github.duwenji.sanpoguide"
    compileSdk = 35

    defaultConfig {
        // The Google Play ID: fixed once uploaded. …
        applicationId = "io.github.duwenji.sanpoguide"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
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
| `namespace` | `io.github.duwenji.sanpoguide` | `R`・`BuildConfig` のクラスが入る Kotlin のパッケージ。ソースのパッケージと同じにする |
| `applicationId` | `io.github.duwenji.sanpoguide` | 端末やストアでアプリを見分ける ID。**一度公開したら変えない** |
| `minSdk` | 26 | 動く最低の Android の版。26 は Android 8.0 |
| `targetSdk` | 35 | どの版の振る舞いに合わせて作ったか。35 は Android 15 |
| `compileSdk` | 35 | コンパイルに使う Android の API の版 |
| `versionCode` | 2 | 更新のたびに増やす整数。端末は大きい方を新しいと判断する。素材の第 1 段を出したときに 1 から 2 にした |
| `versionName` | `0.2.0` | 人に見せる版 |
| `buildConfig = true` | — | `BuildConfig.VERSION_CODE`・`BuildConfig.DEBUG` などをコードから使えるようにする |

`applicationId` は、逆さにしたドメイン名で、世界で重ならない名前にします。Android Studio の雛形が入れる `com.example.…` は仮の名前で、Google Play には上げられません。散策ガイドは Play に上げる前に、自分の GitHub のアドレス（`duwenji.github.io`）を逆さにした `io.github.duwenji.sanpoguide` に変えました。あわせて `namespace`・Kotlin のパッケージ・`station-format` の公開の名前（[5-3](../05-station-format/03-publish.md)）も同じ名前に揃えています。`applicationId` は公開後に変えられませんが、パッケージ名は後からでも変えられます。ただ、使う人が増えるほど手間が増えるので、最初に揃えておきました。

`minSdk = 26` は、第 6 部で何度も出てきた「Android 8 から動かしたい」の正体です。Ed25519 のために Tink を入れた（[技術カード: Tink](../ref/tink.md)）のも、base64url に `java.util.Base64` を使える（API 26 から）のも、この値が決めています。

`BuildConfig` は第 6 部にも出てきました。`ThirdPartyChannels` が `appVersion = BuildConfig.VERSION_CODE`（`minAppVersion` との比較）と、`allowLocalHttp = BuildConfig.DEBUG`（デバッグビルドだけ `http://localhost` を許す）に使っています。

## 依存ライブラリ

```kotlin
dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.06.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.anthropic:anthropic-java:2.34.0")
    implementation(project(":station-format"))
    implementation("com.google.crypto.tink:tink-android:1.23.0")
    // …

    testImplementation("junit:junit:4.13.2")
    // The real org.json; Android's is a stub in local unit tests.
    testImplementation("org.json:json:20240303")
}
```

### 書き方: `グループ:名前:版`

`"com.squareup.okhttp3:okhttp:4.12.0"` は「`com.squareup.okhttp3` という組織の `okhttp` というライブラリの 4.12.0」という意味です。Gradle は `settings.gradle.kts` に書いた場所からこれを探して取ってきます。

### 依存の種類（configuration）

| 書き方 | いつ使うか | 例 |
|---|---|---|
| `implementation` | アプリ本体のコンパイルと実行 | OkHttp、Tink |
| `debugImplementation` | デバッグビルドだけ | Compose のプレビューの道具 |
| `testImplementation` | 単体テストだけ | JUnit、本物の `org.json` |
| `compileOnly` | コンパイルのときだけ。配らない | `:station-format` の `org.json`（下で説明） |

`testImplementation("org.json:json:…")` のコメントに注目してください。Android の `org.json` は端末の中にありますが、パソコンで流す単体テストでは **中身のない代役（stub）** になっていて、呼ぶとエラーになります。そこで、テストのときだけ本物を入れています。

### 版を決める: BOM

Compose のライブラリには版が書いてありません（`"androidx.compose.ui:ui"`）。代わりに `platform("androidx.compose:compose-bom:2025.06.00")` があります。**BOM**（Bill of Materials）は「互いに組み合わせて動くことを確かめた版の一覧」です。BOM の版を 1 つ決めれば、Compose の各ライブラリの版が決まります。

実際にどの版になったかは、ハンズオンで確かめます（`ui -> 1.8.2` のように表示されます）。

### 版の衝突を直す

```kotlin
// A dependency pulls in a Fragment older than 1.3, too old for the ActivityResult API
// (lint fails release builds with InvalidFragmentVersionForActivityResult).
implementation("androidx.fragment:fragment:1.8.8")
```

アプリは Fragment を直接使っていません。でも、ほかのライブラリが **古い Fragment を連れてくる**（推移的依存）ため、リリースビルドの検査（lint）が失敗しました。そこで、新しい版を明示して上書きしています。依存ライブラリは、さらに別のライブラリに依存していることを覚えておいてください。

### モジュールへの依存

`implementation(project(":station-format"))` は、同じリポジトリの `:station-format` モジュールに依存するという意味です。アプリをビルドすると、先に `:station-format` がビルドされます。

## station-format/build.gradle.kts: JVM ライブラリ

[station-format/build.gradle.kts](../../SanpoGuide/platform/core-format/build.gradle.kts) は、Android ではなく **普通の JVM のライブラリ** の設定です。

```kotlin
plugins {
    id("org.jetbrains.kotlin.jvm")
    `maven-publish`
}

group = "io.github.duwenji.sanpoguide"
version = providers.gradleProperty("stationFormatVersion").get()

dependencies {
    // Android ships org.json; bundling the jar into the app would clash with it
    // (lint: DuplicatePlatformClasses). Other users add it themselves.
    compileOnly("org.json:json:20240303")
    // …
}
```

- `kotlin.jvm` プラグインなので、Android の SDK がなくてもビルド・テストできます（[0-3](../00-overview/03-setup.md) で最初に流したのはこれです）
- `org.json` は `compileOnly`: Android は `org.json` を標準で持っているので、ライブラリに同梱すると重複して lint に叱られます。使う側（管理システムの `validator`）が自分で足します
- 版は `gradle.properties` の `stationFormatVersion` から読みます。アプリの版（`0.2.0`）とは別に管理しています
- `maven-publish` で GitHub Packages に公開します（[5-3](../05-station-format/03-publish.md)）

[gradle.properties](../../SanpoGuide/gradle.properties):

```properties
org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8
android.useAndroidX=true
# Version of :station-format as published to GitHub Packages …
stationFormatVersion=2.1.0
```

### 自分で作ったタスク: channelIndex

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
cd /c/Dev/apps/SanpoGuide
./gradlew projects
```

```
Root project 'SanpoGuide'
+--- Project ':app'
\--- Project ':station-format'
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
+--- project :station-format
+--- com.google.crypto.tink:tink-android:1.23.0
\--- com.google.android.gms:play-services-code-scanner:16.1.0
```

`ui -> 1.8.2` が、BOM が決めた版です。`grep` を外すと、それぞれのライブラリが連れてくるライブラリまで木の形で全部見えます（とても長いです）。

### 3. 自分で作ったタスクを動かす

```sh
./gradlew :station-format:channelIndex
head -5 station-format/build/generated/channel-index/sanpoguide/channels/index.txt
```

```
history/channel.json
history/prompts/companion/persona.md
history/prompts/companion/topics.md
history/prompts/guide/focus.md
history/prompts/guide/persona.md
```

もう一度 `./gradlew :station-format:channelIndex --console=plain` を実行すると、今度は `> Task :station-format:channelIndex UP-TO-DATE` と表示され、何もしません。入力が変わっていないからです。

### 4. デバッグ版の APK を作る

```sh
./gradlew :app:assembleDebug
ls -la app/build/outputs/apk/debug/
```

`app-debug.apk` ができます（40MB 近くあります）。エミュレータや実機にそのまま入れるには `./gradlew installDebug` です。

## つまずきやすいところ

- **Gradle の同期を待つ**: Android Studio で設定ファイルを変えたら、上に出る「Sync Now」を押します。同期が終わるまで、コードの補完やエラー表示が正しくありません
- **版を上げるときは BOM ごと**: Compose の個々のライブラリの版を BOM と別に指定すると、組み合わせが崩れることがあります
- **`applicationId` を変えない**: 変えると、端末からは別のアプリに見え、更新ではなく新しいアプリとして入ります

## 確認問題

<details>
<summary>問 1. <code>:station-format</code> が Android のプラグインではなく <code>kotlin.jvm</code> を使うのはなぜですか。</summary>

管理システムの機械審査（普通の JVM で動く Lambda）でも同じライブラリを使うためです。Android に依存しないので、Android の SDK がなくてもビルド・テストでき、JVM のどこでも使えます。

</details>

<details>
<summary>問 2. 単体テストに <code>testImplementation("org.json:json:…")</code> を足しているのはなぜですか。</summary>

パソコンで流す単体テストでは、Android の `org.json` が中身のない代役（stub）になっていて使えないからです。テストのときだけ本物の `org.json` を入れています。

</details>

<details>
<summary>問 3. <code>minSdk</code> を 33（Android 13）に上げたら、散策ガイドのどこが簡単になりますか。</summary>

Ed25519 を Android の標準の暗号機能で扱えるようになるので、Tink がなくても署名を確かめられます（`:station-format` の `JcaEd25519` を使える）。その代わり、Android 8〜12 の端末では動かなくなります。

</details>

---

前: [1-1 Kotlin の文法](01-kotlin-syntax.md) ／ 次: [1-3 Android アプリの部品](03-android-components.md)
