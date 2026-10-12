# 1-4 署名と APK

[目次](../README.md) ＞ 第 1 部 ＞ 1-4

## この章で学ぶこと

- Android アプリに署名が要る理由と、署名が守っているもの
- デバッグ用とリリース用の署名の違い
- 散策ガイドが署名の鍵をどう扱っているか（Git に入れない仕組み）
- APK の署名を自分で確かめる方法

## なぜアプリに署名するのか

Android は、**署名されていない APK をインストールしません**。署名は次のことを保証します。

- **作った人が同じ**: アプリを更新するとき、端末は新しい APK が **前の版と同じ鍵で署名されているか** を確かめます。違う鍵なら更新を拒みます。だから、他人が同じ `applicationId` の偽のアプリを作っても、正規のアプリを上書きできません
- **途中で変えられていない**: APK の中身が 1 バイトでも変わると、署名が合わなくなります

第 6 部で学んだ「署名で信用をつなぐ」考え方が、Android のアプリそのものにも使われているわけです（[技術カード: 公開鍵暗号と Ed25519](../ref/ed25519.md)）。ただし方式は違い、散策ガイドのリリース用の鍵は RSA です。

### 鍵をなくすと、更新できなくなる

更新には **同じ鍵** が要ります。リリース用の鍵（とそのパスワード）をなくすと、同じアプリとして更新を出せなくなります。散策者には、いったん消して新しいアプリを入れ直してもらうしかありません。第 6 部の「ルート鍵をなくすと別のリストになる」とまったく同じ構図です。

> Google Play で配るアプリは「Play App Signing」で、配布用の鍵を Google に預けるのが一般的です。散策ガイドはまだストアで配っておらず、APK を直接配っています（`releases/` フォルダ）。

## デバッグ用とリリース用

| | デバッグ用 | リリース用 |
|---|---|---|
| 作り方 | `./gradlew assembleDebug` | `./gradlew assembleRelease` |
| 署名の鍵 | Android の開発ツールが自動で作る `~/.android/debug.keystore` | 自分で作った `release.jks` |
| 鍵のパスワード | 決まっている（`android`） | 自分で決める |
| 用途 | 開発中の確認 | 散策者に配る |
| `BuildConfig.DEBUG` | `true` | `false` |

デバッグ用の鍵は、パソコンごとに別の鍵が自動で作られます。**別のパソコンでビルドしたデバッグ版で、端末のデバッグ版を上書きできない** のはこのためです（鍵が違う）。

`BuildConfig.DEBUG` は、散策ガイドではたとえば「デバッグビルドだけ、チャンネル・リストに `http://localhost` を許す」（[6-5](../06-trust/05-verify-in-app.md)）のに使われています。

## 散策ガイドの署名の設定

[app/build.gradle.kts](../../SanpoGuide/apps/sanpoguide/app/build.gradle.kts):

```kotlin
// Release signing keys live outside Git, in keystore.properties at the project root
// (storeFile, storePassword, keyAlias, keyPassword). Without it the release APK is unsigned.
val keystoreFile = rootProject.file("keystore.properties")
val keystore = Properties().apply { if (keystoreFile.exists()) keystoreFile.inputStream().use(::load) }

android {
    signingConfigs {
        if (keystoreFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }
}
```

1. `keystore.properties` があれば読み込む（1-1 で見た `apply` と、ファイルを開いて必ず閉じる `use`）
2. あれば、そこに書かれた鍵のファイル・パスワード・別名で `release` という署名の設定を作る
3. リリースビルドにその設定を使う。`findByName` は、設定がなければ null を返すので、`keystore.properties` がなければ **署名なしの APK** ができる（ビルドは失敗しない）

### 秘密を Git に入れない

鍵のファイルとパスワードは、絶対にリポジトリに入れてはいけません。散策ガイドは次のように分けています。

