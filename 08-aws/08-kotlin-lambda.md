# 8-8 Kotlin の Lambda

[目次](../README.md) ＞ 第 8 部 ＞ 8-8

## この章で学ぶこと

- なぜ機械審査だけ Kotlin で書いたのか（アプリと同じコードで確かめるため）
- JVM の Lambda の形（`RequestHandler`）と、配備するための zip の作り方
- JVM の Lambda の起動の遅さへの備え
- S3 のイベントで Lambda を呼ぶ。2 つのファイルのイベントが同時に来たときの守り
- 判断（純粋な関数）と、読み書き（Lambda）を分ける作り

## なぜ Kotlin なのか

管理システムは TypeScript で書かれていますが、**機械審査の Lambda**（[validator/](../../yorisoi-console/validator/)）だけは Kotlin です。

チャンネル提供者が上げたチャンネルのパッケージや、素材提供者が上げた素材集を確かめるとき、**アプリと同じ確認** をしなければなりません。管理システムで合格したのにアプリで読み込めない、ということが起きないようにするためです（[6-6](../06-trust/06-same-rules.md)）。アプリの確認は、Kotlin で書かれたコア（`core-format`）のライブラリにあります（第 5 部）。それを **そのまま使う** ために、機械審査は Kotlin（JVM）で書いています。

```mermaid
flowchart LR
    SG["yorisoi-platform・yorisoi-sanpoguide<br/>core-format・prompts（Kotlin）"] -->|"GitHub Packages<br/>io.github.duwenji.yorisoi:core-format:1.0.0<br/>io.github.duwenji.sanpoguide:prompts:2.0.0"| V["validator<br/>機械審査の Lambda（Kotlin）"]
    SG -->|"project(...)"| APP["アプリ"]
```

Lambda は、Node.js だけでなく、Java（JVM）など、いくつもの言語で書けます。言語を部品ごとに選べるのも、Lambda の良いところです。

## 機械審査がすること

機械審査が確かめるものは 2 つあります。チャンネルのパッケージ（＋アイコン）と、素材集のパッケージです（素材集は [0-1](../00-overview/01-what-we-build.md) で見た、素材提供者が作るもの）。ここではチャンネルの流れを見ます。素材集も同じ形で、受付の場所が `intake-col/` に、確かめる関数が `MachineReview.reviewCollection` に変わります。

```mermaid
sequenceDiagram
    participant B as チャンネル提供者のブラウザ
    participant S as 受付用のバケット
    participant V as 機械審査の Lambda
    participant D as DynamoDB
    participant R as 記録用のバケット
    B->>S: パッケージ（署名つき POST、8-6）
    S->>V: intake/… にファイルが届いた
    B->>S: アイコン
    S->>V: intake/… にファイルが届いた
    V->>D: 申請を引く（状態は uploading？）
    V->>S: 2 つのファイルを読む（そろっていなければ待つ）
    V->>V: MachineReview.review（core-format の確認など）
    alt 合格
        V->>R: 審査の見本のプロンプトを置く
        V->>D: 申請を awaiting_review に（審査待ち）
    else 不合格
        V->>S: ファイルを archive/ に移す
        V->>D: 申請を validation_failed に（理由つき）
    end
```

合格すると、申請は「審査待ち」（運営の一覧の GSI2 の `QUEUE#REVIEW`、[8-5](05-dynamodb.md)）になります。不合格なら、理由を付けてチャンネル提供者に返します。

## 判断と、読み書きを分ける

機械審査のコードは、2 つのファイルに分かれています。

| ファイル | 役割 | Android・AWS への依存 |
|---|---|---|
| [MachineReview.kt](../../yorisoi-console/validator/src/main/kotlin/console/validator/MachineReview.kt) | 判断する（純粋な関数） | なし |
| [Handler.kt](../../yorisoi-console/validator/src/main/kotlin/console/validator/Handler.kt) | S3・DynamoDB を読み書きする（Lambda の入口） | AWS の SDK |

