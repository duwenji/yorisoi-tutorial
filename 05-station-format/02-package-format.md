# 5-2 チャンネル・パッケージの形式

[目次](../README.md) ＞ 第 5 部 ＞ 5-2

## この章で学ぶこと

- チャンネルのパッケージの中身（`channel.json`、プロンプトのスロット、`signature.json`）
- 第三者に「何を変えさせ、何を変えさせないか」を、形式そのもので決める考え方
- 確かめる順番と、それぞれのエラーコード
- 外から来た ZIP を安全に開く方法（パスの細工、展開すると巨大になる ZIP）
- 自分でチャンネルを作って、アプリと同じ確認にかけてみる

## 形式は約束

チャンネルのパッケージの形式は、契約書 **API-003**（[SanpoGuide/docs/channel-package-format.md](../../SanpoGuide/docs/channel-package-format.md)）で決まっています。第 6 部の API-002 が「承認済みチャンネル・リスト」の約束だったのに対し、API-003 は **そのリストが指すパッケージの中身** の約束です。

```mermaid
flowchart LR
    L["承認済みチャンネル・リスト<br/>（API-002・第 6 部）<br/>package.url・sha256・size"] -->|"SHA-256 で固定"| P["パッケージ（ZIP）<br/>（API-003・この章）"]
    P --> CJ["channel.json<br/>設定"]
    P --> SL["prompts/…<br/>スロットの文章"]
    P --> SG["signature.json<br/>チャンネル提供者の署名"]
```

この約束を、アプリ（読み込むとき）と管理システム（機械審査）が、**同じコード**（`:station-format` の `StationValidator`、[5-1](01-jvm-library.md)）で確かめます。

## パッケージの中身

```
channel.json                 設定（必須）
signature.json               チャンネル提供者の署名（第三者のみ必須）
prompts/
├── guide/
│   ├── persona.md           スポット解説の語り手（役割・口調）
│   └── focus.md             スポット解説で何に重点を置くか
└── companion/
    ├── persona.md           散歩の友の語り手（役割・口調）
    ├── topics.md            雑談の話題の選び方
    └── events/              出来事ごとの追加の指示
        ├── start.md
        ├── revisit.md
        ├── milestone.md
        ├── rest.md
        └── finish.md
resources/                   パッケージに入れる素材（任意。第三者のみ）
├── text/*.md
└── img/*.jpg・*.png・*.webp
```

- `prompts/` の下のファイルは **すべて任意**。ないスロットには、組み込みの「標準」チャンネルの文章が入る
- `resources/` には、`channel.json` の `resources` が指しているファイルだけを置ける（下の「素材・きっかけ・見せ方」）
- **これ以外のファイルを入れると拒む**（API-003 F-5）
- テキストは UTF-8（BOM なし）、改行は LF

組み込みの 6 つのチャンネル（[station-format/src/main/resources/sanpoguide/channels/](../../SanpoGuide/apps/sanpoguide/prompts/src/main/resources/sanpoguide/channels/)）も、`signature.json` がないだけで同じ形です。「しずかに」チャンネル（`quiet/`）は `channel.json` だけで、スロットは全部「標準」のものを使っています。

## channel.json: 選択肢から選ぶ設定

「しずかに」チャンネルの `channel.json` です（[3-4](../03-walk/04-maybe-talk.md) でも見ました）。

```json
{
  "format": 1,
  "id": "quiet",
  "version": 1,
  "name": "しずかに",
  "summary": "天気の急変・日の入り・施設など大事なお知らせと、開始・終了のあいさつだけ",
  "lang": "ja",
  "greeting": "ここからは静かに歩きます。大事なことだけお知らせしますね。",
  "talk": {
    "level": "quiet",
    "events": { "spot": false, "revisit": false, "milestone": false, "rest": false, "start": true, "finish": true }
  },
  "spots": { "prefer": [], "skip": [] },
  "guide": { "length": "short" },
  "mood": { "tone": true, "sound": "auto" }
}
```

[StationManifest.kt](../../SanpoGuide/platform/core-format/src/main/kotlin/io/github/duwenji/michizure/core/format/StationManifest.kt) が、これを Kotlin のデータクラスで表しています。

