# 3-3 位置情報とセンサー

[目次](../README.md) ＞ 第 3 部 ＞ 3-3

> 位置情報を受け取る仕組みと最小の使い方は [技術カード: Fused Location](../ref/fused-location.md) にあります。

## この章で学ぶこと

- 端末の位置を受け取る 2 つの方法（今の位置を 1 回、散歩の間ずっと）
- GPS の「揺れ」を、距離や休憩の判定に持ち込まない工夫
- 方位センサーで、散策者が向いている方向を知る方法
- 角度を計算するときの落とし穴（359° と 1° は 2° しか違わない）

## 位置を受け取る: Fused Location Provider

Android の端末は、いくつかの方法で位置を知ります。

| 方法 | 精度 | 電池 | 屋内 |
|---|---|---|---|
| GPS（衛星） | 数 m | 多く使う | 弱い |
| Wi-Fi の電波 | 数十 m | 少ない | 使える |
| 携帯電話の基地局 | 数百 m〜 | 少ない | 使える |

散策ガイドは、Google Play 開発者サービスの **Fused Location Provider**（融合された位置情報）を使います。「どのくらいの精度がほしいか」を伝えると、GPS・Wi-Fi・基地局などを組み合わせて、電池と精度のつり合いを取りながら位置を届けてくれます。自分で GPS を直接扱うより、ずっと簡単で賢い方法です。

```kotlin
private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
```

`by lazy` は「最初に使われたときに作る」という意味です（[WalkService.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/walk/WalkService.kt)）。

### 今の位置を 1 回: 画面

メイン画面の「周辺を再検索」では、今の位置を 1 回だけ取ります（[MainViewModel.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/ui/MainViewModel.kt) の `refresh`）。

```kotlin
val loc = fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null).await()
    ?: fused.lastLocation.await()
if (loc == null) {
    _error.value = "現在地を取得できませんでした"
} else {
    // … スポットを検索する …
}
```

- `getCurrentLocation(…)`: 新しく位置を測る。精度の高い方法を頼む（`PRIORITY_HIGH_ACCURACY`）
- それで取れなければ（`?:`）、`lastLocation`（端末が最後に知っていた位置）を使う
- それもなければ、エラーを表示する

`getCurrentLocation` は Google の非同期の仕組み（`Task`）を返します。`kotlinx-coroutines-play-services` のライブラリの `.await()` を付けると、`suspend` 関数のように **結果が来るまで一時停止して待つ** ことができます（[3-1](01-coroutines.md)）。コールバックの入れ子になりません。

その前に、端末の位置情報の設定がオフになっていないかも確かめています。

```kotlin
private fun isLocationEnabled(): Boolean =
    app.getSystemService(LocationManager::class.java)?.let(LocationManagerCompat::isLocationEnabled) ?: false
```

オフなら、位置を取りに行かず、メイン画面に「端末の位置情報がオフのため、現在地を取得できません。タップして設定を開く」という帯を出します。権限があっても、設定がオフなら位置は取れません。帯をタップして設定でオンにして戻ってくると、[1-3](../01-kotlin-android/03-android-components.md) で見た `onResume` の `recheckLocationSetting` が検索し直します。

### 散歩の間ずっと: WalkService

散歩中は、位置の更新を受け取り続けます。

```kotlin
@SuppressLint("MissingPermission") // Checked by MainActivity before starting the service.
private fun startLocationUpdates() {
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L)
        .setMinUpdateDistanceMeters(10f)
        .build()
    fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
}

private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
        result.lastLocation?.let(::onLocation)
    }
}
```

| 指定 | 意味 |
|---|---|
| `PRIORITY_HIGH_ACCURACY` | 精度を優先する（散歩なので数 m の精度がほしい） |
| `10_000L` | 10 秒ごとに更新してほしい |
| `setMinUpdateDistanceMeters(10f)` | 10m 以上動いたときだけ届ける。立ち止まっていると届かない |
| `Looper.getMainLooper()` | コールバックをメインスレッドで呼ぶ |