`MachineReview.review` は、ファイルの中身を受け取って、結果を返すだけです。

```kotlin
/**
 * The machine review (ADR-001 A-11, API-003 確認の手順 2〜10, API-004 確かめる手順 1〜4):
 * core-format's checks, the same the app runs, plus what only the console knows (which channel or
 * collection, which account, which version came before, which channels use a collection) and the
 * icon. Pure: the Lambda reads and writes, this decides.
 */
object MachineReview {
    const val VALIDATOR = "core-format 1.0.0, prompts 2.0.0"
    // …
    fun review(upload: Upload, zip: ByteArray, icon: ByteArray, catalog: Catalog = Catalog.NONE): Outcome {
        // …
            // Every stage: the console checks it all, and the app version a channel needs is minAppVersion's job (J-1).
            when (val result = StationValidator.checkArchive(zip, listedAs = null, verifier = JcaEd25519, mediaStage = StationValidator.ALL_STAGES)) {
                is StationCheck.Rejected -> findings += Finding(result.code.json, result.detail)
                is StationCheck.Ok -> {
                    val manifest = result.station.manifest
                    // …
                    if (manifest.id != upload.channelId) findings += Finding("id_mismatch", /* … */)
                    if (manifest.publisher != upload.accountId) {
                        findings += Finding("publisher_mismatch", /* … */)
                    }
                    upload.latestApprovedVersion?.let { latest ->
                        if (manifest.version <= latest) findings += Finding("version_not_newer", /* … */)
                    }
                    val resolved = resolveCollections(upload, result, catalog)
                    // …
                }
            }
        // …
        findings += iconFindings(icon)
        // …
    }
}
```

- **アプリと同じ確認**: `StationValidator.checkArchive`（[5-2](../05-station-format/02-package-format.md)）。署名の確認には、Java 標準の `JcaEd25519` を渡す（アプリは Tink。[6-5](../06-trust/05-verify-in-app.md) の差し替え口）
- **素材はすべての段階で確かめる**: `mediaStage = StationValidator.ALL_STAGES`。今のアプリが出せるのは文字と画像（第 1 段）までですが、管理システムは音声・映像も含めて形を確かめます。どの版のアプリで使えるかは、リストの `minAppVersion` で決めます
- **使う素材集を、今のリストと照らす**: `resolveCollections`。チャンネルが宣言した素材集が公開中か（`catalog`）、このチャンネル提供者に使う許しがあるか（素材集の `grants`）を確かめる
- **管理システムだけが知っていること**: どのチャンネルへの申請か、どのチャンネル提供者か、前に承認した版はいくつか。アプリはリストを見て確かめるが、申請の時点では管理システムが確かめる
- **アイコン**: PNG で、256×256 以下、100KB 以下か。PNG の先頭の決まったバイト（シグネチャ）と、`IHDR` の幅と高さを読んで確かめる

結果は sealed（`Outcome.Passed`・`Outcome.Failed`、[1-1](../01-kotlin-android/01-kotlin-syntax.md)）で返します。問題が複数あれば、すべてを並べて返します（チャンネル提供者が 1 つ直すたびに出し直さなくて済むように）。

コメントの「Pure: the Lambda reads and writes, this decides.」（純粋な関数。読み書きは Lambda が、判断はこれが）が要点です。[2-3](../02-compose/03-manual-di.md)・[3-4](../03-walk/04-maybe-talk.md) で見た「判断を、外の世界に依存しない小さな部品に分ける」作りが、ここでも使われています。だから、AWS なしでテストできます。

## JVM の Lambda の形

[Handler.kt](../../yorisoi-console/validator/src/main/kotlin/console/validator/Handler.kt):