```kotlin
/** `channel.json` of a channel package (API-003). Only the values the format allows can be held. */
data class StationManifest(
    val format: Int,
    val id: String,
    val version: Int,
    val publisher: String?,
    val name: String,
    // …
    val talkLevel: TalkLevel,
    /** The walk events this channel talks on. Weather turns, sunset and amenities are not here: they always speak. */
    val events: Set<TalkEventKind>,
    val prefer: List<SpotKind>,
    val skip: List<SpotKind>,
    val guideLength: GuideLength,
    val moodTone: Boolean,
    val sound: SoundChoice,
)
```

注目してほしいのは、**数値を自由に書ける項目がほとんどない** ことです。

| 項目 | 書けるもの |
|---|---|
| `talk.level` | `quiet`・`normal`・`chatty` の 3 つだけ |
| `guide.length` | `short`・`normal`・`long` の 3 つだけ |
| `mood.sound` | `auto`・`rain`・`waves`… の 7 つだけ |
| `spots.prefer`・`skip` | 決まった 22 種類のスポットの名前だけ |

API-003 の決定事項 F-3:

> 話す量・話す場面・話題の優先・雰囲気・解説の長さを、アプリが決めた選択肢の中から選ぶ。数値を自由に書くことはできない。**選択肢の範囲そのものが上限になる**（話しかけの頻度は最大で「おしゃべり」、解説は最長 450 字）。

もし「話しかけの間隔（秒）」を自由に書けたら、チャンネル提供者が「5 秒」と書いて、散策者の AI の料金をつり上げられます。選択肢しか書けなければ、どう選んでも「おしゃべり」（2 分に 1 回）が上限です。**危ない値を書けない形にする** ことで、確かめる手間そのものを減らしています。

スポットの種類のうち 7 つ（飲食店・カフェ・菓子・パン・食品店・市場・工芸・土産・専門店）は、`prefer` に入れたチャンネルでだけ探します（API-003 1.1）。ふつうの散歩で店ばかり案内しないためです。チェーン店は探しません。組み込みの「グルメの旅」（`gourmet/`）と「ショッピング」（`shopping/`）が、これを使っています。

```kotlin
enum class SpotKind(override val json: String, val category: String, val onlyWhenPreferred: Boolean = false) : JsonValue {
    SHRINE("shrine", "神社"),
    // …
    RESTAURANT("restaurant", "飲食店", onlyWhenPreferred = true),
    // …
}
```

選択肢は enum で、`channel.json` での書き方（`json`）を持っています（[1-1](../01-kotlin-android/01-kotlin-syntax.md) の、項目を持つ enum）。

```kotlin
enum class TalkLevel(override val json: String) : JsonValue { QUIET("quiet"), NORMAL("normal"), CHATTY("chatty") }
```

### 止められない出来事

`talk.events` には、`spot`・`revisit`・`milestone`・`rest`・`start`・`finish` の 6 つしかありません。**天気の急変・日の入り・施設の案内は、項目そのものがない** ので、止める書き方がありません（F-4）。安全に関わる知らせは、どのチャンネルでも必ず話されます（[3-4](../03-walk/04-maybe-talk.md)）。

## スロット: 差し込めるのは文章だけ

[4-3](../04-outside/03-ai.md) で見たとおり、チャンネルが変えられるのは、アプリのプロンプトの決まった **枠（スロット）** に入る文章だけです（F-1）。[Slot.kt](../../SanpoGuide/platform/core-format/src/main/kotlin/io/github/duwenji/michizure/core/format/Slot.kt):

```kotlin
/**
 * The places in the app's prompts where a channel may put its own text (API-003). Everything
 * else in the prompts — the shared rules, safety and privacy — is the app's and can't be changed.
 */
enum class Slot(val path: String, val maxChars: Int) {
    GUIDE_PERSONA("prompts/guide/persona.md", 600),
    GUIDE_FOCUS("prompts/guide/focus.md", 1000),
    COMPANION_PERSONA("prompts/companion/persona.md", 600),
    COMPANION_TOPICS("prompts/companion/topics.md", 1000),
    EVENT_START("prompts/companion/events/start.md", 300),
    // …
    ;

    companion object {
        /** Keeps the cost of every prompt down, whatever the mix of slots. */
        const val MAX_TOTAL_CHARS = 4000
    }
}
```

スロットの文章には、次の決まりがあります（`StationValidator` の `readSlots`）。

