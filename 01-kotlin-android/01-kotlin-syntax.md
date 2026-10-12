# 1-1 Kotlin の文法

[目次](../README.md) ＞ 第 1 部 ＞ 1-1

## この章で学ぶこと

- 散策ガイドのコードを読むのに必要な Kotlin の文法
- Java や JavaScript・TypeScript との違い
- とくに大事な **null 安全** と、`!!` の危うさ

文法を網羅はしません。散策ガイドに実際に出てくる書き方を、実際のコードで見ていきます。

## Kotlin とは

Kotlin は JetBrains が作ったプログラミング言語で、Android の開発では Google が第一の言語として勧めています。Java と同じ JVM の上で動き、Java のライブラリをそのまま使えます。そのうえで、Java より短く書け、**null による事故が起きにくい** ように作られています。

散策ガイドは Kotlin 2.2 で書かれています。

## 試しながら読むには

この章の短い例は、インストールなしで [Kotlin Playground](https://play.kotlinlang.org/)（ブラウザで Kotlin を動かせる公式のサイト）に貼れば動きます。手元の散策ガイドのコードは、章末のハンズオンで動かします。

## 変数: `val` と `var`

```kotlin
val name = "鎌倉歴史散歩"   // 変えられない（再代入できない）
var count = 0              // 変えられる
count += 1
```

- `val` は再代入できない変数、`var` はできる変数です。**迷ったら `val`** が Kotlin の習慣で、散策ガイドのコードもほとんどが `val` です
- 型は書かなくても推論されます。書くときは `val name: String = "…"` のように名前の後ろに書きます（TypeScript と同じ並び）

## 関数

```kotlin
fun distanceLabel(meters: Int): String {
    return "${meters}m"
}

// 本体が式 1 つなら、= で書ける
fun distanceLabel(meters: Int) = "${meters}m"
```

- `fun 名前(引数: 型): 戻り値の型` の形です
- `"${式}"` で文字列に値を埋め込めます。変数 1 つなら `"$name"` でも書けます
- 引数には **既定値** を付けられ、呼ぶときに **名前で指定** もできます

実際のコード（[FacilityAdvisorTest.kt](../../SanpoGuide/apps/sanpoguide/app/src/test/java/io/github/duwenji/sanpoguide/companion/FacilityAdvisorTest.kt)）:

```kotlin
private fun pick(
    nearby: List<Pair<Facility, Float>>,
    elapsedMin: Long,
    weather: Weather? = mild,
    mentioned: Set<String> = emptySet(),
    lastAt: Map<FacilityNeed, Long> = emptyMap(),
) = FacilityAdvisor.pick(nearby, elapsedMin * minute, weather, mentioned, lastAt, now)

// 呼ぶ側: 必要な引数だけを名前つきで渡す
pick(listOf(vending to 20f), elapsedMin = 20, weather = hot)
```

`weather`・`mentioned`・`lastAt` には既定値があるので、省略できます。Java のように、引数の組み合わせごとに関数を何個も書く必要がありません。

`vending to 20f` は `Pair(vending, 20f)`（2 つの値の組）を作る書き方です。`20f` は `Float` 型の 20 です。

## null 安全

Kotlin でいちばん大事な仕組みです。

### null になりうる型と、ならない型

```kotlin
val a: String = "鎌倉"     // null は入れられない
val b: String? = null      // ? を付けると null も入れられる
```

型の後ろに `?` を付けた型だけが null を持てます。**`String` 型の変数は絶対に null にならない** とコンパイラが保証するので、Java でよくある NullPointerException（null の変数を使って落ちる事故）が、`?` の付いていない型では起きません。

散策ガイドの [Poi.kt](../../SanpoGuide/platform/kit-geo/src/main/java/io/github/duwenji/michizure/kit/geo/Poi.kt)（スポット）では:

```kotlin
data class Poi(
    val id: String,
    val name: String,
    // …
    /** Outline for spots mapped as areas or lines; null for points. */
    val shape: Shape? = null,
)
```

スポットには名前が必ずあり（`String`）、形（公園の境界など）はないこともある（`Shape?`）。型を見るだけで、どの値が欠けうるかが分かります。

### null になりうる値の扱い方

`?` の付いた値は、そのままでは使えません。コンパイラが「null かもしれないよ」と止めます。扱い方は次のとおりです。

| 書き方 | 意味 | 例 |
|---|---|---|
| `if (x != null)` | null でないと確かめたら、その中では普通に使える | `if (shape != null) shape.isArea` |
| `x?.y` | x が null なら、全体が null になる | `shape?.isArea` |
| `x ?: 代わり` | x が null なら、代わりの値を使う（エルビス演算子） | `name ?: "名前なし"` |
| `x?.let { … }` | x が null でないときだけ、ブロックを実行する | 下の例 |
| `x!!` | 「null ではない」と断言する。**null なら落ちる** | テストのコードなど |

[Poi.kt](../../SanpoGuide/platform/kit-geo/src/main/java/io/github/duwenji/michizure/kit/geo/Poi.kt) の `distanceFrom` から:

```kotlin
fun distanceFrom(location: Location): Float {
    shape?.let { return it.distanceM(location.latitude, location.longitude).toFloat() }
    val result = FloatArray(1)
    Location.distanceBetween(location.latitude, location.longitude, lat, lon, result)
    return result[0]
}
```

形があれば（`shape` が null でなければ）境界までの距離を返し、なければ中心の点までの距離を計算します。`let` のブロックの中では、null でないと分かった値を `it` で受け取ります。

[Thresholds](../../SanpoGuide/apps/sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/settings/Threshold.kt) の `get` から:

```kotlin
operator fun get(t: Threshold): Int = (values[t] ?: t.default).coerceIn(t.min, t.max)
```

散策者が設定した値（`values[t]`、設定していなければ null）があればそれを、なければ既定値を使い、範囲に収めます。

### `!!` は「ここで落ちてよい」という宣言

`!!` は、null 安全をわざと外す書き方です。null だったらその場で NullPointerException で落ちます。散策ガイドでは主にテストのコードで使われています。テストなら、期待した値が返らなかったときに落ちるのは正しい振る舞いだからです。章末のハンズオンで、実際に `!!` で落ちるところを見ます。

## クラス

### データクラス

値をまとめて持つだけのクラスは `data class` にします。

```kotlin
data class Facility(val id: String, val kind: FacilityKind, val lat: Double, val lon: Double, val name: String?)
```

これだけで、次のものが自動で作られます。

- 中身で比べる `==`（Java の `equals`）
- 中身を表示する `toString()`（`Facility(id=t, kind=TOILETS, …)`）
- 一部だけ変えた写しを作る `copy`

`copy` は散策ガイドでよく使われます。[Thresholds](../../SanpoGuide/apps/sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/settings/Threshold.kt) の `with`:

```kotlin
fun with(t: Threshold, value: Int) = copy(values = values + (t to value))
```

自分を書き換えず、`values` だけを変えた **新しい** `Thresholds` を返します。値を書き換えずに新しく作る書き方は、第 2 部の画面の状態の扱いでも大事になります。

### 列挙型（enum）

決まった選択肢は `enum class` にします。Kotlin の enum は、それぞれの値に項目を持たせられます。[Facility.kt](../../SanpoGuide/platform/kit-geo/src/main/java/io/github/duwenji/michizure/kit/geo/Facility.kt):

```kotlin
enum class FacilityKind(val label: String, val amenity: String) {
    TOILETS("トイレ", "toilets"),
    DRINKING_WATER("水飲み場", "drinking_water"),
    VENDING_MACHINE("自動販売機", "vending_machine"),
    SHELTER("休憩所", "shelter"),
    BENCH("ベンチ", "bench");

    companion object {
        fun of(amenity: String?): FacilityKind? = entries.firstOrNull { it.amenity == amenity }
    }
}
```

画面に出す日本語（`label`）と、OpenStreetMap のタグの値（`amenity`）を一緒に持っています。`entries` は全部の値の一覧です。

設定のしきい値（[Threshold.kt](../../SanpoGuide/apps/sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/settings/Threshold.kt)）も enum で、項目ごとに見出し・単位・既定値・範囲を持っています。設定画面は、この一覧から自動で作られます。

### `companion object` と `object`

- `companion object { … }` の中に書いたものは、インスタンスを作らずに `FacilityKind.of(…)` のように呼べます。Java の `static` に近いものです
- `object 名前 { … }` は、インスタンスが 1 つだけのクラスを定義します。状態を持たない処理をまとめるのに使います（例: `object FacilityAdvisor`）

### sealed: 種類が決まっている型

「散歩で起きたこと」には、開始・再訪・休憩・天気の急変・終了…と決まった種類があります。[WalkCompanion.kt](../../SanpoGuide/apps/sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/companion/WalkCompanion.kt):

```kotlin
sealed interface TalkEvent {
    data object Start : TalkEvent
    data class Revisit(val poi: Poi, val pastVisits: List<SpotVisit>) : TalkEvent
    data object Milestone : TalkEvent
    data class Rest(val minutes: Int) : TalkEvent
    data class Sunset(val minutes: Int) : TalkEvent
    data class WeatherTurn(val change: WeatherChange) : TalkEvent
    data class NearFacility(val advice: FacilityAdvice, val direction: String?) : TalkEvent
    data class Finish(val walk: WalkRecord) : TalkEvent
}
```

`sealed` は「この型の種類は、ここに書いたものだけ」という意味です。enum と違い、種類ごとに違う項目を持てます（休憩なら分数、天気の急変なら変化の内容）。

## `when`: 種類ごとに分ける

`when` は Java の `switch` を強くしたもので、値を返す **式** です。

```kotlin
private fun kindOf(event: TalkEvent) = when (event) {
    TalkEvent.Start -> Prompts.Event.START
    is TalkEvent.Revisit -> Prompts.Event.REVISIT
    TalkEvent.Milestone -> Prompts.Event.MILESTONE
    is TalkEvent.Rest -> Prompts.Event.REST
    is TalkEvent.Sunset -> Prompts.Event.SUNSET
    is TalkEvent.WeatherTurn -> Prompts.Event.WEATHER_CHANGE
    is TalkEvent.NearFacility -> Prompts.Event.FACILITY
    is TalkEvent.Finish -> Prompts.Event.FINISH
}
```

`TalkEvent` が `sealed` なので、コンパイラは種類が全部でいくつあるか知っています。**1 つでも書き忘れるとコンパイルエラー** になります。新しい種類の出来事を足したとき、扱いを書き忘れた場所をコンパイラが全部教えてくれます。`else` を書かないのはそのためです（`else` を書くと、この確認が働かなくなります）。

`is TalkEvent.Revisit` は「`Revisit` 型なら」という意味で、その枝の中では `event` を `Revisit` として使えます（スマートキャスト）。

## ラムダとコレクション

`{ … }` で書く小さな関数を **ラムダ** と呼びます。リストの操作でよく使います。

```kotlin
val names = facilities.filter { it.kind == FacilityKind.BENCH }.map { it.name ?: "ベンチ" }
```

- 引数が 1 つのラムダでは、その引数を `it` で受け取れます
- 最後の引数がラムダなら、`( )` の外に出して書けます（`filter { … }`）
- よく使う操作: `filter`（絞り込む）、`map`（変換する）、`firstOrNull`（最初の 1 つ、なければ null）、`any`（1 つでも当てはまるか）、`sortedBy`（並べ替える）

JavaScript の `array.filter(x => …).map(x => …)` とほぼ同じ感覚で読めます。

## スコープ関数: `let`・`apply`・`run`

オブジェクトに対して、ブロックの中でまとめて処理する関数です。最初は戸惑いやすいので、散策ガイドに出てくるものだけ挙げます。

| 関数 | ブロックの中での対象 | 返すもの | よくある使い道 |
|---|---|---|---|
| `x?.let { … }` | `it` | ブロックの結果 | null でないときだけ処理する |
| `x.apply { … }` | `this`（省略できる） | x 自身 | 作ったオブジェクトの設定をまとめる |
| `x.run { … }` | `this` | ブロックの結果 | オブジェクトを使って値を計算する |

[SanpoApp.kt](../../SanpoGuide/apps/sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/SanpoApp.kt) の `apply`:

```kotlin
getSystemService(NotificationManager::class.java).apply {
    createNotificationChannel(NotificationChannel(CHANNEL_WALK, "散策モード", NotificationManager.IMPORTANCE_LOW))
    createNotificationChannel(NotificationChannel(CHANNEL_SPOT, "スポット案内", NotificationManager.IMPORTANCE_HIGH))
    // …
}
```

ブロックの中では `this` が `NotificationManager` なので、`manager.createNotificationChannel(…)` の `manager.` を省けます。

## 拡張関数

既存のクラスに、外から関数を足したように見せる書き方です。[ChannelStore.kt](../../SanpoGuide/apps/sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/station/remote/ChannelStore.kt) から:

```kotlin
private fun JSONObject.str(key: String): String? = if (has(key) && !isNull(key)) getString(key) else null
```

`JSONObject` は Android のクラスで、書き換えられません。それでも、こう書くと `json.str("name")` のように、まるで `JSONObject` の関数のように呼べます。中では `this` が `JSONObject` です。`private` なので、このファイルの中だけで使えます。

## Java・TypeScript との対応表

| やりたいこと | Kotlin | Java | TypeScript |
|---|---|---|---|
| 変わらない変数 | `val x = 1` | `final int x = 1;` | `const x = 1` |
| null を許す型 | `String?` | （区別しない） | `string \| null` |
| 値の組のクラス | `data class P(val a: Int)` | `record P(int a)` | `interface P { a: number }` |
| 種類ごとの分岐 | `when (x) { … }` | `switch` | `switch` |
| 文字列の埋め込み | `"$a ${b + 1}"` | `"" + a + (b + 1)` | `` `${a} ${b + 1}` `` |
| ラムダ | `{ x -> x * 2 }` | `x -> x * 2` | `x => x * 2` |
| static | `companion object` | `static` | `static` |

## ハンズオン: 散策ガイドのテストを動かして壊す

散策ガイドの「施設の案内」の判定（[FacilityAdvisor.kt](../../SanpoGuide/apps/sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/companion/FacilityAdvisor.kt)）には、Android に依存しない単体テストがあります。

### 1. テストを流す

```sh
cd /c/Dev/apps/SanpoGuide
./gradlew :apps:sanpoguide:app:testDebugUnitTest --tests '*FacilityAdvisorTest*'
```

`BUILD SUCCESSFUL` になれば、9 件のテストが通っています。

### 2. テストを読む

[FacilityAdvisorTest.kt](../../SanpoGuide/apps/sanpoguide/app/src/test/java/io/github/duwenji/sanpoguide/companion/FacilityAdvisorTest.kt) を開き、この章の文法を探してみてください。

```kotlin
@Test
fun `a close toilet comes up after walking a while`() {
    assertNull(pick(listOf(toilet to 150f), elapsedMin = 30))
    val advice = pick(listOf(toilet to 90f), elapsedMin = 30)!!
    assertEquals(FacilityNeed.TOILET, advice.need)
    assertEquals(90, advice.distanceM)
}
```

- 関数名を `` ` `` で囲むと、空白を含む文章を名前にできます。テストでよく使う書き方です
- 「30 分歩いたとき、150m 先のトイレは案内しない。90m 先なら案内する」という意味です
- `pick(…)` は `FacilityAdvice?`（null かもしれない）を返します。`!!` で「ここは必ず案内が返るはず」と断言しています

### 3. 既定値を変えて、壊す

[Threshold.kt](../../SanpoGuide/apps/sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/settings/Threshold.kt) で、トイレを案内する距離の既定値を探します。

```kotlin
TOILET_RADIUS_M("トイレの案内", "案内する距離", "m", 100, 20, 500),
```

`100` を `80` に変えて保存し、もう一度テストを流します。

```
9 tests completed, 1 failed
```

レポート（`apps/sanpoguide/app/build/reports/tests/testDebugUnitTest/index.html`）を開くと、`a close toilet comes up after walking a while` が **NullPointerException** で落ちています。

案内する距離が 80m になったので、90m 先のトイレは案内されなくなり、`pick(…)` が null を返しました。そこに `!!` が付いていたので、その場で落ちたのです。`!!` が「null ならここで落ちる」という宣言であることが、よく分かる例です。

### 4. 元に戻す

```sh
git checkout -- apps/sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/settings/Threshold.kt
git status
```

`git status` に何も出なければ元どおりです。

## つまずきやすいところ

- **`!!` を気軽に使わない**: コンパイラの null の確認を黙らせるだけで、null が来れば落ちます。本体のコードでは `?.`・`?:`・`let` で扱います
- **`when` に `else` を書かない**: sealed や enum を分けるときに `else` を書くと、種類を足したときの書き忘れをコンパイラが見つけられなくなります
- **`data class` の `==` は中身で比べる**: 同じ中身の別のインスタンスでも `true` になります。同じインスタンスかを比べたいときは `===` です

## 確認問題

<details>
<summary>問 1. <code>val shape: Shape?</code> のとき、<code>shape.isArea</code> と書くとどうなりますか。どう書けばよいですか。</summary>

コンパイルエラーになります（null かもしれない値をそのまま使えない）。`shape?.isArea`（null なら全体が null）や、`shape?.isArea == true`（null なら false 扱い）のように書きます。散策ガイドの `Poi.isInside` は後者の書き方です。

</details>

<details>
<summary>問 2. <code>TalkEvent</code> に新しい種類 <code>Rainbow</code> を足すと、<code>kindOf</code> はどうなりますか。</summary>

`when` に `Rainbow` の枝がないので、コンパイルエラーになります。`TalkEvent` が sealed なので、コンパイラが種類の書き忘れを見つけてくれます。

</details>

<details>
<summary>問 3. <code>thresholds.with(Threshold.TOILET_RADIUS_M, 80)</code> を呼んだあと、<code>thresholds</code> の中身は変わっていますか。</summary>

変わっていません。`with` は `copy` で新しい `Thresholds` を作って返すだけです。使うには、戻り値を受け取る必要があります。

</details>

---

次: [1-2 Gradle とビルド](02-gradle.md)