| ファイル | Git に入れるか | 中身 |
|---|---|---|
| `keystore.properties.example` | 入れる | 書き方の見本（パスワードは空） |
| `keystore.properties` | **入れない** | 本物のパスワード |
| `release.jks` | **入れない** | 署名の鍵 |

[keystore.properties.example](../../SanpoGuide/keystore.properties.example):

```properties
# Copy to keystore.properties (not committed) and fill in. storeFile is relative to this folder.
storeFile=release.jks
storePassword=
keyAlias=sanpoguide
keyPassword=
```

[.gitignore](../../SanpoGuide/.gitignore) に `keystore.properties`・`*.jks`・`*.keystore` が入っているので、うっかり `git add` しても入りません。**見本だけを Git に入れ、本物はそれぞれの手元で作る** のは、秘密を扱う設定でよく使うやり方です。管理システムの `.gitignore` が `*.pem`・`*.key` を除いているのも同じ考え方です。

ハンズオンで `git ls-files` を使って、実際に入っていないことを確かめます。

### リリース版の作り方

[SanpoGuide の README](../../SanpoGuide/README.md) の「リリース版のビルド」に手順があります。

```sh
keytool -genkeypair -v -keystore release.jks -alias sanpoguide -keyalg RSA -keysize 2048 -validity 10000
./gradlew assembleRelease
```

- `keytool` は JDK に入っている、鍵を扱う道具です
- `-validity 10000` は鍵の証明書の有効期間（日数、約 27 年）。アプリを配り続ける間、ずっと同じ鍵が要るので長くします
- 出力は `app/build/outputs/apk/release/app-release.apk`。`keystore.properties` がなければ `app-release-unsigned.apk`

> **このリポジトリの `release.jks` を上書きしないでください。** 上の `keytool` のコマンドは、鍵を **新しく作る** ものです。散策ガイドの本物の鍵がすでにある手元でそのまま実行すると、別の鍵ができてしまいます（同じ名前なら `keytool` はエラーで止まりますが、消してから作り直すと取り返しがつきません）。試すなら、ハンズオンのように別のフォルダで行います。

## APK の中身

APK は、実は **ZIP** です。中には次のようなものが入っています。

| 中身 | 何か |
|---|---|
| `classes.dex`・`classes2.dex`… | Kotlin のコードを、Android 用に変換したもの（デバッグ版は 10 個以上に分かれる） |
| `AndroidManifest.xml` | 合体後のマニフェスト（1-3） |
| `res/`・`resources.arsc` | 画像・文字列などのリソース |
| `sanpoguide/` | `:station-format` のリソース。組み込みのチャンネルとプロンプトの文面、1-2 で見た `index.txt` |
| `lib/` | ライブラリが持ち込んだ、端末の CPU ごとのネイティブのコード |
| `META-INF/` | ライブラリの付属情報など |

APK は ZIP なので、`unzip -l app/build/outputs/apk/debug/app-debug.apk` で一覧を見られます。`grep sanpoguide/channels` で絞ると、1-2 の `channelIndex` が作った `index.txt` が入っていることも確かめられます。

今の Android の署名（v2 以降）は、ZIP の中のファイルではなく、ZIP の構造そのものに署名を埋め込みます。そのため、APK を一度ほどいて ZIP にし直すと、中身が同じでも署名が壊れます。

## ハンズオン: 署名を確かめる

### 1. デバッグ版の署名を見る

1-2 で作ったデバッグ版の APK の署名を、Android SDK の `apksigner` で確かめます。

```sh
cd /c/Dev/apps/SanpoGuide
SDK=$(sed -n 's/^sdk.dir=//p' local.properties | sed 's/\\:/:/; s/\\\\/\//g')
APKSIGNER=$(ls -d "$SDK"/build-tools/* | tail -1)/apksigner.bat
"$APKSIGNER" verify --print-certs app/build/outputs/apk/debug/app-debug.apk
```

1 行目は、`local.properties` に書かれた Android SDK の場所を取り出しています。

