# 3-1 Coroutines と Flow

[目次](../README.md) ＞ 第 3 部 ＞ 3-1

> Kotlin Coroutines の仕組みと最小の使い方は [技術カード: Kotlin Coroutines](../ref/kotlin-coroutines.md) にあります。

## この章で学ぶこと

- 「待ち」の多い処理（通信、AI、タイマー）を、画面を止めずに書く方法
- `suspend` 関数、`launch`・`async`、スコープ
- 処理をほかのスレッドに移す `withContext(Dispatchers.IO)`
- キャンセルと、構造化された並行性（後片付けを忘れない仕組み）
- `Mutex` で「同時に 1 つだけ」を守る
- Flow（流れ）と StateFlow の関係

## なぜ要るのか

散策ガイドは「待つ」処理だらけです。

| 処理 | 待つ時間 |
|---|---|
| 近くのスポットを Overpass に聞く | 1〜数秒 |
| AI に解説を作ってもらう | 数秒〜十数秒 |
| 天気を Open-Meteo に聞く | 1 秒前後 |
| 30 秒ごとのタイマー | 30 秒 |

Android の画面は **メインスレッド** という 1 本の流れで描かれています。メインスレッドで AI の返事を 10 秒待つと、その間、画面は固まり、ボタンも押せません。数秒続くと、Android は「アプリが応答していません」と表示します。

昔は、待つ処理を別のスレッドで動かし、終わったら **コールバック**（あとで呼んでもらう関数）で結果を受け取っていました。でも、待つ処理が 2 つ、3 つと続くと、コールバックの中にコールバックが入れ子になり、読みにくく、エラーの扱いも難しくなります。

**Kotlin Coroutines**（コルーチン）は、待つ処理を **普通の上から下へのコードのように** 書けるようにする仕組みです。

## suspend 関数

散策ガイドの AI の呼び出し（[GuideRepository.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/guide/GuideRepository.kt)）は、こう宣言されています。

```kotlin
suspend fun guideFor(poi: Poi, distanceM: Int?, channel: Station): String
```

`suspend` は「この関数は途中で **一時停止（中断）** することがある」という印です。

- AI の返事を待つ間、この関数は一時停止する。**その間、スレッドは空いていて、ほかの仕事（画面を描くなど）ができる**
- 返事が来たら、止まったところから続きを実行する
- 呼ぶ側から見ると、普通の関数のように結果（`String`）が返ってくる

[MainViewModel.select](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/ui/MainViewModel.kt) を思い出してください（[2-2](../02-compose/02-state-viewmodel.md)）。`guideFor` は、間に入る `narration`（`suspend` 関数）を通して呼ばれます。

```kotlin
viewModelScope.launch {
    val state = when (val result = app.narration.sheetGuide(item.poi, item.distanceM)) {
        is MaterialResult.Ready -> GuideState.Ready((result.material.content as Content.Text).text)
        is MaterialResult.Unavailable -> GuideState.Failed("解説の生成に失敗しました: ${result.detail}")
        MaterialResult.None -> GuideState.Failed("解説の生成に失敗しました")
    }
    updateSelected(item) { it.copy(guide = state) }
}
```

10 秒かかる AI の呼び出しが、ただの 1 行です。コールバックはどこにもありません。

失敗は、普通の `try`/`catch` で受け止められます。この例では、素材の出どころを順に試す `Producers.first`（[Producer.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/material/Producer.kt)）が受け止めて、`MaterialResult.Unavailable` という値に直して返しています。

```kotlin
val result = try {
    producer.produce(request.copy(context = request.context.copy(after = after)))
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    log("Producer $id failed", e)
    MaterialResult.Unavailable(MaterialResult.Reason.FAILED, e.message)
}
```

`CancellationException` だけを先に捕まえて投げ直している理由は、この章の「つまずきやすいところ」で見ます。

`suspend` 関数は、コルーチンの中か、ほかの `suspend` 関数の中からしか呼べません。

## コルーチンを始める: launch とスコープ

`launch { … }` は、新しいコルーチン（一時停止できる処理のかたまり）を始めます。どこで始めるかを決めるのが **スコープ** です。

| スコープ | 散策ガイドでの場所 | いつ止まるか |
|---|---|---|
| `viewModelScope` | 各 ViewModel | ViewModel が片付けられたとき（画面を閉じたとき） |
| `lifecycleScope` | `WalkService` | Service が壊されたとき（散策を終えたとき） |
| `appScope` | `SanpoApp` が自分で作ったもの | アプリが終わるまで |