- `object : LocationCallback() { … }` は、クラスに名前を付けずにその場で作る書き方（オブジェクト式）です
- `@SuppressLint("MissingPermission")` は、「権限の確認はほかでしている」と lint の警告を黙らせる印です。コメントのとおり、`MainActivity` が権限を確かめてから Service を起動します
- 止めるのは `onDestroy` の `fused.removeLocationUpdates(callback)`（[3-2](02-service.md)）

「10m 以上動いたときだけ」なので、**立ち止まっていると位置の更新が来ません**。休憩の声かけ（4 分とどまったら）は位置の更新では判断できないので、30 秒ごとのタイマーが要るのです（[3-1](01-coroutines.md) の `startTicker` のコメント: "Location updates stop while the user stands still, so rests and time-based talk need a clock."）。

## 位置が届いたら

```kotlin
private fun onLocation(location: Location) {
    val s = session ?: return
    lastLocation = location
    s.onLocation(location)          // 距離と休憩の判定
    app.feed.update(s)              // 画面の数字を更新
    lifecycleScope.launch {
        if (!greeted) {             // 最初の位置で、天気を取ってあいさつ
            greeted = true
            refreshWeather(location)
            talk {
                if (app.stations.current.value.talksOn(TalkEventKind.START)) speakLine(app.narration.line(TalkEvent.Start, s, weather))
                // The channel's own cues for the start come after the greeting (API-003 `event: start`).
                eventCues(s, CueEvent.START, Subject.Event(TalkEvent.Start))
            }
        }
        try {
            app.spots.onLocation(location)   // 300m 動いたらスポットを検索し直す（3-1 の Mutex）
        } catch (e: Exception) {
            Log.w(TAG, "Spot search failed", e)
        }
        maybeTalk()                 // 話すかどうか（3-4）
    }
}
```

あいさつを最初の位置が届いてからにしているのは、天気を取るのに位置が要るからです（「晴れていますね」のように天気に触れたあいさつにするため）。

## GPS の揺れを持ち込まない

GPS の位置は、止まっていても数 m〜十数 m 揺れます。揺れをそのまま足すと、立っているだけで距離が増えていきます。[WalkSession.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/companion/WalkSession.kt) は、3 つの工夫で揺れを除いています。

```kotlin
/** Adds movement to the distance, ignoring GPS jitter and poor fixes. */
fun onLocation(location: Location) {
    if (location.hasAccuracy() && location.accuracy > MAX_ACCURACY_M) return
    val last = lastCounted
    if (last == null) {
        lastCounted = location
        route += LatLon(location.latitude, location.longitude)
    } else {
        val step = last.distanceTo(location)
        if (step >= MIN_STEP_M) {
            distanceM += step
            lastCounted = location
            if (route.size < MAX_ROUTE_POINTS) route += LatLon(location.latitude, location.longitude)
        }
    }
    trackRest(location)
}

private companion object {
    const val MAX_ACCURACY_M = 50f
    const val MIN_STEP_M = 8f
    const val REST_RADIUS_M = 30f
    const val MAX_ROUTE_POINTS = 3000
}
```

1. **精度の悪い位置は捨てる**: `location.accuracy` は「本当の位置は、この半径（m）の中にある」という見積もりです。50m より悪い位置（ビルの谷間や屋内など）は使いません
2. **8m 未満の動きは足さない**: 前に数えた位置から 8m 以上離れたときだけ、その距離を足します。比べる相手は「直前に届いた位置」ではなく「最後に数えた位置」（`lastCounted`）です。こうすると、小さな揺れが積み重なりません
3. **経路は 3,000 点まで**: 長い散歩で記録が大きくなりすぎないように

### 休憩の判定

```kotlin
private fun trackRest(location: Location) {
    val anchor = restAnchor
    if (anchor == null || anchor.distanceTo(location) > REST_RADIUS_M) {
        restAnchor = location
        restSince = location.time.takeIf { it > 0 } ?: System.currentTimeMillis()
        restRemarked = false
    }
}

/** Minutes the user has stayed within [REST_RADIUS_M], or 0 if moving. */
fun restMinutes(now: Long = System.currentTimeMillis()): Int =
    if (restAnchor == null) 0 else ((now - restSince) / 60_000).toInt()
```

「錨（いかり、`restAnchor`）」を下ろした位置から 30m 以内にいる間は、とどまっているとみなします。30m より離れたら、そこに錨を下ろし直し、時間を測り直します。ベンチで座っている間に GPS が 10〜20m 揺れても、休憩は途切れません。