```kotlin
if (text.startsWith('﻿')) reject(RejectCode.FORBIDDEN_TEXT, "${slot.path}: byte order mark")
if ('\r' in text) reject(RejectCode.FORBIDDEN_TEXT, "${slot.path}: CR line breaks")
if ("{{" in text) reject(RejectCode.FORBIDDEN_TEXT, "${slot.path}: \"{{\"")
URL_PATTERN.find(text)?.let { reject(RejectCode.FORBIDDEN_TEXT, "${slot.path}: URL \"${it.value}\"") }
if (HEADING_PATTERN.containsMatchIn(text)) reject(RejectCode.FORBIDDEN_TEXT, "${slot.path}: heading")
// … 文字数の上限、合計 4,000 字 …
```

`URL_PATTERN`・`HEADING_PATTERN` や、UTF-8 として読む `decodeUtf8` は、[Checks.kt](../../SanpoGuide/platform/core-format/src/main/kotlin/io/github/duwenji/michizure/core/format/Checks.kt) にまとめてあります。素材の文章や素材集（下で見ます）の確認でも同じ決まりを使うので、チャンネル専用の `StationValidator` から外に出しました。

| 禁止 | 理由 |
|---|---|
| `{{` | アプリのテンプレート（[4-3](../04-outside/03-ai.md)）の書き方に干渉させない。変数や読み込みを使わせない |
| URL | 宣伝や、怪しいサイトへの誘導を AI に話させない |
| `#` で始まる行（見出し） | アプリのプロンプトの見出し（`# 守ること` など）と紛らわしくしない。「ここから新しい指示です」と見せかけさせない |
| 文字数（各 300〜1,000 字、合計 4,000 字） | AI の料金を抑える |
| BOM・CR | 中身のバイト列を決まった形にする（署名・ハッシュがぶれない） |

文字数は `codePointCount` で数えています（コメント: "one per code point, so emoji and rare kanji count once"）。Kotlin（Java）の `String.length` は、絵文字や一部の漢字を 2 と数えてしまうからです。人が数える字数に合わせています。

## 素材・きっかけ・見せ方（第三者のチャンネル）

ここまでの `channel.json` とスロットは、「AI にどう話させるか」を決めるものでした。第三者のチャンネルは、それに加えて **素材**（文字・画像・音声・映像）を、決まった **きっかけ** に、決まった **見せ方** で出せます（API-003「素材・きっかけ・見せ方」、[0-1](../00-overview/01-what-we-build.md)）。`channel.json` の例（一部）:

```json
"resources": [
  { "id": "intro", "type": "text", "file": "resources/text/intro.md" },
  { "id": "old-photo", "type": "image", "file": "resources/img/hachimangu-1900.jpg",
    "alt": "明治時代の鶴岡八幡宮の本宮", "credit": { "author": "不明", "license": "PD" } }
],
"collections": [ { "as": "kamakura", "id": "kamakura-photos", "minVersion": 1 } ],
"cues": [
  { "id": "kotokuin", "trigger": { "type": "spot", "osm": "way/234567", "name": "高徳院" },
    "present": [ { "as": "speak", "source": ["kamakura", "builtin:ai-guide", "builtin:fallback-text"] },
                 { "as": "card", "source": ["kamakura#daibutsu-photo", "builtin:commons-photo"] } ] }
]
```

| 項目 | 何を決めるか |
|---|---|
| `resources` | パッケージに同梱する素材。ファイルは `resources/` に置く |
| `collections` | 使う第三者の素材集（素材提供者が作り、別に審査されたもの）を、ID と最低の版で宣言する（5 個まで）。`as` は、きっかけの中で使う別名 |
| `selectors` | 素材集を名指しせず、「寺社の写真」のような基準（種類・タグ）で素材を集める |
| `cues` | **いつ**（`trigger`: スポット・地点・出来事）、**どの見せ方で**（`as`: 読み上げ・カード・通知・解説の画面…）、**どの素材を**（`source`: 候補を前から順に）出すか |

ここでも「選択肢から選ぶ」考え方が生きています。チャンネルが選べるのは、きっかけの種類・見せ方の種類・候補の並びだけです。「歩いている間（0.5m/s 以上）は全画面を開かない」「解説の画面は、散策者がタップしたときだけ開く」といった **見せ方の安全の決まりは、アプリが強制します**（API-003 F-8）。チャンネルには書く場所がありません。

