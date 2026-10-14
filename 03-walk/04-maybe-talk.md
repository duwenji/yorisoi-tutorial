# 3-4 「いま何を話すか」の判定

[目次](../README.md) ＞ 第 3 部 ＞ 3-4

## この章で学ぶこと

- 散策ガイドの心臓部 `maybeTalk()` と `TalkDecider` が、何をどの順番で判断しているか
- 優先順位を「上から順に、最初に当たった 1 つだけ」で表す書き方（ルールの一覧とゲート）
- 話しすぎを防ぐしくみ（話している最中・間隔・1 回だけ）
- 判断を「場面を値で書いて、決まりを当てる」純粋な部品にして、場面ごとにテストする作り
- enum の **並び順** に意味を持たせる書き方と、その危うさ

## maybeTalk はいつ呼ばれるか

[WalkService.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/walk/WalkService.kt) の `maybeTalk()` は、次の 3 つのときに呼ばれます。

| きっかけ | 場所 | 章 |
|---|---|---|
| 位置が届いたとき（10 秒・10m ごと） | `onLocation` | [3-3](03-location-sensors.md) |
| 30 秒ごとのタイマー（立ち止まっていても） | `startTicker` | [3-1](01-coroutines.md) |
| 散歩の途中でチャンネルを変えたとき | `watchStations` | [3-2](02-service.md) |

呼ばれるたびに、「今、話すべきことがあるか」を上から順に調べ、**最初に当たった 1 つだけ** を話します。何も当たらなければ、何も話しません。

調べるのは `maybeTalk` 自身ではなく、[TalkDecider.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/companion/TalkDecider.kt) の `TalkDecider` です。判断は、場面ごとにテストできるよう `maybeTalk` の外に出してあります。

## 全体の流れ

[yorisoi-sanpoguide/docs/architecture.md](../../yorisoi-sanpoguide/docs/architecture.md) の図 2 にも同じ流れが描かれています。

```mermaid
flowchart TB
    G0{"話している最中？"} -->|はい| X["何もしない"]
    G0 -->|いいえ| W{"① 天気の急変"}
    W -->|当たり| TW["警告（雷なら音つき通知も）"]
    W --> P{"② チャンネルを変えた直後のあいさつ"}
    P -->|当たり| TP["あいさつ（AI なし）"]
    P --> S{"③ 60m 以内の未案内のスポット<br/>（止まっていない・切り替え直後でない・スポットの間隔）"}
    S -->|当たり| TS["チャンネルのきっかけの素材<br/>または 解説・再訪の一言"]
    S --> CP{"③b チャンネルが<br/>きっかけを置いた地点"}
    CP -->|当たり| TCP["きっかけの素材"]
    CP --> SU{"④ 日の入りの 30〜5 分前"}
    SU -->|当たり| TSU["日の入りの一言"]
    SU --> GAP{"前の発言から<br/>雑談の間隔がたったか"}
    GAP -->|いいえ| X
    GAP --> F{"⑤ 状況に合った施設"}
    F -->|当たり| TF["施設の案内"]
    F --> JS{"切り替えの直後 1 分？"}
    JS -->|はい| X
    JS --> R{"⑥ 4 分とどまった"}
    R -->|当たり| TR["休憩の一言"]
    R --> M{"⑦ 距離・時間の区切り"}
    M -->|当たり| TM["区切りの一言 ＋ 途中の保存"]
    M --> X
```

## 上から順に、最初の 1 つだけ

`maybeTalk` は 3 つのことをします。**今の様子を集める**（`situation`）、**何を話すか決めてもらう**（`TalkDecider.decide`）、**決まったことを実行する**（`when`）。

```kotlin
private suspend fun maybeTalk() {
    val s = session ?: return
    val location = lastLocation ?: return
    // Let the current line finish before starting another.
    if (app.speaker.isSpeaking) return
    val station = app.stations.current.value
    val now = System.currentTimeMillis()

    when (val decision = TalkDecider.decide(situation(s, location, station, now))) {
        is TalkDecision.WeatherTurn -> talk { /* … 警告を話す … */ }
        is TalkDecision.Greeting -> talk { /* … あいさつ … */ }
        is TalkDecision.Spot -> talk {
            s.lastSpotTalkAt = now
            talkAboutSpot(s, decision.poi, decision.distanceM)
        }
        // … SpotCue・PointCue・Sunset・NearFacility・Rest・Milestone・Checkpoint …
        TalkDecision.Nothing -> Unit
    }
}
```