`restMinutes` は、今の時刻（`now`）を引数で受け取れるようになっています（既定値は今の時刻）。[2-3](../02-compose/03-manual-di.md) で見た「時刻も依存」の考え方です。

### 「近くに来た」の距離

スポットに「60m 以内に来たら案内する」の 60m は、公園や境内のように広さのあるスポットでは、中心ではなく **境界** からの距離で測ります（[Poi.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/Poi.kt) の `distanceFrom`、[1-1](../01-kotlin-android/01-kotlin-syntax.md) で読みました）。大きな公園の中心から 60m では、敷地に入っても案内されないことがあるからです。

## 向いている方向: 方位センサー

地図の上の現在地の点には、散策者が向いている方向が扇形で描かれます（[README](../../yorisoi-sanpoguide/README.md) の「ルートと向き」）。その向きを決めているのが [Heading.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/map/Heading.kt) の `rememberHeading` です。

```kotlin
/**
 * Which way the user faces, in degrees clockwise from true north; null when unknown.
 *
 * The compass gives it even while standing, which is when people look at the map. Phones
 * without one fall back to the GPS heading, which only exists while walking.
 * The sensor runs only while the screen is in front of the user (resumed).
 */
@Composable
fun rememberHeading(location: Location?): Float? {
    val context = LocalContext.current
    val sensors = remember { context.getSystemService(Context.SENSOR_SERVICE) as SensorManager }
    val rotation = remember { sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) }
    val compass = remember { mutableStateOf<Float?>(null) }
    val currentLocation by rememberUpdatedState(location)

    if (rotation != null) {
        LifecycleResumeEffect(sensors) {
            val listener = object : SensorEventListener { /* … 下で説明 … */ }
            sensors.registerListener(listener, rotation, SensorManager.SENSOR_DELAY_UI)
            onPauseOrDispose { sensors.unregisterListener(listener) }
        }
        return compass.value
    }
    return location?.takeIf { it.hasBearing() && it.speed >= MIN_HEADING_SPEED }?.bearing
}
```

### 2 つの方法

| 方法 | いつ使えるか | 散策ガイドでは |
|---|---|---|
| **方位センサー**（回転ベクトル） | 立ち止まっていても | 端末にセンサーがあれば、こちら |
| **GPS の進行方向**（`location.bearing`） | 歩いているときだけ | センサーがない端末の代わり |

コメントのとおり、人が地図を見るのは **立ち止まったとき** です。GPS の進行方向は動いていないと分からないので、センサーを優先しています。GPS の進行方向は、秒速 0.5m（ゆっくり歩くくらい）より遅いと揺れが大きいので使いません。

### 画面が見えている間だけセンサーを動かす

```kotlin
LifecycleResumeEffect(sensors) {
    // … センサーに登録する …
    onPauseOrDispose { sensors.unregisterListener(listener) }
}
```

`LifecycleResumeEffect` は、画面が前に出たとき（`onResume`）にブロックを実行し、画面が隠れたとき（`onPause`）か部品が消えたときに `onPauseOrDispose` を実行する Compose の仕組みです。センサーは電池を使うので、画面を見ていないときは止めます。登録と解除を **1 か所に組で書ける** ので、解除し忘れが起きません。

`rememberHeading` は Composable ですが、画面の部品は描きません。Compose の状態とライフサイクルの仕組みを使って「値を作る」関数です。名前が `remember…` で始まるのは、Compose のこうした関数の慣習です。

### センサーの値から北からの角度へ

```kotlin
override fun onSensorChanged(event: SensorEvent) {
    SensorManager.getRotationMatrixFromVector(matrix, event.values)
    val (axisX, axisY) = screenAxes(context)
    SensorManager.remapCoordinateSystem(matrix, axisX, axisY, remapped)
    SensorManager.getOrientation(remapped, angles)
    val magnetic = Math.toDegrees(angles[0].toDouble()).toFloat()
    // Magnetic north is several degrees off true north in Japan (about 7-9° west).
    val declination = currentLocation?.let {
        GeomagneticField(it.latitude.toFloat(), it.longitude.toFloat(), it.altitude.toFloat(), it.time)
            .declination
    } ?: 0f
    val degrees = normalize(magnetic + declination)
    // Small wobbles would redraw the map many times a second for nothing.
    val last = compass.value
    if (last == null || angleBetween(last, degrees) >= MIN_CHANGE_DEGREES) compass.value = degrees
}
```

