# 5-3 ライブラリを公開する

[目次](../README.md) ＞ 第 5 部 ＞ 5-3

> GitHub Actions の仕組みと最小の使い方は [技術カード: GitHub Actions](../ref/github-actions.md) にあります。

## この章で学ぶこと

- 別のリポジトリから使えるように、ライブラリを「公開」するとはどういうことか
- Maven の座標（グループ・名前・版）と、ライブラリの版の付け方
- `maven-publish` で GitHub Packages に公開する設定
- タグを押すと、GitHub Actions が確かめてから公開する流れ
- 使う側（管理システムの `validator`）が、公開されたライブラリを取ってくる設定
- 実際に起きた失敗（`./gradlew: Permission denied`）から学ぶこと

## なぜ公開するのか

同じリポジトリの中なら、アプリは `implementation(project(":apps:sanpoguide:prompts"))` でプロンプト・パック（とそれが連れてくるコア）を使えます（[1-2](../01-kotlin-android/02-gradle.md)、[5-1](01-jvm-library.md)）。でも管理システム（yorisoi-console）は **別のリポジトリ** です。`project(…)` では参照できません。

方法はいくつか考えられます。

| 方法 | 問題 |
|---|---|
| コードを写して持っていく | 写した瞬間から食い違い始める。同じコードを使う意味がない |
| Git のサブモジュールで取り込む | 両方のビルドの仕組みが絡み合い、版の管理も難しい |
| **ライブラリとして公開し、版を指定して使う** | 散策ガイドが選んだ方法 |

ライブラリを **パッケージのリポジトリ**（Maven リポジトリ）に置き、使う側は OkHttp や Tink と同じように `implementation("グループ:名前:版")` と書いて取ってきます。散策ガイドは、置き場所に **GitHub Packages**（GitHub が用意している Maven リポジトリ）を使っています。この決定は管理システムの ADR-001 の T-4 と、[RFC-001](../../SanpoGuide/docs/refactoring/RFC-001-prompts-to-station-format.md) の R-3、コアとプロンプト・パックに分けたあとの公開は [RFC-002](../../SanpoGuide/docs/refactoring/RFC-002-platform-stage1.md) の R-11 に記録されています。

## Maven の座標

ライブラリは 3 つの値で決まります。これを **座標** と呼びます。

```
io.github.duwenji.yorisoi : core-format : 2.0.0
└────── グループ ──────┘   └─ 名前 ──┘   └ 版 ┘
```

SanpoGuide が公開しているのは 3 つです（RFC-002 の R-11）。

| 座標 | モジュール | 版を決める値（`gradle.properties`） |
|---|---|---|
| `io.github.duwenji.yorisoi:core-format` | `:platform:core-format` | `yorisoiCoreVersion` |
| `io.github.duwenji.yorisoi:core-prompt` | `:platform:core-prompt` | `yorisoiCoreVersion`（コアの 2 つは同じ版） |
| `io.github.duwenji.sanpoguide:prompts` | `:apps:sanpoguide:prompts` | `sanpoguidePromptsVersion` |

グループが 2 つあるのは、コアがエコシステム（yorisoi）のもので、プロンプト・パックが SanpoGuide のものだからです。キット（Android のライブラリ）は公開しません。

[platform/core-format/build.gradle.kts](../../SanpoGuide/platform/core-format/build.gradle.kts):

```kotlin
group = "io.github.duwenji.yorisoi"
version = providers.gradleProperty("yorisoiCoreVersion").get()
```

名前は `publishing` の設定で `artifactId = "core-format"` と決めています（下で見ます）。

### 版はアプリと別に管理する

版は `gradle.properties` に書いています。

```properties
# Versions published to GitHub Packages (.github/workflows/publish.yml), independent of the app's.
# The core libraries (io.github.duwenji.yorisoi:core-format, core-prompt): bump when the formats
# or the template engine change, then push the tag yorisoi-core-v<version>.
yorisoiCoreVersion=2.0.0
# SanpoGuide's prompt pack (io.github.duwenji.sanpoguide:prompts): bump when the prompts or the
# built-in channels change, then push the tag sanpoguide-prompts-v<version> (after the core it uses).
sanpoguidePromptsVersion=2.0.0
```