決める側の `TalkDecider` は、**ルールの一覧** です。上から順に聞いていき、最初に「話す」と答えたルールの結果を返します。

```kotlin
object TalkDecider {
    /** The walk's rules, in the order they are asked. [TalkRule.safety]: a channel can't switch it off. */
    val rules: List<Rule> = listOf(
        // A turn in the weather comes first, regardless of the talk level: it's about safety.
        Rule("weather", safety = true) { s -> /* … */ },
        // The user just switched channels: the new one says hello before anything else. No AI, so it's instant.
        Rule("greeting") { s -> s.pendingGreeting?.let { TalkDecision.Greeting(it, s.pendingSelect) } },
        Rule("spot", setOf(WalkGate.SPOT_GAP, WalkGate.MOVING, WalkGate.SETTLED)) { s -> /* … */ },
        Rule("point", setOf(WalkGate.MOVING, WalkGate.SETTLED)) { s -> s.pointCue?.let(TalkDecision::PointCue) },
        Rule("sunset", safety = true) { s -> /* … */ },
        // From here on the small-talk gap holds. Facilities still come up right after a switch.
        Rule("facility", setOf(WalkGate.CHAT_GAP), safety = true) { s -> /* … */ },
        Rule("rest", setOf(WalkGate.CHAT_GAP, WalkGate.SETTLED)) { s -> /* … */ },
        Rule("milestone", setOf(WalkGate.CHAT_GAP, WalkGate.SETTLED)) { s -> /* … */ },
    )

    private val engine = TalkEngine(rules, TalkDecision.Nothing)

    fun decide(s: TalkSituation): TalkDecision = engine.decide(s)
}
```

この書き方の良いところは、**一覧の上下の並びが、そのまま優先順位になる** ことです。「天気の急変は、スポットの案内より先」という決まりは、`weather` のルールが `spot` のルールより上に書いてある、という事実だけで表されています。優先順位を変えたければ、行の順番を入れ替えます。

[2-4](../02-compose/04-theme-mood.md) の `paletteFor` の `when`（上から順に当てはまる色を選ぶ）と同じ考え方を、もっと大きな規模で使っているわけです。

### ルールを聞く仕組み: TalkEngine とゲート

一覧を上から聞く仕組みそのものは、キット `kit-companion` の [TalkEngine.kt](../../yorisoi-platform/kit-companion/src/main/kotlin/io/github/duwenji/yorisoi/kit/companion/TalkEngine.kt) にあります。サイクリングの伴走など、ほかの付き添いアプリでも使えるように、散歩のことを何も知らない形で書いてあります。

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

**ゲート**（`gates`）は、「このルールを聞いてよいか」の条件です。散歩のゲートは 4 つです（`WalkGate`）。

| ゲート | 開いている条件 | 使うルール |
|---|---|---|
| `SPOT_GAP` | 前のスポットの案内から、頻度の設定の間隔がたった | スポット |
| `CHAT_GAP` | 前に何か話してから、雑談の間隔がたった | 施設・休憩・区切り |
| `MOVING` | 2 分以上とどまっていない | スポット・地点 |
| `SETTLED` | チャンネルを変えた直後（1 分）でない | スポット・地点・休憩・区切り |

ゲートの意味（何分を「間隔」とするか）はアプリが決め、`TalkSituation.isOpen` に書きます。エンジンは「全部のゲートが開いているルールだけ聞く」ことしか知りません。

`safety = true` は「チャンネルが止められない」ルールの印です（天気・日の入り・施設）。どのチャンネルでも、安全のための知らせは同じに出ます。

### 様子を値で集める: TalkSituation

`TalkDecider` が読むのは `TalkSituation` という **ただの値** です。今の時刻・天気・チャンネルの設定・近くのスポット（距離・この散歩で話したか・前の散歩で訪れたか・チャンネルのきっかけ）・施設・散歩の記録（距離・休憩の時間・前に話した時刻…）が入っています。`maybeTalk` の `situation(…)` が、毎回これを集めます。