```kotlin
class Handler(
    private val s3: S3Client = S3Client.builder().httpClient(UrlConnectionHttpClient.create()).build(),
    private val db: DynamoDbClient = DynamoDbClient.builder().httpClient(UrlConnectionHttpClient.create()).build(),
    private val table: String = env("TABLE_NAME"),
    private val intakeBucket: String = env("INTAKE_BUCKET"),
    private val recordsBucket: String = env("RECORDS_BUCKET"),
    private val publicBucket: String = env("PUBLIC_BUCKET"),
    private val fetcher: ExternalFetcher = HttpsFetcher(),
    private val clock: () -> Instant = Instant::now,
) : RequestHandler<S3Event, String> {

    override fun handleRequest(event: S3Event, context: Context?): String {
        val results = event.records.map { record ->
            val key = URLDecoder.decode(record.s3.`object`.key, Charsets.UTF_8)
            runCatching { process(key) }.getOrElse { e ->
                context?.logger?.log("failed on $key: ${e.stackTraceToString()}")
                throw e
            }
        }
        return results.joinToString("; ")
    }
    // …
}
```

- `RequestHandler<S3Event, String>`: AWS の Lambda の Java のライブラリ（`aws-lambda-java-core`・`aws-lambda-java-events`）の約束。S3 のイベントを受け取り、文字列を返す
- **コンストラクタの引数に既定値**: Lambda が呼ぶときは引数なし（既定値で本物の S3・DynamoDB・時計）。テストでは代役を渡せる（[2-3](../02-compose/03-manual-di.md)、Kotlin の既定値の引数は [1-1](../01-kotlin-android/01-kotlin-syntax.md)）
- S3 のイベントのキーは URL 形式で符号化されているので、`URLDecoder.decode` で戻す

CDK の定義（[console-app.ts](../../yorisoi-console/infra/lib/console-app.ts)）:

```ts
const validator = new lambda.Function(this, 'MachineReview', {
  runtime: lambda.Runtime.JAVA_21,
  architecture: lambda.Architecture.ARM_64,
  handler: 'console.validator.Handler::handleRequest',
  code: lambda.Code.fromAsset(props.validatorZip),
  memorySize: 1536,
  // A collection's outside resources are read within 10 minutes (DES-007 J-5).
  timeout: Duration.minutes(15),
  // …
  environment: {
    TABLE_NAME: props.table.tableName,
    INTAKE_BUCKET: intakeBucket.bucketName,
    RECORDS_BUCKET: props.recordsBucket.bucketName,
    PUBLIC_BUCKET: props.publicBucket.bucketName,
    JAVA_TOOL_OPTIONS: '-XX:+TieredCompilation -XX:TieredStopAtLevel=1',
  },
});
// …
intakeBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(validator), { prefix: 'intake/' });
// …
intakeBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(validator), { prefix: 'intake-col/' });
```

- `handler: 'console.validator.Handler::handleRequest'`: どのクラスのどの関数を呼ぶか
- `code: fromAsset(validatorZip)`: Gradle で作った zip（下で説明）。Node.js の Lambda のように CDK がまとめるのではなく、作った zip をそのまま上げる
- `addEventNotification(OBJECT_CREATED, …, { prefix: 'intake/' })`: 受付用のバケットの `intake/` にファイルができたら、この Lambda を呼ぶ。素材集の `intake-col/` も同じ Lambda を呼ぶ
- `timeout: Duration.minutes(15)`: Lambda の上限いっぱい。素材集は、外の URL に置いた素材（画像など）を取ってきて大きさとハッシュを確かめるので、時間がかかることがある（10 分で打ち切る。DES-007 J-5）。チャンネルの審査は数秒で終わる
- `PUBLIC_BUCKET`: 公開中の素材集のパッケージを読んで、チャンネルが使う素材集を確かめるため

## 配備するための zip

[validator/build.gradle.kts](../../yorisoi-console/validator/build.gradle.kts):