`source` の候補には、`builtin:ai-guide`（AI の解説）のような **組み込みの素材の出どころ** も並べられます。「観光協会の解説があればそれを、なければ AI の解説、それもだめなら定型文」と書けるわけです。アプリはどの出どころも同じ形（`Producer`）で扱い、前から順に試します（[4-3](../04-outside/03-ai.md)）。

### アプリの段階に合わせて確かめる

アプリは、素材の種類を段階的に増やしています（API-003 M-1）。今のアプリ（`versionCode` 2）は第 1 段で、文字と画像だけを出せます。音声は第 2 段、映像は第 3 段です。`StationValidator.check` は、呼ぶ側が出せる段（`mediaStage`）を受け取ります。

```kotlin
/** The material (手順 8・9・10). Without any stage, a channel that has some can't be shown and isn't read. */
private fun readMedia(json: JSONObject, files: StationFiles, paths: List<String>, mediaStage: Int): StationMedia {
    if (mediaStage <= 0) {
        MEDIA_FIELDS.firstOrNull { json.optList(it).isNotEmpty() }?.let { reject(RejectCode.UNSUPPORTED_RESOURCE, "$it are not supported yet") }
        // …
        return StationMedia.NONE
    }
    val resources = ResourceReader.read(json, files, inCollection = false)
    // …
    val media = CueReader.read(json, resources)
    // Collections are known only from the list, so what they bring is counted when they are (API-004 手順 3・4).
    val needed = MediaStage.required(media)
    if (needed > mediaStage) reject(RejectCode.UNSUPPORTED_RESOURCE, "needs app stage $needed (this one shows up to $mediaStage)")
    return media
}
```

- アプリは `ChannelSync.MEDIA_STAGE`（今は 1）を渡す。音声を使うチャンネルは `unsupported_resource` で取り込まない
- 管理システムの機械審査は `StationValidator.ALL_STAGES`（3）を渡し、すべてを確かめる（[8-8](../08-aws/08-kotlin-lambda.md)）。どの版のアプリから使えるかは、リストの `minAppVersion` で伝える
- 素材集の中身は、パッケージだけでは分からない（リストに載った素材集を取ってきて初めて分かる）。そのため、素材集が持ち込む素材の段は、取り込むときに別に数える（`CollectionReferences`）

素材集そのものの形式（API-004）と確認は、`material/format` パッケージの `CollectionValidator` にあります。素材集も ZIP で、素材提供者の署名（次の `signature.json` と同じ形）が付きます。 素材の出どころの共通の形、きっかけと見せ方の安全、素材集の借り方は [5-4](04-materials-cues.md) でくわしく見ます。

## signature.json: だれが作ったか

第三者のパッケージには、チャンネル提供者の署名（`signature.json`）が付きます（F-6）。[6-5](../06-trust/05-verify-in-app.md) で見たとおりです。

```json
{
  "payload": "<base64url(下の JSON のバイト列)>",
  "publisherKey": "<base64url(チャンネル提供者の Ed25519 公開鍵 32 バイト)>",
  "sig": "<base64url(payload のバイト列への Ed25519 署名)>"
}
```

`payload` の中身:

```json
{
  "type": "channel-package",
  "channel": "kamakura-history",
  "version": 3,
  "publisher": "sg1wxyz...",
  "files": {
    "channel.json": "<SHA-256 の hex>",
    "prompts/guide/focus.md": "<SHA-256 の hex>"
  }
}
```

[6-3](../06-trust/03-signed-documents.md) の署名つき文書と同じ形（`payload` をバイト列のまま署名し、`type` で種類を固定）です。素材集の `signature.json` も同じ形で、`type` が `collection-package`、`channel`・`publisher` の代わりに `collection`・`producer` が入ります。確かめるコードは 1 つ（`verifyPackageSignature`）で、種類の違いは `SignedKind` という enum で渡します。違いは、`keyId` の代わりに **公開鍵そのもの**（`publisherKey`）が入っていることです。アプリは、その公開鍵からアカウントID（`sg1…`、[6-2](../06-trust/02-ed25519-and-ids.md)）を計算し、`channel.json` の `publisher` と、**運営が署名したリストの `publisher`** の両方と一致するかを確かめます。サーバーに問い合わせなくても、だれが作ったかを確かめられます。