```kotlin
/**
 * Everything [TalkDecider] reads, as plain values gathered by the walk service each time.
 * No Android types, so a scene can be written down in a unit test.
 */
data class TalkSituation(
    val now: Long,
    val weather: Weather?,
    val limits: Thresholds,
    val level: TalkLevel,
    // …
    val spots: List<NearbySpot>,
    // …
    val justSwitched: Boolean,
) : TalkGates<WalkGate> { /* … isOpen … */ }
```

コメントのとおり、Android の型を 1 つも含みません。だから単体テストで「雷雨が 20 分後に来て、近くにスポットもあり、前の発言から 1 分」という **場面を値で書いて**、`TalkDecider.decide` が何を返すかを確かめられます（`TalkDeciderTest`、19 件）。

## 7 つの判断

### ① 天気の急変（いつでも最優先）

```kotlin
// A turn in the weather comes first, regardless of the talk level: it's about safety.
Rule("weather", safety = true) { s ->
    val change = s.weather?.let { WeatherChangeDetector.detect(it, s.now, s.limits) }
    val warnedAt = change?.let { s.weatherWarnedAt[it.kind] }
    change?.takeIf { warnedAt == null || s.now - warnedAt >= s.limits.ms(Threshold.WEATHER_REPEAT_MIN) }
        ?.let(TalkDecision::WeatherTurn)
},
```

決まったら、`maybeTalk` がこう実行します。

```kotlin
is TalkDecision.WeatherTurn -> talk {
    val change = decision.change
    // A thunderstorm warning also covers the rain that comes with it.
    WeatherChangeKind.entries.filter { it >= change.kind }.forEach { s.weatherWarnedAt[it] = now }
    val line = app.narration.line(TalkEvent.WeatherTurn(change), s, weather)
    // Without earphones the spoken warning goes unheard; lightning is worth a sound.
    if (change.kind == WeatherChangeKind.THUNDER) {
        getSystemService(NotificationManager::class.java).notify(ALERT_NOTIFICATION_ID, alertNotification(line))
    }
    speakLine(line)
}
```

- 安全に関わるので、ゲートがありません。**話しかけの頻度の設定（控えめ・ふつう・おしゃべり）に関係なく** 話します
- 同じ種類の予告は、設定の間隔（既定 60 分）をあけます（`weatherWarnedAt`）
- 「近いうちに崩れるか」の判断は、`WeatherChangeDetector` という別の部品に任せています（下で見ます）
- 決めるのは `TalkDecider`、記録を書き換え・話し・通知するのは `maybeTalk`、と役割が分かれています

### ② チャンネルを変えた直後のあいさつ

```kotlin
// The user just switched channels: the new one says hello before anything else. No AI, so it's instant.
Rule("greeting") { s -> s.pendingGreeting?.let { TalkDecision.Greeting(it, s.pendingSelect) } },
```

チャンネルのあいさつは、チャンネルのパッケージに書かれた決まった文（AI を使わない）なので、すぐに話せます。`maybeTalk` は、あいさつのあとに、そのチャンネルが「選ばれたとき」のきっかけ（`event: select`）に決めた素材があれば、続けて出します（`decision.select`）。

### ③ 近くのスポット

```kotlin
Rule("spot", setOf(WalkGate.SPOT_GAP, WalkGate.MOVING, WalkGate.SETTLED)) { s ->
    val nearby = s.spots
        .filter { !it.alreadyThisWalk && it.distanceM <= ANNOUNCE_RADIUS_M }
        .sortedBy { it.distanceM }
    // A spot the channel put a cue on comes first, even of a kind it skips or with spot talk
    // off: the channel placed it on purpose (API-003「きっかけ」). The spacing still holds.
    nearby.firstOrNull { it.cue != null }?.let { TalkDecision.SpotCue(it.poi, it.distanceM.toInt(), it.cue!!) }
        // One spot per tick, by distance from the user (spots' distances to each other don't matter).
        ?: SpotChooser.pick(
            nearby.map { SpotCandidate(it.poi, it.distanceM, it.visitedBefore) },
            s.preferredCategories, s.skippedCategories,
            newSpots = TalkEventKind.SPOT in s.events, revisits = TalkEventKind.REVISIT in s.events,
        )?.let { TalkDecision.Spot(it.poi, it.distanceM.toInt()) }
},
```

コレクションの操作（[1-1](../01-kotlin-android/01-kotlin-syntax.md)）で、候補を絞り込んでいます。