```kotlin
dependencies {
    implementation("io.github.duwenji.yorisoi:core-format:1.0.0")
    implementation("io.github.duwenji.sanpoguide:prompts:2.0.0")
    // core-format leaves org.json to its users (Android ships one).
    implementation("org.json:json:20240303")
    implementation("com.amazonaws:aws-lambda-java-core:1.4.0")
    implementation("com.amazonaws:aws-lambda-java-events:3.16.1")
    implementation(platform("software.amazon.awssdk:bom:2.55.11"))
    implementation("software.amazon.awssdk:s3") {
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
        exclude(group = "software.amazon.awssdk", module = "apache-client")
    }
    // … dynamodb も同じ …
    // The JDK's HTTP client: smaller and quicker to start than Apache or Netty.
    implementation("software.amazon.awssdk:url-connection-client")
}

/** The Lambda deployment package: classes at the root, dependencies in lib/. */
val lambdaZip by tasks.registering(Zip::class) {
    archiveFileName.set("validator.zip")
    destinationDirectory.set(layout.buildDirectory.dir("lambda"))
    from(tasks.compileKotlin)
    from(tasks.processResources)
    into("lib") { from(configurations.runtimeClasspath) }
}
tasks.build { dependsOn(lambdaZip) }
```

- `station-format:2.1.0` を GitHub Packages から取る（[5-3](../05-station-format/03-publish.md)）。`org.json` は自分で足す（[5-1](../05-station-format/01-jvm-library.md) の `compileOnly`）
- **JVM の Lambda の zip の決まり**: クラスのファイルは zip のいちばん上に、依存の jar は `lib/` に。自作のタスク `lambdaZip`（[1-2](../01-kotlin-android/02-gradle.md) の `channelIndex` と同じく、Gradle のタスクを自分で作る）がそう並べる
- AWS の SDK の BOM（[1-2](../01-kotlin-android/02-gradle.md) の Compose の BOM と同じ考え方）で、SDK の部品の版をそろえる

## JVM の起動の遅さへの備え

JVM の Lambda は、Node.js より **起動（コールドスタート）が遅い** ことが知られています。JVM そのものを立ち上げ、たくさんのクラスを読み込むからです。機械審査は、いくつかの工夫をしています。

| 工夫 | 効き目 |
|---|---|
| HTTP の部品を JDK のもの（`url-connection-client`）にし、Netty・Apache の部品を外す | 依存が減り、読み込むクラスが減る。コメント: "smaller and quicker to start than Apache or Netty" |
| `JAVA_TOOL_OPTIONS: '-XX:+TieredCompilation -XX:TieredStopAtLevel=1'` | JIT コンパイルを、手早い最初の段階で止める。長く動かすときの最適化より、すぐに動き出すことを優先する |
| `memorySize: 1536` | Lambda はメモリに応じて CPU も増える。起動と ZIP の展開・確認を速くする |

機械審査は、チャンネル提供者が申請したときにだけ動き、数秒かかっても困りません。それでも、待たせる時間を短くするための工夫です。

## 2 つのファイルのイベントが同時に来たら

チャンネル提供者は、パッケージとアイコンの 2 つのファイルを上げます。S3 は、**それぞれのファイルについて** イベントを出すので、機械審査は 2 回呼ばれます。しかも、ほぼ同時に。