## 確かめる順番

API-003 は、確かめる順番も決めています。アプリと管理システムは、同じ順で確かめます。

| 順 | 確かめること | 失敗したら | 場所 |
|---|---|---|---|
| 1 | 大きさ（2MB 以内）と SHA-256（リストの値） | `hash_mismatch` | アプリの `ChannelSync.download`（[6-5](../06-trust/05-verify-in-app.md)） |
| 2 | ZIP を安全に展開できるか | `bad_archive` | `PackageArchive.open` |
| 3 | 許可されたファイルだけか | `unexpected_file` | `StationValidator` |
| 4 | チャンネル提供者の署名、アカウントID、`files` の一致（第三者のみ） | `bad_signature`・`publisher_mismatch` | `verifyPackageSignature`（素材集と共通） |
| 5 | `channel.json` の項目・型・選択肢・文字数、リストとの一致 | `bad_manifest`・`bad_value`・`unsupported_format` | `StationValidator.readManifest` |
| 6 | スロットの文字数と、禁止の文字列 | `slot_too_long`・`forbidden_text` | `StationValidator.readSlots` |
| 7 | 組み立てたプロンプトに未定義の変数がないか | `render_failed` | （下の注） |
| 8 | 素材の項目・形式・上限、`file` があるか、出典（`credit`）・代替テキスト（`alt`） | `bad_resource` | `ResourceReader.read` |
| 9 | きっかけの値の範囲、素材の参照先、見せ方と素材の組み合わせ。素材集の宣言と基準（9a） | `bad_cue`・`unresolved_reference` | `CueReader.read` |
| 9a | 宣言した素材集がリストにあり、使う許しがあるか（取り込むとき） | `collection_not_listed`・`not_granted` | `CollectionReferences.resolve` |
| 10 | アプリが出せない素材の種類・見せ方を使っていないか | `unsupported_resource` | `StationValidator.readMedia` |

どこかで失敗したら、パッケージ全体を拒みます。手順 9a だけは、リストを持っている呼ぶ側（アプリの `ChannelSync`、管理システムの機械審査）が行います。

> 手順 7 は契約書に書かれていますが、今の `StationValidator` には入っていません。`RejectCode.RENDER_FAILED` は用意されているものの、まだどこからも使われていません。スロットには `{{` を書けない（手順 6）ので、チャンネルの側から未定義の変数が持ち込まれることは今のところありません。アプリ自身のプロンプトのファイルの変数は、[4-3](../04-outside/03-ai.md) の `PromptFilesTest` がビルドのたびに確かめています。エラーコードは API-003 のエラー表のとおりで、Kotlin では `RejectCode` という enum になっています。

### 結果を sealed で返す

```kotlin
sealed interface StationCheck {
    data class Ok(val station: StationPackage) : StationCheck
    data class Rejected(val code: RejectCode, val detail: String) : StationCheck
}

fun check(
    files: StationFiles, origin: StationOrigin, listedAs: ListedAs? = null, verifier: Ed25519Verifier? = null, mediaStage: Int = 0,
): StationCheck = try {
    StationCheck.Ok(validate(files, origin, listedAs, verifier, mediaStage))
} catch (e: Reject) {
    StationCheck.Rejected(e.code, e.message.orEmpty())
}
```

中では、失敗した時点で専用の例外（`Reject`）を投げて処理を打ち切り、`check` の入口でそれを受け止めて `Rejected` に変えています。使う側は例外を気にせず、`when` で `Ok` か `Rejected` かを分けるだけです（[1-1](../01-kotlin-android/01-kotlin-syntax.md) の sealed と `when`）。「中では例外で簡単に打ち切り、外には型で結果を返す」という使い分けです。

### 組み込みか、第三者か

```kotlin
enum class StationOrigin { BUILT_IN, THIRD_PARTY }
```

同じ確認でも、出どころによって少しだけ決まりが違います。

| | 組み込み | 第三者 |
|---|---|---|
| `signature.json` | 置いてはいけない | 必須 |
| `publisher` | 書いてはいけない | 必須（`sg1…`） |
| 署名の確認 | しない | する（`Ed25519Verifier` が要る） |

## 外から来た ZIP を安全に開く