1. この散歩でまだ話していないスポット（`alreadyThisWalk`）
2. 60m 以内のもの。近い順に並べる
3. **チャンネルがきっかけを置いたスポットがあれば、それを先に**（`cue`）。第三者のチャンネルは「このスポットに来たら、この素材を出す」と決められます（[0-1](../00-overview/01-what-we-build.md)）。チャンネルがわざわざ置いたものなので、ふだんは飛ばす種類のスポットでも出します。ただし、スポットの案内どうしの間隔は守ります
4. きっかけがなければ、どれを話すかは `SpotChooser` に任せる。過去の散歩で訪れたか（再訪か、`visitedBefore`）も渡す

ゲートの意味も大事です。

- **立ち止まっている間は、次々に案内しない**（`MOVING`）: 寺の境内で 2 分立ち止まったら、周りのスポットを片っ端から案内するのではなく、休憩の一言の出番かもしれない
- **スポットの案内どうしの間隔**（`SPOT_GAP`）: スポットが密集した通りで、講義のようにならないように

`SpotChooser.pick` は、チャンネルの好み（歴史探訪なら寺社を先に、など）と、そのスポットの「話題になりそうか」（Wikipedia の記事があるか、など）で点数をつけ、点数が同じなら近い順に 1 つ選びます。選ばれなかった候補は、間隔がたったあとの判断で、まだ近くにいれば選ばれます。

きっかけを探すのは `CueFinder`（`situation` を集めるときに呼ぶ）、見つかったきっかけの素材を用意するのは `CuePresenter`、通知やカードで見せるのは `CueShow` です（どれも `SanpoApp` が作ります。[2-3](../02-compose/03-manual-di.md)）。「同じきっかけを 1 回の散歩で何度も出さない」などの記録（`s.shownCues`）も、ここで使います。

### ③b チャンネルがきっかけを置いた地点

```kotlin
// A point the channel put a cue on, as for spots: not while standing still (API-003「きっかけ」).
Rule("point", setOf(WalkGate.MOVING, WalkGate.SETTLED)) { s -> s.pointCue?.let(TalkDecision::PointCue) },
```

スポット（地図のデータにある場所）だけでなく、チャンネルは緯度・経度と半径で「この地点に来たら」というきっかけも置けます。ゲートは ③ と同じく、立ち止まっていないこと・切り替えの直後でないことです。素材を持てるのは第三者のチャンネルだけなので、組み込みのチャンネルでは `pointCue` がいつも null で、ここは素通りします。

### ④ 日の入り（頻度に関係なく）

```kotlin
// Heads-up before dark, regardless of the talk level: it's about getting home, not chat.
Rule("sunset", safety = true) { s ->
    val sunsetAt = s.weather?.sunsetAt
    val minutesLeft = sunsetAt?.let { ((it - s.now) / 60_000).toInt() }
    // Too close to be useful below the latest minute; an empty range if the settings cross.
    minutesLeft?.takeIf { !s.sunsetWarned && it in s.limits[Threshold.SUNSET_LATEST_MIN]..s.limits[Threshold.SUNSET_NOTICE_MIN] }
        ?.let(TalkDecision::Sunset)
},
```

`in 5..30` は「5 以上 30 以下」という範囲の判定です。コメントの "an empty range if the settings cross" に注目してください。設定で「何分前から」（30）より「何分前を過ぎたら知らせない」（5）を大きくしてしまうと、`35..30` のような **空の範囲** になり、何も当たりません。設定画面がこの組み合わせを保存させないのは、このためです（[Threshold.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/settings/Threshold.kt) の `conflicts`）。

### ここから雑談の間隔を守る

①〜④（③b を含む）は「伝えるべきこと」でした。ここから下は「言ってもいいこと」なので、ルールに `CHAT_GAP` のゲートが付いています。前に何か話してから一定の時間（ふつうなら 3 分）がたつまでは、どれも聞かれません。

### ⑤ 施設、⑥ 休憩、⑦ 区切り