アプリの版（`versionName = "0.3.0"`）とは **別** です。アプリの画面を直しても、コアもプロンプト・パックも変わらないので、版を上げる必要はありません。逆に、プロンプトの文面を直したら、アプリの版はそのままでもプロンプト・パックの版は上げます。管理システムの見本が、新しい文面で作られるようにするためです。コアとプロンプト・パックの版を分けたのも同じ理由で、プロンプトの文面を直すたびに、形式の確認（コア）の版まで上げずに済みます。

これまでの版:

| 座標 | 版 | 主な変更 |
|---|---|---|
| `core-format`・`core-prompt` | 1.0.0 | `station-format` 2.1.0 からコアを切り出した最初の版（RFC-002 手順 1） |
| 〃 | 1.1.0 | format 2（`activities`・`genres`・`requires`）、語彙、2 段の確かめ方、互換性の判定（API-003 2.0・API-002 1.4・API-004 1.5） |
| 〃 | 1.2.0 | アプリのプロファイルと、リストの値での絞り込み |
| 〃 | 1.3.0 | リストの `promotional`（宣伝の印、API-002 1.3。ADR-002 T-12） |
| 〃 | 2.0.0 | グループと Kotlin のパッケージを `io.github.duwenji.michizure` から `io.github.duwenji.yorisoi` に変えた（ADR-003 1.2 E-22）。中身は 1.3.0 と同じ |
| `prompts` | 1.0.0 | プロンプトと組み込みのチャンネルを切り出した最初の版（RFC-002 手順 1） |
| 〃 | 1.1.0 | 組み込みの 6 つのチャンネルを format 2 に |
| 〃 | 2.0.0 | 依存するコアを `io.github.duwenji.yorisoi` の 2.0.0 に |

コアの 1.x は、改名前のグループ `io.github.duwenji.michizure` で公開しました。エコシステムの名前は最初 michizure（道連れ）でしたが、「道連れにする」の悪い意味に取られるおそれがあるため、2026-10-13 に yorisoi（寄り添い）に改めました。パッケージの名前が変わると、使う側の `import` を書き直す必要があるので、互換性のない変更として最初の数字を上げています。

この前は 1 つのライブラリ `io.github.duwenji.sanpoguide:station-format` で、1.0.0（RFC-001）から 2.1.0 まで公開しました。2.0.0 はグループと Kotlin のパッケージを `com.example.sanpoguide` から `io.github.duwenji.sanpoguide` に変えた版です。`station-format` は 2.1.0 を最後に公開をやめています。

機能を足したら真ん中の数字を、互換性のない変更をしたら最初の数字を上げる、という決まり（セマンティック バージョニング）に近い付け方です。`station-format` 2.0.0 は、中身の動きは前と同じでもパッケージ名が変わったので、使う側は `import` と依存の座標を書き換えないとビルドできません。だから「互換性のない変更」として最初の数字を上げました。コアの 1.1.0〜1.3.0 は、どれも足しただけなので真ん中の数字です。

### 一度公開した版は変えない

一度公開した `1.2.0` の中身を、あとから差し替えてはいけません。使う側は「`1.2.0` はこの中身」と信じてビルドしているからです。直したいときは `1.2.1` や `1.3.0` を出します。RFC-001 の「戻し方」にも「公開したパッケージは版で固定されるので、戻すときは前の版を使えばよい」とあります。

## maven-publish の設定

[platform/core-format/build.gradle.kts](../../SanpoGuide/platform/core-format/build.gradle.kts) の設定です（`core-prompt` とプロンプト・パックも同じ形）。

```kotlin
plugins {
    alias(libs.plugins.kotlin.jvm)
    `maven-publish`
}

java {
    // …
    withSourcesJar()
}

// Published to GitHub Packages for the channel management system (RFC-002 R-11, R-12).
// Users add org.json themselves (see the dependency note above).
publishing {
    publications {
        create<MavenPublication>("coreFormat") {
            artifactId = "core-format"
            from(components["java"])
            pom {
                name.set("yorisoi core-format")
                description.set(
                    "Channel and collection package formats, their checks and the channel list (API-002/003/004). " +
                        "Requires org.json on the classpath.",
                )
                url.set("https://github.com/duwenji/SanpoGuide")
            }
        }
    }
    repositories {
        maven {
            name = "GitHubPackages"
            url = uri("https://maven.pkg.github.com/duwenji/SanpoGuide")
            credentials {
                username = System.getenv("GITHUB_ACTOR")
                password = System.getenv("GITHUB_TOKEN")
            }
        }
    }
}
```