スコープが止まると、その中で始めたコルーチンは **全部キャンセルされます**。画面を閉じたのに通信が続く、散策を終えたのにタイマーが動き続ける、ということが起きません。これを **構造化された並行性** と呼びます。

### 散歩の後片付けは appScope で

[WalkService.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/walk/WalkService.kt) の、散歩の記録を保存するところです。

```kotlin
/** Saves the walk so far, in the app scope so a stopping service doesn't cut the write short. */
private fun saveProgress(s: WalkSession) {
    val record = s.toRecord()
    app.appScope.launch { app.history.save(record) }
}
```

散策を終えると `WalkService` は壊され、`lifecycleScope` の中の処理はキャンセルされます。もし記録の保存を `lifecycleScope` で始めていたら、**書き込みの途中で打ち切られる** かもしれません。そこで保存だけは、アプリが終わるまで続く `appScope` で行っています。散歩の終わりのまとめの一言（`finishWalk`）も同じ理由で `appScope` です。

**「この処理は、何が終わったら止まるべきか」を考えてスコープを選ぶ**、というのが大事な点です。

[SanpoApp.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/SanpoApp.kt) は `appScope` をこう作っています。

```kotlin
val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
```

`SupervisorJob()` は、中の 1 つのコルーチンが失敗しても、ほかのコルーチンを巻き添えにしない、という指定です。

## タイマー: キャンセルできるループ

散歩中は、位置が変わらなくても（立ち止まっていても）、休憩の声かけや天気の確認のために定期的に判断する必要があります。`WalkService` のタイマーです。

```kotlin
/** Location updates stop while the user stands still, so rests and time-based talk need a clock. */
private fun startTicker() = lifecycleScope.launch {
    while (isActive) {
        delay(TICK_MS)            // 30 秒
        lastLocation?.let { refreshWeather(it) }
        maybeTalk()
    }
}
```

- `delay(30_000)` は 30 秒の一時停止。`Thread.sleep` と違い、**スレッドを止めない**。待っている間、スレッドはほかの仕事ができる
- `isActive` は、このコルーチンがキャンセルされていないか
- 散策を終えて `WalkService` が壊されると、`lifecycleScope` がキャンセルされ、ループも止まる。止める処理を自分で書く必要はない

`delay` は、キャンセルされると、待っている途中でもすぐに抜けます。ハンズオンで確かめます。

## スレッドを移す: withContext(Dispatchers.IO)

`suspend` 関数は、スレッドを止めずに **待つ** ことはできますが、OkHttp の `execute()` のような **スレッドを止めて待つ** 昔ながらの処理を、メインスレッドで呼んではいけません。そういう処理は、`withContext` でほかのスレッドに移します。

[WeatherClient.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/companion/WeatherClient.kt):

```kotlin
suspend fun current(lat: Double, lon: Double): Weather = withContext(Dispatchers.IO) {
    val url = "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon" + /* … */
    http.newCall(Request.Builder().url(url).build()).execute().use { res ->
        // … JSON を読んで Weather を作る …
    }
}
```

| ディスパッチャ | どのスレッドで動くか | 向いている仕事 |
|---|---|---|
| `Dispatchers.Main` | メインスレッド | 画面に触る、StateFlow を書き換える |
| `Dispatchers.IO` | 通信・ファイル用のスレッドの集まり | 通信、ファイルの読み書き |
| `Dispatchers.Default` | 計算用のスレッドの集まり | 重い計算 |

`withContext(Dispatchers.IO) { … }` は、ブロックの中を IO 用のスレッドで動かし、**終わったら元のスレッドに戻って** 結果を返します。呼ぶ側（メインスレッドの `WalkService`）は、スレッドのことを気にせず `app.weather.current(…)` と呼ぶだけで済みます。

散策ガイドでは、通信する部品（`OverpassClient`、`RouteClient`、`WeatherClient`、`ClaudeClient`、`OpenAiCompatibleClient`、`SpotPhotos`）とファイルを扱う部品（`HistoryStore`）が、どれもこの形で **自分の中で** スレッドを移しています。「スレッドを移すのは、止まる処理を持つ部品の責任」という決まりにしておくと、呼ぶ側はいつでも安全に呼べます。

## 同時に 1 つだけ: Mutex

コルーチンは同時にいくつも動くので、「同時に 1 つだけ」を守りたい場面があります。

### スポットの検索を重ねない

[SpotRepository.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/data/SpotRepository.kt):