- **⑤ 施設**: `FacilityAdvisor.pick` に任せる（[1-1](../01-kotlin-android/01-kotlin-syntax.md) のハンズオンで読んだ部品）。ゲートは `CHAT_GAP` だけで、切り替えの直後でも案内します（安全に関わるため、`safety = true`）。方向は `maybeTalk` が [3-3](03-location-sensors.md) の `relativeDirection` で付けます
- **切り替えの直後 1 分は、⑥⑦ を聞かない**（`SETTLED`）: 新しいチャンネルのあいさつの直後に雑談が続くと、あいさつがかすむため
- **⑥ 休憩**: 4 分とどまったら（[3-3](03-location-sensors.md) の錨の仕組み）、1 回だけ
- **⑦ 区切り**: 前の区切りから一定の距離を歩いたか、一定の時間がたったら。区切りでは、記録も途中まで保存します（`saveProgress`）。区切りで話さないチャンネルでも、`TalkDecision.Checkpoint` を返して保存だけはします。コメント: "Still a checkpoint for the history on a quiet channel, so the walk isn't lost if the service dies"（Service が止められても、静かな散歩の記録が失われないように）

## 話しすぎを防ぐしくみ

`maybeTalk` は数秒〜30 秒ごとに呼ばれます。話しすぎないように、何重もの仕組みがあります。

| 仕組み | 場所 | 防ぐもの |
|---|---|---|
| 話している最中は判断しない | `maybeTalk` の `if (app.speaker.isSpeaking) return` | 話の途中に次の話が割り込む |
| 1 度に 1 つだけ | `talk { … }` の `tryLock`（[3-1](01-coroutines.md)） | AI が文を作っている間に、別の話が始まる |
| 最初に当たった 1 つだけ | `TalkEngine.decide` が最初の答えを返す | 1 回の判断で何個も話す |
| 同じものは 1 回だけ | `alreadyThisWalk`・`mentionedFacilities`・`sunsetWarned`・`restRemarked` | 同じスポットや施設を何度も |
| 種類ごとの間隔 | `weatherWarnedAt`・`SPOT_GAP`・`facilityMentionAt` | 同じ種類の話が続く |
| 全体の間隔 | `CHAT_GAP`（`lastSpokeAt` と `level.minGapMs`） | 雑談が続く |

### 話しかけの頻度: TalkLevel

間隔の長さは、チャンネルの「話しかけの頻度」で決まります（[TalkLevel.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/settings/TalkLevel.kt)）。

```kotlin
enum class TalkLevel(
    val label: String,
    val spotGapMs: Long,          // スポットの案内どうしの間隔
    val minGapMs: Long,           // 雑談の間隔
    val milestoneDistanceM: Double,
    val milestoneIntervalMs: Long,
    val remarkOnRest: Boolean,    // 休憩の一言をするか
) {
    QUIET("控えめ", 5 * MINUTE, 6 * MINUTE, 2000.0, 30 * MINUTE, remarkOnRest = false),
    NORMAL("ふつう", 2 * MINUTE, 3 * MINUTE, 1000.0, 15 * MINUTE, remarkOnRest = true),
    CHATTY("おしゃべり", 1 * MINUTE, 2 * MINUTE, 500.0, 8 * MINUTE, remarkOnRest = true),
}
```

1-1 で見た「値ごとに項目を持てる enum」の例です。`TalkSituation.isOpen` は `level.spotGapMs` のように読むだけで、「控えめ」かどうかを `if` で分けていません。頻度の段階を足したいときは、ここに 1 行足すだけです。

### 何について話すか: チャンネル

`TalkEventKind.REST in s.events` のように、チャンネルごとに「どの場面で話すか」も決まっています。「しずかに」チャンネルなら、スポットや休憩の一言を話さない、といった具合です。第三者のチャンネル（第 6 部）も、パッケージの中でこれを決められます。

## 判断を小さな部品に分ける

`maybeTalk` 自身は、いわば **交通整理** です。判断は、Android に依存しない部品に任せています（[2-3](../02-compose/03-manual-di.md)）。

| 部品 | 判断すること | テスト |
|---|---|---|
| `TalkDecider.decide` | 今の場面で、何を話すか（ルールの順番とゲート） | `TalkDeciderTest`（19 件、場面ごと） |
| `TalkEngine`（`kit-companion`） | ルールを上から聞き、最初の答えを返す仕組み | `TalkEngineTest`（5 件） |
| `WeatherChangeDetector.detect` | 近いうちに天気が崩れるか、何分後か | `WeatherChangeDetectorTest`（8 件） |
| `SpotChooser.pick` | 候補のうち、どのスポットを話すか | `SpotChooserTest`（4 件） |
| `FacilityAdvisor.pick` | どの施設を、どの理由で案内するか | `FacilityAdvisorTest`（9 件） |
| `WalkSession` | 距離、休憩の時間、チャンネルの切り替え | `WalkSessionStationTest`（6 件） |