```kotlin
/**
 * …
 * A channel's package and icon both raise events, possibly at once: when both are there it reviews
 * them, …
 * The write is conditional on `uploading`, so only one run records an outcome.
 */
class Handler(/* … */) : RequestHandler<S3Event, String> {
    // …
    fun process(key: String): String {
        KEY.matchEntire(key)?.let { val (channelId, submissionId) = it.destructured; return processChannel(channelId, submissionId) }
        COLLECTION_KEY.matchEntire(key)?.let { val (collectionId, submissionId) = it.destructured; return processCollection(collectionId, submissionId) }
        return "skip $key"
    }

    private fun processChannel(channelId: String, submissionId: String): String {
        val sub = getItem("CH#$channelId", "SUB#$submissionId") ?: return "no submission for $channelId/$submissionId"
        if (sub.str("state") != "uploading") return "already ${sub.str("state")}: $submissionId"
        // …
        // The other file's event will do the work if it isn't here yet.
        val zip = read(zipKey) ?: return "waiting for $zipKey"
        val icon = read(iconKey) ?: return "waiting for $iconKey"
        // … 審査する …
        return try {
            when (outcome) {
                is Outcome.Passed -> channelPassed(upload, outcome, now)
                is Outcome.Failed -> channelFailed(upload, outcome, now, zipKey, iconKey)
            }
        } catch (e: TransactionCanceledException) {
            "someone else recorded $submissionId"
        }
    }
}
```

1. **S3 のキーから申請を引く**: キーに `channelId` と `submissionId` を入れてある（`intake/{channelId}/{submissionId}.zip`・`.png`）ので、データベースを探さずに申請を引ける（DM-001 AP-21）。キーの形で、チャンネルか素材集（`intake-col/…`）かも振り分ける
2. **もう結果が出ていれば何もしない**: 状態が `uploading` でなければ終える
3. **もう 1 つのファイルがまだなら待つ**: 先に届いた方のイベントは「待っている」と返して終える。あとから届いた方のイベントが審査する
4. **結果を書くのは、状態が `uploading` のときだけ**（条件つき書き込み、[8-5](05-dynamodb.md)）: 2 つのイベントが同時に審査まで進んでも、先に書いた方だけが成功する。あとの方は `TransactionCanceledException` になり、「ほかの実行が書いた」として終える

[8-7](07-sqs-ses-kms.md) のメールの冪等と同じく、**同じ仕事が 2 回来ても、結果は 1 回分** にする作りです。分散したシステムでは、イベントが重なったり、2 回届いたりすることを前提に作ります。

## ハンズオン: 機械審査をビルドして、テストを壊す

機械審査のビルドには、`core-format` 1.0.0（yorisoi-platform）と `prompts` 2.0.0（yorisoi-sanpoguide）が要ります。GitHub Packages のトークン（[5-3](../05-station-format/03-publish.md)）を設定するか、2 つのリポジトリで手元に公開したもの（`~/.m2`）を使います。

### 1. テストを流して、zip を作る

```sh
cd /c/Dev/apps/yorisoi-console/validator
./gradlew test lambdaZip
ls -la build/lambda/
```

`validator.zip`（15MB ほど）ができます。

### 2. zip の中を見る

```sh
unzip -l build/lambda/validator.zip | awk '{print $4}' | grep -v '^lib/' | grep '\.class$' | head -5
unzip -l build/lambda/validator.zip | awk '{print $4}' | grep '^lib/' | head -8
```

```
console/validator/AddressGuard.class
console/validator/Catalog$Companion$NONE$1.class
…
lib/core-format-1.0.0.jar
lib/core-prompt-1.0.0.jar
lib/prompts-1.1.0.jar
lib/kotlin-stdlib-2.2.0.jar
lib/json-20240303.jar
lib/aws-lambda-java-core-1.4.0.jar
lib/aws-lambda-java-events-3.16.1.jar
lib/s3-2.55.11.jar
lib/dynamodb-2.55.11.jar
lib/url-connection-client-2.55.11.jar
…
```

いちばん上に自分のクラス、`lib/` に依存の jar が並んでいます。`lib/core-format-1.0.0.jar` が、アプリと同じ確認のコードです（見本のプロンプトは `lib/prompts-1.1.0.jar` から）。

### 3. テストを読む

[MachineReviewTest.kt](../../yorisoi-console/validator/src/test/kotlin/console/validator/MachineReviewTest.kt) のテストの名前:

- a signed package by the publisher, newer than the approved one, passes with its samples（チャンネル提供者が署名した、承認済みより新しいパッケージは、見本つきで合格する）
- the package must be for this channel, by this publisher, and newer（このチャンネルの、このチャンネル提供者の、より新しい版でなければならない）
- station-format's own checks come through with their codes（コアの確認の結果が、そのコードのまま出てくる。テストの名前は station-format のころのまま）
- the icon must be a small PNG, and both problems are reported（アイコンは小さな PNG でなければならず、問題は両方とも伝える）

`MachineReview` が純粋な関数なので、テストは S3 も DynamoDB も使わず、パッケージとアイコンのバイト列を渡すだけで書けています。

素材集の審査のテストは [MaterialsReviewTest.kt](../../yorisoi-console/validator/src/test/kotlin/console/validator/MaterialsReviewTest.kt) にあります。公開中の素材集（`Catalog`）や外の URL を取ってくる部品（`ExternalFetcher`）も、引数で代役を渡しています。たとえば「a channel can't use a collection that isn't listed, isn't granted, or lacks the resource」（リストにない・使う許しがない・その素材がない素材集は使えない）のように、素材ならではの決まりを確かめています。

### 4. アイコンの上限を変えてみる

[MachineReview.kt](../../yorisoi-console/validator/src/main/kotlin/console/validator/MachineReview.kt) の

```kotlin
const val MAX_ICON_SIDE = 256
```

を `128` に変えて、テストを流します。

```sh
./gradlew test
```

```
5 tests completed, 3 failed
```

レポート（`build/reports/tests/test/index.html`）を開くと、たとえば合格するはずのテストが、

```
Failed(findings=[Finding(code=bad_icon, detail=256×256 (max 128×128))], version=3)
```

で落ちています。テストの見本のアイコンは 256×256 で、API-001 の決まり（256×256 以下）どおりです。上限を勝手に変えると、決まりどおりのアイコンまで断ってしまうことを、テストが見つけました。元に戻します。

```sh
git checkout -- src/main/kotlin/console/validator/MachineReview.kt
git status
```

## つまずきやすいところ

- **同じコードを使うためなら、言語を合わせる**: 確認の規則をもう 1 つの言語で書き直すより、同じライブラリを使う方が確か
- **判断を純粋な関数に分ける**: Lambda の入口は読み書きだけ。判断は AWS なしでテストできる
- **JVM の Lambda の zip の形**: クラスはいちばん上、依存は `lib/`
- **JVM は起動が遅い**: 依存を減らす、JIT の設定、メモリ
- **S3 のイベントは、ファイルごとに来る。重なることもある**: 条件つき書き込みで、結果を 1 回だけ書く

## 確認問題

<details>
<summary>問 1. 機械審査だけを Kotlin で書いたのはなぜですか。</summary>

アプリと同じ確認をするために、アプリの確認のコード（Kotlin のコア `core-format`）をそのまま使うためです。同じコードで確かめれば、管理システムで合格したのにアプリで読み込めない、ということが起きません。

</details>

<details>
<summary>問 2. パッケージとアイコンのイベントがほぼ同時に届き、両方の実行が審査まで進みました。結果は 2 回書かれますか。</summary>

書かれません。結果は「状態が `uploading` のときだけ」という条件つきで書くので、先に書いた方だけが成功し、あとの方は `TransactionCanceledException` になって何もせずに終わります。

</details>

<details>
<summary>問 3. 機械審査の Lambda が、HTTP の部品に Netty や Apache ではなく JDK のもの（url-connection-client）を使うのはなぜですか。</summary>

依存が小さく、起動が速いからです。JVM の Lambda は起動（コールドスタート）が遅くなりがちなので、読み込むクラスを減らしています。

</details>

---

前: [8-7 SQS・SES・KMS](07-sqs-ses-kms.md) ／ 次: [9-1 React と Vite](../09-console/01-react-vite.md)