| 部分 | 意味 |
|---|---|
| `` `maven-publish` `` | Maven リポジトリに公開するタスクを足す Gradle の標準のプラグイン |
| `withSourcesJar()` | ソースコードの jar も一緒に公開する。使う側の IDE で、ライブラリの中身を読める |
| `publications { … }` | 何を公開するか。`from(components["java"])` で、jar と依存の情報 |
| `pom { … }` | ライブラリの説明（POM という XML に書かれる） |
| `repositories { … }` | どこに公開するか。GitHub Packages の URL と、認証の情報 |

認証の情報は、**環境変数から読む** ようにしています。トークンをファイルに書かないためです。GitHub Actions の中では、`GITHUB_ACTOR` と `GITHUB_TOKEN` が自動で用意されます。

POM の説明文に "Requires org.json on the classpath."（クラスパスに org.json が要る）とあるのは、[5-1](01-jvm-library.md) の `compileOnly` のためです。使う側に、自分で足してもらう必要があることを伝えています。

## タグを押すと公開される

公開は、手元のパソコンではなく **GitHub Actions**（GitHub の上でコマンドを自動で実行する仕組み）で行います。[.github/workflows/publish.yml](../../SanpoGuide/.github/workflows/publish.yml):

```yaml
# Publishes to GitHub Packages when a tag is pushed (RFC-002 R-11):
# - yorisoi-core-v<version>:     :platform:core-format and :platform:core-prompt (yorisoiCoreVersion)
# - sanpoguide-prompts-v<version>: :apps:sanpoguide:prompts (sanpoguidePromptsVersion)
# The tag must match the version in gradle.properties. Publish the core a prompt pack uses first.
name: Publish

on:
  push:
    tags:
      - 'yorisoi-core-v*'
      - 'sanpoguide-prompts-v*'

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # … Java 17 と Gradle の準備

      - name: Choose what to publish
        id: what
        run: |
          case "${GITHUB_REF_NAME}" in
            yorisoi-core-v*)
              property=yorisoiCoreVersion
              tasks=":platform:core-format:test :platform:core-prompt:test :platform:core-format:publish :platform:core-prompt:publish"
              ;;
            sanpoguide-prompts-v*)
              property=sanpoguidePromptsVersion
              tasks=":apps:sanpoguide:prompts:test :apps:sanpoguide:prompts:publish"
              ;;
          esac
          version=$(grep "^${property}=" gradle.properties | cut -d= -f2)
          if [ "${GITHUB_REF_NAME##*-v}" != "${version}" ]; then
            echo "Tag ${GITHUB_REF_NAME} does not match ${property}=${version}" >&2
            exit 1
          fi
          echo "tasks=${tasks}" >> "$GITHUB_OUTPUT"

      - name: Test and publish
        run: ./gradlew ${{ steps.what.outputs.tasks }} --console=plain
        env:
          GITHUB_ACTOR: ${{ github.actor }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

```mermaid
flowchart LR
    A["gradle.properties の<br/>版を上げてマージ"] --> B["タグ yorisoi-core-v2.0.0<br/>を push"]
    B --> C["GitHub Actions が起動"]
    C --> D{"タグの種類と版が一致？"}
    D -->|いいえ| X["失敗（公開しない）"]
    D -->|はい| E["そのモジュールのテスト"]
    E -->|失敗| X
    E -->|成功| F["GitHub Packages に公開"]