1. **センサーの値から、端末の傾きを表す行列を作る**
2. **画面の向きに合わせる**（`remapCoordinateSystem`）: 端末を横に持つと、「画面の上」の方向が変わるため
3. **磁北からの角度を取り出す**（`getOrientation`）
4. **真北に直す**: 方位磁石が指す北（磁北）は、日本では真北から西に 7〜9° ずれています。地図は真北が上なので、`GeomagneticField` でその場所のずれ（偏角）を計算して足します
5. **3° 以上変わったときだけ更新する**: センサーの値は細かく揺れます。そのたびに状態を変えると、地図が 1 秒に何十回も描き直されます（[2-1](../02-compose/01-compose-basics.md) の再コンポーズ）

`rememberUpdatedState(location)` は、センサーのリスナー（一度だけ登録する）の中から、**いつも最新の** 位置を読むための仕組みです。リスナーを作ったときの位置に固定されないようにしています（[2-3](../02-compose/03-manual-di.md) の「変わる値は関数で渡す」と同じ悩みを、Compose の流儀で解いています）。

## 角度の落とし穴

角度は 0〜360° で一周します。だから、ふつうの引き算では困ります。

- 北北西（350°）を向いていて、北北東（10°）に施設がある。差は `10 - 350 = -340°` だが、本当は右に 20° しか違わない

散策ガイドは、この問題を次の式で解いています。

```kotlin
// Heading.kt: 2 つの角度の、小さい方の差（0〜180）
private fun angleBetween(a: Float, b: Float): Float = abs(((b - a) % 360 + 540) % 360 - 180)

// Heading.kt: どんな値も 0〜360 に収める
private fun normalize(degrees: Float) = ((degrees % 360) + 360) % 360
```

[FacilityAdvisor.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/companion/FacilityAdvisor.kt) の `relativeDirection` は、歩いている向きに対して施設がどちらにあるかを「前方・右手・左手・後ろ」で答えます。施設の案内（「右手 50m にトイレがあります」）に使われます。

```kotlin
fun relativeDirection(heading: Float, bearing: Float): String {
    val diff = ((bearing - heading) % 360 + 540) % 360 - 180 // -180..180, positive = right
    return when {
        diff in -45f..45f -> "前方"
        diff in 45f..135f -> "右手"
        diff in -135f..-45f -> "左手"
        else -> "後ろ"
    }
}
```

`((差 % 360) + 540) % 360 - 180` は、どんな差も **-180〜180°** に直す決まり文句です。正なら右、負なら左。350° と 10° の例では、`(-340 % 360 + 540) % 360 - 180` = `(-340 + 540) % 360 - 180` = `200 - 180` = **20°**（右に 20°）になり、「前方」と判定されます。

> Kotlin（と Java）の `%` は、負の数を割ると負の余りを返します（`-340 % 360` は `-340`）。だから一度 540 を足して正の数にしてから、もう一度 `% 360` しています。

## ハンズオン: 角度の計算を壊してみる

### 1. 方向のテストを読む

[FacilityAdvisorTest.kt](../../yorisoi-sanpoguide/app/src/test/java/io/github/duwenji/sanpoguide/companion/FacilityAdvisorTest.kt) の最後のテストです。

```kotlin
@Test
fun `direction relative to heading`() {
    assertEquals("前方", FacilityAdvisor.relativeDirection(heading = 350f, bearing = 10f))
    assertEquals("右手", FacilityAdvisor.relativeDirection(heading = 0f, bearing = 90f))
    assertEquals("左手", FacilityAdvisor.relativeDirection(heading = 90f, bearing = 0f))
    assertEquals("後ろ", FacilityAdvisor.relativeDirection(heading = 0f, bearing = -170f))
}
```

4 つのそれぞれについて、`diff` がいくつになるか、上の式で手計算してみてください。

<details>
<summary>答え</summary>