第三者のパッケージは ZIP です。外から来た ZIP には、2 つの有名な危険があります。[PackageArchive.kt](../../SanpoGuide/platform/core-format/src/main/kotlin/io/github/duwenji/michizure/core/format/PackageArchive.kt) は、その両方に備えています。

### 危険 1: パスの細工（Zip Slip）

ZIP の中のファイル名に `../../evil.txt` のような **フォルダの外に出るパス** を入れておくと、何も考えずに展開したプログラムが、決められたフォルダの外にファイルを書いてしまいます。アプリの大事なファイルを上書きされるおそれがあります。

```kotlin
/** Only plain relative paths: no absolute paths, `..`, backslashes, drive letters or empty segments. */
private fun checkPath(name: String) {
    val path = name.removeSuffix("/")
    val bad = path.isEmpty() || path.startsWith("/") || '\\' in path || ':' in path ||
        path.split('/').any { it.isEmpty() || it == "." || it == ".." }
    if (bad) throw ArchiveException("bad path \"$name\"")
}
```

`..`、`/` で始まるパス（絶対パス）、バックスラッシュ（Windows の区切り）、`:`（`C:` のようなドライブ）、空の区切りを全部拒みます。そもそも散策ガイドは展開したファイルを **ディスクに書かず、メモリに持つだけ**（`MemoryStationFiles`）なので二重の備えです。

### 危険 2: 展開すると巨大になる ZIP（Zip Bomb）

ZIP は圧縮されているので、数 KB の ZIP が、展開すると何 GB にもなることがあります。何も考えずに展開すると、端末のメモリを使い果たします。

```kotlin
/**
 * Unpacks a third-party channel package (API-003 確認の手順 2): a ZIP, stored or deflated, whose
 * entries are plain relative paths. Sizes are counted while reading, so an archive that inflates
 * beyond the limit is cut off rather than unpacked.
 */
object PackageArchive {
    fun open(zip: ByteArray): StationFiles {
        // …
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            total += n
            if (total > StationValidator.MAX_TOTAL_BYTES) {
                throw ArchiveException("more than ${StationValidator.MAX_TOTAL_BYTES} bytes unpacked")
            }
            out.write(buffer, 0, n)
        }
        // …
    }
}
```

ZIP の中に書かれた「展開後の大きさ」は信用せず（いくらでも嘘を書けるため）、**実際に展開しながら数え**、2MB を超えた時点で打ち切ります（コメント: "cut off rather than unpacked"）。ファイルの数も 100 個までです。

[4-1](../04-outside/01-http-json.md) の「大きさの上限つきで取得する」、[6-7](../06-trust/07-hands-on.md) の準拠テストの `fetchLimited` と同じく、**外から来るものは、全部受け取る前に大きさを数えて打ち切る** のが基本です。

## ハンズオン: 自分のチャンネルを作る

自分でチャンネルを作り、アプリと同じ確認にかけてみます。

### 1. 練習用のテストを置いて流す

[scripts/MyChannelPracticeTest.kt](scripts/MyChannelPracticeTest.kt) をコピーして流します。

```sh
cd /c/Dev/apps/SanpoGuide
cp ../sanpo-tutorial/05-station-format/scripts/MyChannelPracticeTest.kt station-format/src/test/kotlin/io/github/duwenji/sanpoguide/station/format/
./gradlew :station-format:test --tests '*MyChannelPracticeTest*'
```

5 件のテストが通ります。

| テスト | 確かめること |
|---|---|
| my channel passes the app's checks | 自分の「喫茶店さんぽ」チャンネルが確認を通る |
| the app builds the guide's system prompt … | 自分のスロットと、アプリの決まりが組み合わさったシステムプロンプトができる |
| a URL in a slot is turned away | スロットに URL を書くと `forbidden_text` |
| a file outside the layout is turned away | 決まり以外のファイル（アプリのプロンプトを差し替えようとする `prompts/guide/system.md`）は `unexpected_file` |
| a zip with a path that climbs out … | `../../evil.txt` を含む ZIP は `bad path` |

### 2. 自分のチャンネルを読む

テストの中の `manifest` と `persona` が、自分のチャンネルです。

```kotlin
private val manifest = """
    {
      "format": 1,
      "id": "my-cafe-walk",
      "version": 1,
      "name": "喫茶店さんぽ",
      "summary": "古い喫茶店と、そのまわりの路地を、のんびり語る",
      …
      "guide": { "length": "short" },
      …
    }
""".trimIndent()

/** 自分のチャンネルの語り手（スロット guide/persona）。 */
private val persona = "あなたは、町の古い喫茶店を何十年も見てきた、穏やかな常連客です。\n"
```