```kotlin
private val fetchLock = Mutex()
private var lastFetchAt: Location? = null

/** Updates the location, re-querying spots only after moving [REFETCH_DISTANCE_M]. */
suspend fun onLocation(location: Location, forceRefresh: Boolean = false) {
    _location.value = location
    fetchLock.withLock {
        val last = lastFetchAt
        if (forceRefresh || last == null || last.distanceTo(location) > REFETCH_DISTANCE_M) {
            val found = overpass.search(location.latitude, location.longitude)
            _spots.value = found.spots
            _facilities.value = found.facilities
            lastFetchAt = location
        }
    }
}
```

位置は 10 秒ごとに届きます。検索に数秒かかると、前の検索が終わる前に次の位置が届くことがあります。`withLock` は、ほかのコルーチンが中にいる間、**終わるまで待ってから** 入ります。だから検索が重なりません。2 つ目が入ったときには `lastFetchAt` が更新されているので、300m 動いていなければ検索し直しません。

`Mutex` は Java の `synchronized` に似ていますが、待つ間スレッドを止めず、一時停止するだけです。

### 話している間の話は見送る

`WalkService` は、話しかけが重ならないように、`Mutex` を少し違う使い方をしています。

```kotlin
/** One line at a time; events that arrive while the companion is talking wait for the next tick. */
private val talking = Mutex()

private inline fun talk(block: () -> Unit) {
    if (!talking.tryLock()) return
    try {
        block()
    } finally {
        talking.unlock()
    }
}
```

`withLock` は「空くまで待つ」でしたが、`tryLock()` は「空いていれば入る、空いていなければ **すぐ諦める**」です。AI が次の言葉を作っている最中に別の出来事が起きても、待たせずに見送ります。見送った出来事は、30 秒後のタイマーでもう一度判断されます（コメント: "wait for the next tick"）。話しかけがたまって、あとで続けざまにしゃべり出すことがありません。

`finally` で必ず `unlock` しているのは、`block` の中で例外が起きても鍵を返すためです。返し忘れると、二度と話せなくなります。

`talk` が `inline` なのには理由があります。`talk` 自体は `suspend` ではありませんが、`inline` にするとブロックの中身が呼んだ場所に埋め込まれるので、ブロックの中で `app.narration.line(…)`（`suspend` 関数）を呼べます。

## Flow: 値の流れ

**Flow** は「時間とともに次々に届く値の流れ」です。[2-2](../02-compose/02-state-viewmodel.md) の StateFlow は、Flow の一種で「今の値を 1 つ持つ」ものでした。

| | Flow | StateFlow |
|---|---|---|
| 今の値 | ない | いつも 1 つある（`.value`） |
| 値が流れ出すとき | 集め始めたとき（`collect`） | いつでも。集める人が来たら今の値から |
| 向いているもの | 次々に起きる出来事、計算の途中 | 「今の状態」 |

散策ガイドは、時計を Flow で作っています（[MoodSource.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/mood/MoodSource.kt)、[2-4](../02-compose/04-theme-mood.md)）。

```kotlin
private val clock = flow {
    while (true) {
        emit(System.currentTimeMillis())   // 値を流す
        delay(CLOCK_MS)                     // 1 分待つ
    }
}
```

`flow { … }` の中で `emit` した値が、集めている側に届きます。これを `combine` で位置や天気と組み合わせ、`stateIn` で StateFlow にしていました。

`WalkService` は、設定・雰囲気・チャンネルの 3 つの StateFlow を組み合わせて、背景音を決めています。

```kotlin
private fun startAmbient() = lifecycleScope.launch {
    combine(app.settings.settings, app.mood.mood, app.stations.current, ::Triple).collect { (settings, mood, station) ->
        // … 背景音を合わせる …
    }
}
```

`collect` は、Flow が続く限り終わらない `suspend` 関数です。`lifecycleScope.launch` の中で呼ぶので、散策が終わると一緒に止まります。

## ハンズオン: コルーチンの振る舞いを確かめる

### 1. 練習用のテストを置いて流す

[scripts/CoroutinePracticeTest.kt](scripts/CoroutinePracticeTest.kt) をコピーして流します。

```sh
cd /c/Dev/apps/SanpoGuide
cp ../sanpo-tutorial/03-walk/scripts/CoroutinePracticeTest.kt app/src/test/java/io/github/duwenji/sanpoguide/
./gradlew :app:testDebugUnitTest --tests '*CoroutinePracticeTest*'
```

5 件のテストが通ります。中身は次のとおりです。