```

工夫を見ておきましょう。

- **タグで公開する**: `main` にマージするたびではなく、タグを押したときだけ公開します。公開は「この版を出す」という意思を持って行うものだからです
- **タグの名前で何を公開するかを決める**: `yorisoi-core-v…` ならコアの 2 つ、`sanpoguide-prompts-v…` ならプロンプト・パック。`${GITHUB_REF_NAME##*-v}` は、タグの名前から最後の `-v` より後ろ（版の数字）を取り出すシェルの書き方です
- **タグと版の一致を確かめる**: タグ `yorisoi-core-v2.1.0` を押したのに、`gradle.properties` が `2.0.0` のままだったら、`2.0.0` を公開し直そうとしてしまいます。公開の前に、2 つが一致しているかを確かめて止めます
- **テストに通ってから公開する**: テストと公開を同じコマンドで実行するので、テストが落ちれば公開されません
- **コアを先に公開する**: プロンプト・パックはコアに依存するので、新しいコアを使うプロンプト・パックは、そのコアを公開してからタグを押します（冒頭のコメント）
- **権限を最小にする**: `permissions` で、リポジトリの読み取り（`contents: read`）とパッケージの書き込み（`packages: write`）だけを許します。それ以上の権限をワークフローに与えません

## 使う側: validator の設定

管理システムの [validator/settings.gradle.kts](../../yorisoi-console/validator/settings.gradle.kts) は、GitHub Packages からコアとプロンプト・パックを取ってくる設定をしています。

```kotlin
dependencyResolutionManagement {
    repositories {
        mavenCentral()
        // core-format and SanpoGuide's prompt pack, published by SanpoGuide (ADR-001 T-4, SanpoGuide
        // RFC-002 R-11). Reading GitHub Packages needs a token with read:packages: $GITHUB_TOKEN in CI,
        // or gpr.user / gpr.key in ~/.gradle/gradle.properties. Without one, only locally published
        // ones are used (asking without a token fails).
        val gprUser = providers.gradleProperty("gpr.user").orElse(providers.environmentVariable("GITHUB_ACTOR")).orNull
        val gprKey = providers.gradleProperty("gpr.key").orElse(providers.environmentVariable("GITHUB_TOKEN")).orNull
        if (gprUser != null && gprKey != null) {
            maven {
                name = "SanpoGuide"
                url = uri("https://maven.pkg.github.com/duwenji/SanpoGuide")
                credentials {
                    username = gprUser
                    password = gprKey
                }
                content {
                    includeGroup("io.github.duwenji.yorisoi")
                    includeGroup("io.github.duwenji.sanpoguide")
                }
            }
        }
        // Built locally (`./gradlew publishToMavenLocal` in SanpoGuide).
        mavenLocal {
            content {
                includeGroup("io.github.duwenji.yorisoi")
                includeGroup("io.github.duwenji.sanpoguide")
            }
        }
    }
}
```

- **GitHub Packages は、公開のリポジトリでも読むのにトークンが要る**: CI では `GITHUB_TOKEN`、手元では `~/.gradle/gradle.properties` に書いた `gpr.user`・`gpr.key`（`read:packages` の権限のトークン）。`gh auth token` で出るトークンは、ふつう `read:packages` の権限を持たないので、そのままでは使えません
- **トークンがなければ、手元に公開したものを使う**（`mavenLocal`）: SanpoGuide で `./gradlew :platform:core-format:publishToMavenLocal :platform:core-prompt:publishToMavenLocal :apps:sanpoguide:prompts:publishToMavenLocal` を実行すると、パソコンの `~/.m2/repository` に公開され、それを使える。版を合わせるため、validator が使う版のコミット（タグなど）で実行する
- **`includeGroup(…)`**: このリポジトリからは、この 2 つのグループのライブラリだけを取る。ほかのライブラリを、思わぬ場所から取ってこないように

`validator/build.gradle.kts` の依存は、版を固定しています。

```kotlin
implementation("io.github.duwenji.yorisoi:core-format:2.0.0")
implementation("io.github.duwenji.sanpoguide:prompts:2.0.0")
```

SanpoGuide が新しい版を出しても、管理システムは書いた版を使い続けます。たとえば `core-format` 1.3.0 が出たときも、管理システムは `1.2.0` のままでした。1.3.0 で足したのはリストの読み方（アプリのため）で、機械審査には要らなかったからです。2.0.0（グループの改名）では、パッケージの名前が変わったので、管理システムも改名と同時に上げました。新しい版を使うのは、管理システムの側で版を書き換えて確かめたときです。`station-format` のころも、SanpoGuide が `1.2.0` を出したあと、管理システムは `2.0.0` に上げるまで `1.1.0` を使っていました。**使う側が、上げる時期を自分で決められる** のが、版を固定する利点です。

管理システムの CI（[ci.yml](../../yorisoi-console/.github/workflows/ci.yml)）も、`packages: read` の権限と `GITHUB_TOKEN` でコアとプロンプト・パックを取ってきて、`validator` をビルドしています。

## 実際に起きた失敗: Permission denied

`station-format` の最初の公開（`station-format-v1.0.0`）は、11 秒で失敗しました。GitHub Actions のログ:

```
./gradlew: Permission denied
##[error]Process completed with exit code 126.
```

`gradlew` は、Linux（GitHub Actions の `ubuntu-latest`）で実行するには **実行の権限** が要るシェルスクリプトです。ところが Windows のパソコンで作ったファイルを Git に入れると、実行の権限が記録されないことがあります。Windows のファイルには、Linux と同じ形の実行の権限がないからです。

修正は、Git にファイルの実行の権限を記録し直すことでした（コミット「fix: gradlew に実行権限を付ける」）。Windows では、次のコマンドで Git に直接記録できます。

```sh
git update-index --chmod=+x gradlew
```

ファイルの中身は 1 文字も変わらず、権限だけが変わります（そのコミットの差分は `gradlew | 0`、`git show --summary` で見ると `mode change 100644 => 100755 gradlew`）。修正のあと、同じタグ `station-format-v1.0.0` から公開をやり直して、成功しています。

この失敗から分かることは 2 つです。

- **手元（Windows）で動いても、CI（Linux）で動くとは限らない**。改行（[0-3](../00-overview/03-setup.md) の CRLF）と並んで、Windows で開発するときによく出会う落とし穴
- **自動化した手順は、一度は本番の環境で流して確かめる**。最初の公開で失敗に気づけたのは、公開を手作業ではなく CI にしていたから

SanpoGuide の `.gitattributes` に `gradlew text eol=lf` とあるのも、`gradlew` の改行が CRLF になると Linux で動かないためです。

## ハンズオン: 公開の情報を手元で確かめる

実際の公開（GitHub Packages への書き込み）はせず、手元のビルドのフォルダの中だけで確かめます。

### 1. POM を作って読む

```sh
cd /c/Dev/apps/SanpoGuide
./gradlew :platform:core-format:generatePomFileForCoreFormatPublication
cat platform/core-format/build/publications/coreFormat/pom-default.xml
```

```xml
  <groupId>io.github.duwenji.yorisoi</groupId>
  <artifactId>core-format</artifactId>
  <version>2.0.0</version>
  <name>yorisoi core-format</name>
  <description>… Requires org.json on the classpath.</description>
  …
  <dependencies>
    <dependency>
      <groupId>org.jetbrains.kotlin</groupId>
      <artifactId>kotlin-stdlib</artifactId>
      <version>2.2.0</version>
      <scope>compile</scope>
    </dependency>
  </dependencies>
```

- 座標（`groupId`・`artifactId`・`version`）と説明が入っている
- 依存は `kotlin-stdlib` だけ。`compileOnly` の `org.json` は **入っていない**。使う側に `org.json` が連れてこられないことが分かる

タスクの名前 `generatePomFileForCoreFormatPublication` の `CoreFormat` は、`create<MavenPublication>("coreFormat")` の名前から来ています。プロンプト・パックの POM なら `:apps:sanpoguide:prompts:generatePomFileForPromptsPublication` で、依存に `core-format`・`core-prompt` が入っていることを確かめられます。

### 2. タグと版の照合を手元で再現する

ワークフローの「Choose what to publish」と同じ処理を、手元で動かしてみます。

```sh
for tag in yorisoi-core-v2.0.0 yorisoi-core-v2.1.0 sanpoguide-prompts-v2.0.0; do
  GITHUB_REF_NAME=$tag bash -c '
    case "${GITHUB_REF_NAME}" in
      yorisoi-core-v*) property=yorisoiCoreVersion ;;
      sanpoguide-prompts-v*) property=sanpoguidePromptsVersion ;;
    esac
    version=$(grep "^${property}=" gradle.properties | cut -d= -f2)
    if [ "${GITHUB_REF_NAME##*-v}" != "${version}" ]; then
      echo "Tag ${GITHUB_REF_NAME} does not match ${property}=${version}" >&2; exit 1
    fi
    echo "OK $GITHUB_REF_NAME"'
done
```

```
OK yorisoi-core-v2.0.0
Tag yorisoi-core-v2.1.0 does not match yorisoiCoreVersion=2.0.0
OK sanpoguide-prompts-v2.0.0
```

版を上げずにタグだけ `2.1.0` を押すと、ここで止まることが分かります。

### 3. gradlew の権限を確かめる

```sh
git ls-files -s gradlew
```

```
100755 b9bb139f… 0	gradlew
```

先頭の `100755` が「実行できるファイル」の印です（ふつうのファイルは `100644`）。Git がファイルの権限を記録していることが分かります。

### 4. 公開の記録を見る（任意）

GitHub の CLI（`gh`）が使えるなら、公開のワークフローの実行の記録を見られます。

```sh
gh run list --workflow publish.yml --limit 8
```

`michizure-core-v1.0.0`〜`v1.3.0`（改名前の名前）・`yorisoi-core-v2.0.0` と `sanpoguide-prompts-v1.0.0`〜`v2.0.0` の成功が並んでいるはずです。`station-format` のころの記録（`v1.0.0` の 11 秒の失敗など）は、`gh run list --workflow publish-station-format.yml` で見られます（ワークフローのファイルは消えても、記録は残ります）。失敗した実行のログは `gh run view <実行のID> --log-failed` で読めます。

> 手元への公開（`./gradlew publishToMavenLocal`）も試せますが、パソコンの `~/.m2/repository` にファイルが書き込まれ、管理システムの `validator` のビルドがそれを使うことがあります（`mavenLocal`）。試したあとは `~/.m2/repository/io/github/duwenji/yorisoi/` と `…/sanpoguide/` を消すと元に戻ります。

## つまずきやすいところ

- **公開した版の中身を差し替えない**: 直すときは新しい版を出す
- **タグと版をそろえる**: CI で照合して止める
- **トークンをファイルに書かない**: 環境変数や、リポジトリの外の `~/.gradle/gradle.properties` に
- **使う側は版を固定する**: 上げる時期を自分で決められる
- **依存されるもの（コア）から先に公開する**: プロンプト・パックは、使うコアが公開されてから
- **Windows で作ったスクリプトの実行権限**: `git update-index --chmod=+x`。改行も LF に

## 確認問題

<details>
<summary>問 1. 管理システムがコアのコードを写して持っていかず、公開されたライブラリを使うのはなぜですか。</summary>

写した瞬間から、アプリのコードと食い違い始めるからです。同じコードで確かめる、という目的が果たせなくなります。公開されたライブラリなら、版で中身が決まり、アプリと同じコードを使えます。

</details>

<details>
<summary>問 2. SanpoGuide が <code>core-format</code> の 2.1.0 を公開しました。管理システムの <code>validator</code> は、すぐに 2.1.0 を使い始めますか。</summary>

使い始めません。`validator/build.gradle.kts` が `2.0.0` に固定しているからです。管理システムの側で版を書き換え、テストで確かめてから上げます。

</details>

<details>
<summary>問 3. コアとプロンプト・パックの版を、1 つにまとめずに分けているのはなぜですか。</summary>

変わる理由が違うからです。プロンプトの文面や組み込みのチャンネルを直すたびに、形式の確認（コア）の版まで上げると、コアを使うほかのアプリや管理システムが、中身の変わらない新しい版を追いかけることになります。分けておけば、それぞれ変わったときだけ版を上げられます。

</details>

<details>
<summary>問 4. 最初の公開が <code>./gradlew: Permission denied</code> で失敗したのはなぜですか。どう直しましたか。</summary>

Windows で作った `gradlew` が、実行の権限なしで Git に記録されていて、GitHub Actions の Linux の環境で実行できなかったからです。`git update-index --chmod=+x gradlew` で、Git に実行の権限を記録して直しました。

</details>

---

前: [5-2 チャンネル・パッケージの形式](02-package-format.md) ／ 次: [5-4 素材ときっかけ](04-materials-cues.md)