- 350° と 10°: `(-340 % 360 + 540) % 360 - 180` = `200 - 180` = 20 → 前方
- 0° と 90°: `(90 + 540) % 360 - 180` = `270 - 180` = 90 → 右手
- 90° と 0°: `(-90 + 540) % 360 - 180` = `90 - 180` = -90 → 左手
- 0° と -170°: `(-170 + 540) % 360 - 180` = `10 - 180` = -170 → 後ろ

</details>

### 2. 素朴な引き算にしてみる

[FacilityAdvisor.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/sanpoguide/companion/FacilityAdvisor.kt) の `relativeDirection` の 1 行目を、

```kotlin
val diff = bearing - heading
```

に変えて、テストを流します。

```sh
cd /c/Dev/apps/yorisoi-sanpoguide
./gradlew :app:testDebugUnitTest --tests '*FacilityAdvisorTest*'
```

```
9 tests completed, 1 failed
```

レポートを開くと `expected:<[前方]> but was:<[後ろ]>` と出ています。北北西を向いて北北東の施設を「後ろ」と案内してしまうわけです。北をまたぐ角度だけで起きる誤りなので、テストがなければ気づきにくい不具合です。

### 3. 元に戻す

```sh
git checkout -- app/src/main/java/io/github/duwenji/sanpoguide/companion/FacilityAdvisor.kt
git status
```

### 4. エミュレータで歩いてみる（任意）

Android Studio のエミュレータには、位置を動かす道具があります。

1. エミュレータの横の「…」（Extended controls）→「Location」
2. 「Single points」で地図をクリックして「Set location」を押すと、その場所に移動する（例: 鎌倉駅）
3. 「Routes」で出発地と目的地を選んで「Play route」を押すと、その経路を歩いているように位置が動く。速さも変えられる

散策ガイドで散策を始めてから経路を再生すると、距離が増え、スポットの 60m 以内に来ると案内が始まります。エミュレータには方位センサーの値を変える道具（「Virtual sensors」）もあり、地図の扇形の向きが変わるのを見られます。

> 散策中は AI が呼ばれます（AI のキーを設定していれば、その料金がかかります）。

## つまずきやすいところ

- **立ち止まると位置の更新は来ない**: `setMinUpdateDistanceMeters` を指定していれば、動かないと何も届きません。時間で判断したいことには、別にタイマーが要ります
- **GPS の値をそのまま足さない**: 精度の悪い位置を捨て、小さな動きを無視します
- **角度の差は -180〜180 に直してから比べる**: 素朴な引き算は、北（0°/360°）をまたぐと間違えます
- **センサーは使い終わったら止める**: 電池を使い続けます。`LifecycleResumeEffect` のように、登録と解除を組で書きます
- **方位磁石の北と地図の北は違う**: 日本では 7〜9° ずれます

## 確認問題

<details>
<summary>問 1. 散歩中にベンチで 5 分座っていました。GPS の位置は 15m ほど揺れています。休憩の声かけは出ますか。</summary>

出ます（休憩の声かけを話すチャンネルなら）。休憩の判定は、錨を下ろした位置から 30m 以内にいる間は続くので、15m の揺れでは途切れません。位置の更新が来なくても、30 秒ごとのタイマーが `maybeTalk` を呼ぶので、4 分を過ぎたところで声をかけます。

</details>

<details>
<summary>問 2. WalkSession が「直前に届いた位置」ではなく「最後に数えた位置」との距離を測るのはなぜですか。</summary>

GPS の小さな揺れ（数 m）が積み重なって、距離が増えていくのを防ぐためです。直前の位置との差なら、揺れのたびに数 m ずつ足されてしまいます。最後に数えた位置から 8m 以上離れたときだけ足せば、揺れは足されません。

</details>

<details>
<summary>問 3. 方位センサーの値が変わるたびに <code>compass.value</code> を書き換えないのはなぜですか。</summary>

センサーの値は細かく揺れるので、書き換えるたびに地図が再コンポーズされ、1 秒に何十回も描き直されてしまうからです。3° 以上変わったときだけ書き換えています。

</details>

---

前: [3-2 常駐サービス](02-service.md) ／ 次: [3-4 「いま何を話すか」の判定](04-maybe-talk.md)