| テスト | 確かめること |
|---|---|
| suspend functions run in order | `suspend` 関数を 2 つ続けて呼ぶと、順番に待つので約 600ms かかる |
| async runs them at the same time | `async` で同時に始めると、300ms 台で済む |
| a ticker loop stops when its job is cancelled | `WalkService` のタイマーと同じ形のループが、キャンセルで止まる |
| withContext moves the work to another thread | `withContext(Dispatchers.IO)` の中は別のスレッドで動き、終わると戻る |
| tryLock drops a line … | `WalkService.talk` と同じ形で、話している最中の話が見送られる |

`runBlocking { … }` は、テストの中でコルーチンを動かし、終わるまで待つための道具です（アプリのコードでは使いません）。

### 2. 同時に待つ: async

```kotlin
@Test
fun `async runs them at the same time`() = runBlocking {
    val start = System.currentTimeMillis()
    val weather = async { fetchWeather() }
    val spots = async { fetchSpots() }
    assertEquals("晴れ", weather.await())
    assertEquals(2, spots.await().size)
    val took = System.currentTimeMillis() - start
    assertTrue("同時に待つので 300ms 台で済む: $took", took < 550)
}
```

`async { … }` は、`launch` と同じくコルーチンを始めますが、**結果を後で受け取れる**（`await()`）ものです。天気とスポットの取得（どちらも 300ms 待つ）を同時に始めるので、待ち時間が重なります。

`async` を外して、`val weather = fetchWeather()`・`val spots = fetchSpots()` に変え、`await()` も消して流してみてください。

```
java.lang.AssertionError: 同時に待つので 300ms 台で済む: 621
```

順番に待つので 600ms を超え、テストが落ちます。

### 3. 話の見送り

```kotlin
launch { talk("スポットの案内") }
delay(50)
launch { talk("雑談") }       // 話している最中に来た
delay(400)
launch { talk("天気の一言") } // 話し終わってから来た
// …
assertEquals(listOf("話す: スポットの案内", "見送り: 雑談", "話す: 天気の一言"), log)
```

`tryLock()` を `talking.lock()`（空くまで待つ）に変えると、結果はどうなるでしょうか。予想してから試してください。

<details>
<summary>答え</summary>

「雑談」が見送られずに、スポットの案内が終わるのを待ってから話されます。`log` は `話す: スポットの案内`、`話す: 雑談`、`話す: 天気の一言` になり、テストは落ちます。散策ガイドがこうしないのは、話しかけがたまって続けざまにしゃべるのを避けるためです。

</details>

### 4. 片付け

```sh
rm app/src/test/java/io/github/duwenji/sanpoguide/CoroutinePracticeTest.kt
git status
```

## つまずきやすいところ

- **メインスレッドで止まる処理を呼ばない**: OkHttp の `execute()` やファイルの読み書きは、`withContext(Dispatchers.IO)` の中で
- **スコープを選ぶ**: 画面に結びつく処理は `viewModelScope`、Service に結びつく処理は `lifecycleScope`、途中で打ち切られては困る保存は `appScope`
- **`GlobalScope` を使わない**: どこにも結びつかないので、だれも止めてくれません
- **`CancellationException` を握りつぶさない**: `catch (e: Exception)` はキャンセルの知らせも捕まえてしまいます。散策ガイドの `MainViewModel` や `Producers.first` は、キャンセルを捕まえたら投げ直しています（`catch (e: CancellationException) { throw e }`）

## 確認問題

<details>
<summary>問 1. 散歩の記録の保存を、<code>lifecycleScope</code> ではなく <code>appScope</code> で始めるのはなぜですか。</summary>

散策を終えると `WalkService` が壊され、`lifecycleScope` の中の処理はキャンセルされるからです。保存がその途中で打ち切られないよう、アプリが終わるまで続く `appScope` で行います。

</details>

<details>
<summary>問 2. <code>WeatherClient.current</code> の中で <code>withContext(Dispatchers.IO)</code> を使うのはなぜですか。呼ぶ側でスレッドを移さないのはなぜですか。</summary>

OkHttp の `execute()` はスレッドを止めて待つので、メインスレッドで呼ぶと画面が固まるからです。スレッドを移すのを止まる処理を持つ部品自身の責任にしておけば、呼ぶ側はどのスレッドからでも安全に呼べます。

</details>

<details>
<summary>問 3. <code>SpotRepository</code> は <code>withLock</code>、<code>WalkService</code> は <code>tryLock</code> を使っています。違いは何ですか。</summary>

`withLock` は、ほかが中にいれば空くまで待ってから入ります（スポットの検索は、待ってでも順番に行えばよい）。`tryLock` は、空いていなければすぐ諦めます（話している最中の話は見送り、次のタイマーで判断し直す）。

</details>

---

次: [3-2 常駐サービス](02-service.md)