`maybeTalk` は Service の中にあり、位置・天気・AI・音声・通知に囲まれているので、テストが難しい場所です。だから判断のほうを外に出し、`maybeTalk` には「様子を集めて、決めてもらい、実行する」ことだけを残しています。判断の順番が `TalkDecider` にあるので、「雷雨と日の入りが重なったら雷雨が先」のような **順番の決まり** まで、テストで守れます。

### WeatherChangeDetector を読む

[WeatherChange.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/companion/WeatherChange.kt):

```kotlin
/** A turn for the worse, most serious first. Each kind also covers the ones after it. */
enum class WeatherChangeKind {
    THUNDER,
    HEAVY_RAIN,
    /** Rain, drizzle or snow starting. */
    RAIN;
    // …
}

object WeatherChangeDetector {
    fun detect(weather: Weather, now: Long, limits: Thresholds = Thresholds()): WeatherChange? {
        val lookaheadMs = limits.ms(Threshold.WEATHER_LOOKAHEAD_MIN)
        // …
        // Slots not over yet whose weather starts within the lookahead.
        val coming = weather.forecast.filter { it.at > now && it.at - SLOT_MS <= now + lookaheadMs }
        for (kind in WeatherChangeKind.entries) {
            if (isHappening(kind, weather, heavyMm)) continue
            val slot = coming.firstOrNull { kind.matches(it.code, it.precipitationMm, heavyMm) } ?: continue
            // …
            return WeatherChange(kind, minutes, WeatherCodes.describe(slot.code))
        }
        return null
    }
}
```

- 予報（15 分ごと）のうち、まだ終わっていなくて、設定の時間（既定 60 分）以内に始まるものを集める
- **深刻な順に**（雷雨 → 強い雨 → 雨）調べる。もうその天気になっているなら飛ばす（すでに降っているのに「降りそうです」とは言わない）
- 最初に見つかった種類を返す

ここでも「上から順に、最初の 1 つ」です。そして、その「上から」は **enum の並び順** で決まっています。`WeatherChangeKind.entries` は、enum を書いた順（雷雨・強い雨・雨）に並んだ一覧だからです。

### enum の並び順に意味を持たせる

並び順は、`maybeTalk` が警告を実行するところでも使われています。

```kotlin
// A thunderstorm warning also covers the rain that comes with it.
WeatherChangeKind.entries.filter { it >= change.kind }.forEach { s.weatherWarnedAt[it] = now }
```

enum の値は、書いた順に大小を比べられます（`THUNDER < HEAVY_RAIN < RAIN`）。雷雨を予告したら、`>= THUNDER`（雷雨・強い雨・雨の全部）に「予告済み」の印を付けます。雷雨の予告は雨の予告も兼ねる、という決まりを、この 1 行で表しています。

便利ですが、**並びを入れ替えると意味が変わってしまう** という危うさもあります。enum の上のコメント "most serious first. Each kind also covers the ones after it." は、その約束を書き残したものです。ハンズオンで、並びを入れ替えるとどうなるか見てみましょう。

## ハンズオン: 優先順位を壊す

### 1. 天気の判定のテストを流す

```sh
cd /c/Dev/apps/yorisoi-sanpoguide
./gradlew :app:testDebugUnitTest --tests '*WeatherChangeDetectorTest*' --tests '*TalkDeciderTest*'
```

27 件（天気の判定 8 件と、話す判断の場面 19 件）のテストが通ります。テストの名前を [WeatherChangeDetectorTest.kt](../../yorisoi-sanpoguide/app/src/test/java/io/github/duwenji/yorisoi/sanpoguide/companion/WeatherChangeDetectorTest.kt) で見てみてください。

- steady weather is no news（天気が変わらなければ、知らせない）
- rain starting within the hour（1 時間以内に雨が降り出す）
- thunder beats rain, and is news even when it is already raining（雷雨は雨より優先。すでに雨が降っていても知らせる）
- …

### 2. enum の並びを入れ替える