```
V2 Signer: certificate DN: C=US, O=Android, CN=Android Debug
V2 Signer: certificate SHA-256 digest: 7d830c75e9513343783aa93f4b66ae7f66a490faf5d469533c979d2696bd15dd
…
```

- `V2 Signer`: v2 方式で署名されている
- `CN=Android Debug`: デバッグ用の鍵の証明書
- `SHA-256 digest`: 証明書の SHA-256（指紋）。値はパソコンごとに違います

### 2. デバッグ用の鍵の指紋と比べる

```sh
keytool -list -keystore ~/.android/debug.keystore -storepass android
```

```
androiddebugkey,2026/09/27, PrivateKeyEntry,
証明書のフィンガプリント(SHA-256): 7D:83:0C:75:E9:51:33:43:…
```

（Git Bash では日本語が文字化けすることがあります。指紋の 16 進数だけを見てください。）

手順 1 の `SHA-256 digest` と、大文字・小文字とコロンを除いて同じ値になります。**デバッグ版の APK は、このパソコンのデバッグ用の鍵で署名されている** ことが確かめられました。

### 3. 鍵が Git に入っていないことを確かめる

```sh
git ls-files | grep -i -E 'jks|keystore|local.properties'
```

```
keystore.properties.example
```

見本だけが入っていて、本物の `keystore.properties`・`release.jks`・`local.properties` は入っていません。

```sh
git check-ignore -v keystore.properties release.jks
```

どちらも `.gitignore` のどの行で除かれているかが表示されます。

### 4. 練習用の鍵で署名してみる（任意）

本物の鍵には触れず、使い捨ての鍵で `keytool` を試します。**必ずリポジトリの外のフォルダで** 行ってください。

```sh
mkdir -p /tmp/sign-practice && cd /tmp/sign-practice
keytool -genkeypair -keystore practice.jks -alias practice -keyalg RSA -keysize 2048 -validity 1 \
  -storepass practice123 -keypass practice123 -dname "CN=Practice"
keytool -list -keystore practice.jks -storepass practice123
```

練習が終わったら `rm -rf /tmp/sign-practice` で消します。

## つまずきやすいところ

- **リリース用の鍵とパスワードは、別の場所にも保管する**: なくすと更新を出せなくなります。README にも「別の場所にも保管する」と書かれています
- **署名の鍵をリポジトリに入れない**: 一度 Git の履歴に入ると、消しても履歴に残ります。漏れたら、その鍵で署名された偽の更新を作られるおそれがあります
- **デバッグ版とリリース版は上書きし合えない**: 鍵が違うので、端末に入っているデバッグ版の上にリリース版を入れるには、先にアンインストールが要ります

## 確認問題

<details>
<summary>問 1. 他人が散策ガイドと同じ <code>applicationId</code> の偽のアプリを作り、散策者の端末に「更新」として入れようとしました。どうなりますか。</summary>

端末は、新しい APK が前の版と同じ鍵で署名されているかを確かめます。偽のアプリは別の鍵で署名されているので、更新は拒まれます。

</details>

<details>
<summary>問 2. <code>keystore.properties</code> がない状態で <code>./gradlew assembleRelease</code> を実行するとどうなりますか。</summary>

ビルドは失敗せず、署名なしの `app-release-unsigned.apk` ができます。`signingConfigs.findByName("release")` が null を返し、リリースビルドに署名の設定が付かないためです。署名なしの APK は端末に入れられません。

</details>

<details>
<summary>問 3. 鍵のファイルを Git に入れず、<code>keystore.properties.example</code> だけを入れているのはなぜですか。</summary>

本物の鍵とパスワードは秘密なのでリポジトリに入れられませんが、どんな項目を書けばよいかは共有したいからです。見本を写して、それぞれの手元で本物を作ります。

</details>

---

前: [1-3 Android アプリの部品](03-android-components.md) ／ 次: [2-1 Compose の考え方](../02-compose/01-compose-basics.md)