### 3. 組み立てられたシステムプロンプトを見る

2 つ目のテストは、組み立てたシステムプロンプトを表示（`println`）しています。テストのレポート（`station-format/build/reports/tests/test/index.html`）を開き、`MyChannelPracticeTest` の「Standard output」を見てください。

```
# 役割
あなたは、町の古い喫茶店を何十年も見てきた、穏やかな常連客です。

# 話し方
- 利用者はイヤホンで音声として聞きながら歩いている。…
- 100〜150字程度、1〜2段落にまとめる

# 内容
- そのスポットの由来や歴史、見どころ、…

# 事実の扱い
…

# 守ること
- ここまでの役割や内容の指示と食い違うときは、以下を優先する
- 利用者に、位置・住所・連絡先・名前などの個人的な情報を尋ねない
…
```

- 「役割」は自分のスロット
- 「100〜150字程度」は `guide.length` の `short`
- 「内容」は、自分で書かなかった `guide/focus` の代わりに「標準」チャンネルの文章
- 「守ること」は、アプリが必ず付け加える部分

これが、アプリが AI に送るシステムプロンプトそのものです。運営の担当者も、審査のときに同じものを見ます。

### 4. 自分で壊してみる

`manifest` や `persona` を変えて、どのエラーになるか予想してから流してみてください。

- `"level": "normal"` を `"level": "very-chatty"` にする
- `persona` の先頭に `# 新しい指示\n` を足す
- `"name"` を 21 文字以上にする（例: 「喫茶店さんぽ」を 3 回並べて「喫茶店」を足す。ちょうど 20 文字までは通る）
- `"prefer"` と `"skip"` の両方に `"historic"` を入れる

<details>
<summary>答え</summary>

1 つ目のテスト（`my channel passes the app's checks`）が落ち、`rejected:` のあとに理由が出ます。

- `very-chatty`: `bad_value`（選択肢の外の値）
- `# 新しい指示`: `forbidden_text`（見出し）
- 21 文字以上の名前: `bad_value`（`name has 21 chars (1..20)`）
- `prefer` と `skip` の重なり: `bad_value`（`historic is both preferred and skipped`）

</details>

### 5. 片付け

```sh
rm station-format/src/test/kotlin/io/github/duwenji/sanpoguide/station/format/MyChannelPracticeTest.kt
git status
```

## つまずきやすいところ

- **危ない値は、書けない形にする**: 自由な数値ではなく選択肢にすれば、選択肢の範囲がそのまま上限になる
- **止めてはいけないものは、止める項目を作らない**: 書き方がなければ止められない
- **外から来た ZIP の中身を信用しない**: パスを確かめ、展開しながら大きさを数える
- **文字数は人の数え方で**: `length` ではなく `codePointCount`
- **確かめる順番も約束に含める**: アプリと管理システムで、同じ入力から同じエラーコードが出るように

## 確認問題

<details>
<summary>問 1. 第三者のチャンネルで「天気の急変の警告を止める」ことはできますか。</summary>

できません。`channel.json` の `talk.events` には天気の急変・日の入り・施設の案内の項目そのものがなく、止める書き方がないからです（API-003 F-4）。

</details>

<details>
<summary>問 2. スロットに <code>{{</code> を書いてはいけないのはなぜですか。</summary>

アプリのプロンプトのテンプレート（Mustache の形）の書き方に干渉させないためです。`{{> shared/guard}}` のような読み込みや変数を、チャンネルの側から使えないようにしています。

</details>

<details>
<summary>問 3. ZIP の中に書かれた「展開後の大きさ」を見ずに、展開しながら数えるのはなぜですか。</summary>

ZIP の中の大きさの情報は、作った人がいくらでも嘘を書けるからです。小さく書いておいて、実際には巨大に展開される ZIP で、メモリを使い果たさせることができます。実際に展開しながら数え、上限を超えた時点で打ち切ります。

</details>

---

前: [5-1 Android に依存しない JVM ライブラリ](01-jvm-library.md) ／ 次: [5-3 ライブラリを公開する](03-publish.md)