[WeatherChange.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/companion/WeatherChange.kt) の `WeatherChangeKind` を、深刻でない順に並べ替えます。

```kotlin
enum class WeatherChangeKind {
    /** Rain, drizzle or snow starting. */
    RAIN,
    HEAVY_RAIN,
    THUNDER;
    // …（下の matches はそのまま）
}
```

もう一度テストを流します。

```
27 tests completed, 3 failed
```

落ちるのは次の 3 件です。

| テスト | 出るエラー |
|---|---|
| `WeatherChangeDetectorTest` の thunder beats rain, and is news even when it is already raining | `expected:<THUNDER> but was:<RAIN>` |
| `TalkDeciderTest` の a coming thunderstorm comes first, whatever else is due | `expected:<THUNDER> but was:<RAIN>` |
| `TalkDeciderTest` の the same warning waits out its repeat gap | 何も話さないはずが、雨の警告を返す |

雨と雷雨の両方が予報されているとき、雨を先に見つけて返してしまうからです。「雷が来ます、建物に入ってください」と言うべきところで「雨が降りそうです」と言ってしまう、安全に関わる不具合です。判断を `TalkDecider` に移して場面のテストを書いたので、1 つの部品のテストだけでなく、「散歩の場面として何を話すか」のテストでも気づけるようになっています。

ただし、`maybeTalk` が警告を実行するときの `it >= change.kind` の意味も逆になります（雨の予告が、雷雨の予告を兼ねてしまう）。こちらは `maybeTalk` の中なので、テストでは見つかりません。enum の並びに意味を持たせるなら、その約束をコメントに書き、テストで守る必要があります。

### 3. 元に戻す

```sh
git checkout -- app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/companion/WeatherChange.kt
git status
```

### 4. 考えてみる

`TalkDecider.rules` で、④日の入りのルールを①天気の急変より上に移したら、どんな場面で困るでしょうか。

<details>
<summary>考え方の例</summary>

日の入りの 30 分前と、雷雨が 20 分後に来る予報が重なったとき、先に日の入りの一言を話し、雷雨の警告がそのあとになります。日の入りの一言を話している間（と、次の判断まで）、雷雨の警告が遅れます。安全に関わる知らせほど上に置く、というのが今の並びの考え方です。

</details>

## つまずきやすいところ

- **優先順位は一覧の並びで表す**: 条件をばらばらの場所に書くと、どれが先に判断されるのか分からなくなります
- **「伝えるべきこと」と「言ってもいいこと」を分ける**: 安全に関わる知らせは、頻度の設定や間隔に関係なく話します
- **enum の並び順に頼るなら、約束をコメントとテストに残す**: 並べ替えただけで意味が変わります
- **判断のロジックを Service に書き込まない**: 様子をただの値に集め、判断は純粋な部品（`TalkDecider`）に出します。場面ごとにテストできます

## 確認問題

<details>
<summary>問 1. 「控えめ」のチャンネルで、雷雨が近づきました。前の発言から 1 分しかたっていません。警告は話されますか。</summary>

話されます。天気の急変は `TalkDecider.rules` のいちばん上にあり、ゲートがない（頻度の設定 `level.minGapMs` による `CHAT_GAP` に関係しない）からです。ただし、ほかの話をしている最中なら、話し終わってからの判断になります。

</details>

<details>
<summary>問 2. 雷雨を予告した 20 分後、雨が降り出しそうな予報になりました。雨の予告は話されますか。</summary>

話されません（既定の設定なら）。雷雨を予告したときに、`WeatherChangeKind.entries.filter { it >= change.kind }` で雷雨・強い雨・雨の全部に「予告済み」の印を付けているので、雨も同じ種類の間隔（既定 60 分）の中にあるとみなされます。

</details>

<details>
<summary>問 3. 寺の境内で立ち止まっています。周りに 60m 以内のスポットがまだ 3 つあります。次々に案内されますか。</summary>

されません。2 分以上とどまっていると `MOVING` のゲートが閉じ、スポットのルールが聞かれないからです。代わりに、4 分たてば休憩の一言の出番になります（休憩の一言を話すチャンネルなら）。歩き出せば、間隔をあけて残りのスポットも案内されます。

</details>

---

前: [3-3 位置情報とセンサー](03-location-sensors.md) ／ 次: [4-1 HTTP と JSON](../04-outside/01-http-json.md)
