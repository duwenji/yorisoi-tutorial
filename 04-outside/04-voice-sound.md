# 4-4 声と音

[目次](../README.md) ＞ 第 4 部 ＞ 4-4

## この章で学ぶこと

- 端末の読み上げ機能（TTS）で、文章を声にする方法
- ほかのアプリの音楽と、散策ガイドの声を上手に重ねる「オーディオフォーカス」
- 背景音を、音源ファイルなしで **その場で合成する** 方法（AudioTrack とデジタルの音作り）
- 音を流すための専用のスレッドと、スレッドの間で値を受け渡す注意点
- 「イヤホンのときだけ」「ほかの音楽が流れていたら止める」といった気配り

## 読み上げ: Speaker

散策ガイドの声は、Android に入っている **TTS**（Text To Speech、文章の読み上げ）です。[Speaker.kt](../../SanpoGuide/platform/kit-voice/src/main/java/io/github/duwenji/michizure/kit/voice/Speaker.kt) が受け持っています。

```kotlin
/**
 * Japanese text-to-speech. Utterances queue up rather than cutting each other off.
 *
 * While it talks it holds transient, "may duck" audio focus, so music the user is listening to
 * gets quieter instead of playing over the voice, and comes back when the queue is done.
 */
class Speaker(context: Context) : TextToSpeech.OnInitListener {
    private val tts = TextToSpeech(context.applicationContext, this)
    private var ready = false
    private val pending = mutableListOf<String>()

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) return
        tts.language = Locale.JAPAN
        tts.setAudioAttributes(attributes)
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() { /* … 読み終わりを知る … */ })
        ready = true
        pending.forEach { enqueue(it) }
        pending.clear()
    }

    fun speak(text: String) {
        if (ready) enqueue(text) else pending += text
    }
    // …
}
```

### 準備ができるまで待つ

`TextToSpeech` は、作ってすぐには使えません。読み上げのエンジンの準備ができると `onInit` が呼ばれます。散策ガイドは、準備の前に頼まれた文を `pending` にためておき、準備ができたらまとめて読み上げます。アプリの起動直後に「いってらっしゃい」と言おうとして、何も聞こえない、ということが起きません。

### 順番に読み上げる

```kotlin
private fun enqueue(text: String) {
    val id = nextId.incrementAndGet().toString()
    if (inFlight.isEmpty()) {
        audio.requestAudioFocus(focus)
        _speaking.value = true
    }
    inFlight += id
    if (tts.speak(text, TextToSpeech.QUEUE_ADD, null, id) != TextToSpeech.SUCCESS) finished(id)
}
```

- `QUEUE_ADD`: 前の文が終わってから読む（`QUEUE_FLUSH` なら前の文を止めて読む）。スポットの名前と解説が途中で切れないように
- 文ごとに ID を付け、読み終わりの知らせ（`onDone`）で ID を消す。全部読み終わったら（`inFlight` が空になったら）後片付け

`speaking` は StateFlow で、「読み上げている最中か」を外に知らせます。背景音がこれを見て音量を下げます（下で説明）。

### オーディオフォーカス: ほかのアプリと音を分け合う

散策者は、散歩しながら音楽やポッドキャストを聞いているかもしれません。そこに散策ガイドの声が重なると、どちらも聞き取れません。

Android には **オーディオフォーカス** という、アプリどうしで「今、だれが音を出すか」を譲り合う仕組みがあります。

```kotlin
private val attributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()
private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
    .setAudioAttributes(attributes)
    .build()
```

| 指定 | 意味 |
|---|---|
| `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` | 少しの間だけ（TRANSIENT）フォーカスがほしい。ほかのアプリは止めずに、音を小さくしてくれればよい（DUCK） |
| `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE` | 道案内の声である、と OS に伝える |
| `CONTENT_TYPE_SPEECH` | 中身は話し声 |

読み上げが始まるとフォーカスを求め（音楽が小さくなる）、全部読み終わったら手放します（音楽が元に戻る）。カーナビの案内と同じ振る舞いです。

## 背景音: その場で合成する

散策ガイドは、散策中に雰囲気に合わせた背景音（雨音・波・風・鳥の声・虫の音・遠くの鐘）を流せます（既定はオフ）。そして、**音源のファイルを 1 つも持っていません**。[README](../../SanpoGuide/README.md) はその理由をこう書いています。

> 音源ファイルは同梱せず、端末でその場で合成する（`sound/Voices.kt`）。ライセンスの問題がなく、つなぎ目のないループになり、APK も大きくならない。

[2-4](../02-compose/04-theme-mood.md) の、カードの絵を `Canvas` で描くのと同じ方針です。

### どの音を流すか: Soundscape

[Soundscape.kt](../../SanpoGuide/platform/kit-voice/src/main/java/io/github/duwenji/michizure/kit/voice/Soundscape.kt):

```kotlin
/**
 * The sound for [mood]: the weather first (rain sounds while it rains), then the place,
 * then the time and season. Thunder plays as plain rain: a made-up rumble could hide or
 * be mistaken for the real thing.
 */
fun forMood(mood: Mood): Soundscape {
    val night = mood.time.isDark
    val insectSeason = mood.season == Season.SUMMER || mood.season == Season.AUTUMN
    return when {
        mood.sky == Sky.RAIN || mood.sky == Sky.THUNDER -> RAIN
        mood.sky == Sky.SNOW -> WIND
        mood.place == Place.WATERSIDE -> WAVES
        night -> if (insectSeason) INSECTS else WIND
        mood.place == Place.SHRINE_TEMPLE -> TEMPLE
        mood.season == Season.WINTER -> WIND
        mood.place == Place.TOWN -> WIND
        else -> BIRDS
    }
}
```

またしても「上から順に、最初の 1 つ」の `when` です（[2-4](../02-compose/04-theme-mood.md)・[3-4](../03-walk/04-maybe-talk.md)）。コメントの最後の一文に注目してください。**雷雨のときも、雷の音は鳴らさず雨音だけ** にしています。作り物の雷鳴が本物の雷を聞こえにくくしたり、本物と取り違えられたりすると危ないからです。安全への配慮は、こんなところにもあります。

### 音の作り方: Voices

デジタルの音は、**サンプル**（ある瞬間の空気の圧力を表す数）の並びです。散策ガイドは 1 秒に 22,050 個のサンプルを作り、スピーカーに送ります。

[Voices.kt](../../SanpoGuide/platform/kit-voice/src/main/java/io/github/duwenji/michizure/kit/voice/Voices.kt) は、1 回呼ぶたびにサンプルを 1 つ返す `Voice` を作ります。

```kotlin
/** An endless mono sound, one sample at a time in -1..1. Pure Kotlin, so it can be tested off the device. */
fun interface Voice {
    fun next(): Float
}
```

自然の音の多くは、**雑音（ノイズ）を形づくる** ことで作れます。雨音を見てみましょう。

```kotlin
/** A steady hiss of rain plus the odd close drop. */
private fun rain(sr: Float, rng: Rng): Voice {
    val high = OnePole(sr, 3200f)
    val low = OnePole(sr, 500f)
    // …
    return Voice {
        val band = high.lp(rng.next())             // 乱数（ホワイトノイズ）の高い音を削る
        val bed = (band - low.lp(band)) * 0.35f    // さらに低い音を削る → 500〜3200Hz の「サー」
        if (rng.unit() < dropsPerSample) drop = 0.15f + rng.unit() * 0.35f   // ときどき近くの雨粒
        drop *= dropDecay                           // 雨粒の音はすぐ消える
        // …
    }
}
```

- **ホワイトノイズ**: 乱数をそのまま並べると「ザー」というノイズになる
- **フィルター**（`OnePole` のローパス）: 高い音を削る。高い音を削ったノイズから、さらに低い音を削ると、真ん中の高さだけが残り、雨の「サー」に近くなる
- **ときどき大きな音**: 1 秒に 14 回ほど、近くに落ちた雨粒の「ポツ」を混ぜる

波の音は、低いノイズの大きさと明るさを 7〜11 秒ごとに膨らませて引く、風の音は、低いノイズの強さをゆっくり変える、という具合に作っています。鐘や鳥の声には、ノイズではなく音の高さを持つ波（発振器）を使っています。

`Voice` は Android に依存しない **純粋な Kotlin** で書かれています（コメント: "Pure Kotlin, so it can be tested off the device."）。だから、パソコンの単体テストで音を作って確かめられます。ハンズオンでは、作った音を WAV ファイルに書き出して、パソコンで聞いてみます。

### 同じ種なら同じ音

```kotlin
/**
 * The [Soundscape]s, built from filtered noise and a few oscillators. Each voice is seeded, so a
 * test hears the same thing every time; on the phone the seed changes per walk.
 */
object Voices {
    fun create(scape: Soundscape, sampleRate: Int, seed: Long = System.nanoTime()): Voice
```

乱数は自前の小さな乱数（`Rng`）で、**種（seed）** を決めると、いつも同じ並びになります。テストでは種を固定して毎回同じ音を確かめ、端末では散歩ごとに種を変えて、毎回少し違う音にしています。[6-6](../06-trust/06-same-rules.md) のテストベクタで「固定の種から鍵を作る」のと同じ考え方です。

### 音を流す: AmbientPlayer

作ったサンプルを流すのが [AmbientPlayer.kt](../../SanpoGuide/platform/kit-voice/src/main/java/io/github/duwenji/michizure/kit/voice/AmbientPlayer.kt) です。

```kotlin
val track = AudioTrack.Builder()
    .setAudioAttributes(
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            // Marks our own sound, so it isn't taken for another app's music (see otherMediaPlaying).
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
    )
    .setAudioFormat(
        AudioFormat.Builder()
            .setSampleRate(SAMPLE_RATE)                  // 22,050 Hz
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .build(),
    )
    .setBufferSizeInBytes(bufferBytes)
    .setTransferMode(AudioTrack.MODE_STREAM)
    .build()
```

**AudioTrack** は、サンプルの数の並び（PCM）を直接スピーカーに流す、いちばん低い層の部品です。`MODE_STREAM` は「少しずつ書き込んで流し続ける」使い方です。

```kotlin
val pcm = ShortArray(SAMPLE_RATE / 20) // 50 ms
// …
while (running) {
    // … 2 秒ごとにイヤホンとほかの音楽を確かめる …
    val goal = if (target == playing) volume * (if (speaking.value) DUCK else 1f) else 0f
    for (i in pcm.indices) {
        level += (goal - level) * smooth
        pcm[i] = (v.next() * level * Short.MAX_VALUE).toInt().coerceIn(-32767, 32767).toShort()
    }
    // Blocks until there's room, which paces the loop.
    track.write(pcm, 0, pcm.size)
}
```

1. 50 ミリ秒ぶん（1,102 個）のサンプルを作る
2. -1〜1 の値を、16 ビットの整数（-32767〜32767）に直す
3. `track.write` で書き込む。AudioTrack の中がいっぱいなら、空くまで **待つ**。この待ちが、ループの速さをちょうど再生の速さにそろえてくれる（コメント: "which paces the loop"）

### 音量をなめらかに

```kotlin
level += (goal - level) * smooth
```

音量を目標（`goal`）に向けて、サンプルごとに少しずつ近づけています。こうすると、音を変えるときも、音量を変えるときも、プツッという雑音が出ずに、0.4 秒ほどでなめらかに変わります（コメント: "about half a second to settle"）。[2-4](../02-compose/04-theme-mood.md) の、色を 2 秒かけて変えるのと同じ考え方を、音の世界でやっています。

音を切り替えるときは、まず今の音を小さくしきってから（`level < SILENT`）、次の音に替えます。

### 読み上げの間は小さく

```kotlin
val goal = if (target == playing) volume * (if (speaking.value) DUCK else 1f) else 0f
```

読み上げている間（`speaking` が true）は、背景音を 2 割（`DUCK = 0.2f`）の大きさにします。

なぜオーディオフォーカスに任せないのでしょうか。クラスのコメントが答えています: "audio focus can't do this, since the voice and this sound come from the same app."（声も背景音も同じアプリから出ているので、オーディオフォーカスでは下がらない）。オーディオフォーカスは **アプリどうし** の譲り合いの仕組みだからです。そこで、`Speaker` の `speaking`（StateFlow）を見て、自分で下げています。

### 音量のつまみと人の耳

```kotlin
// Loudness is heard roughly logarithmically; squaring spreads the slider more evenly.
val v = volumePercent.coerceIn(0, 100) / 100f
volume = v * v * MAX_GAIN
```

人の耳は、音の大きさを **比** で感じます（2 倍の大きさは、少し大きくなったくらいに聞こえる）。設定のつまみの値をそのまま音量にすると、つまみの下の方で急に大きくなり、上の方ではほとんど変わらない、と感じます。値を 2 乗すると、つまみの動きと聞こえ方がそろいます。

### 気配り: イヤホンとほかの音楽

```kotlin
private fun earphonesConnected(): Boolean =
    audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in EARPHONES }

/** Another app playing music or video (our own sound is marked as sonification, the voice as guidance). */
private fun otherMediaPlaying(): Boolean = audio.activePlaybackConfigurations.any {
    val a = it.audioAttributes
    (a.usage == AudioAttributes.USAGE_MEDIA || a.usage == AudioAttributes.USAGE_GAME) &&
        a.contentType != AudioAttributes.CONTENT_TYPE_SONIFICATION
}
```

- **イヤホンのときだけ**（既定）: 散歩中にスピーカーから鳥の声が流れたら、周りの人が驚きます。有線・Bluetooth・USB・補聴器などのイヤホンがつながっているときだけ流します
- **ほかのアプリが音楽を流していたら止める**: 自分の背景音は `CONTENT_TYPE_SONIFICATION`、声は道案内として印を付けてあるので、それ以外の「音楽・動画・ゲーム」の再生があれば、ほかのアプリのものだと分かります
- 2 秒ごとに確かめ、さらに **イヤホンを抜き差ししたら** すぐ確かめ直す（`AudioDeviceCallback`）。抜いたときは、フェードせずにすぐ止めます（コメント: "Earphones pulled out: cut at once rather than fade out of the speaker."）。フェードの 0.4 秒の間、スピーカーから音が漏れないように

## 音のための専用のスレッド

`AmbientPlayer` は、第 3 部で学んだコルーチンではなく、**普通のスレッド** で動いています。

```kotlin
private val worker = thread(name = "ambient", isDaemon = true) {
    try {
        loop()
    } catch (e: Exception) {
        Log.w(TAG, "Background sound stopped", e)
    }
}
```

音は途切れると耳障りなので、決まった速さで休まずサンプルを作り続ける必要があります。`track.write` はスレッドを止めて待つ処理で、その待ちが再生の速さを決めています。こうした **ずっと回り続け、止まって待つことでリズムを取る** 仕事は、専用のスレッドに向いています。コルーチンでも書けますが、共有のスレッド（`Dispatchers.IO` など）を 1 本ずっと占有することになります。

### スレッドの間で値を受け渡す: @Volatile

```kotlin
@Volatile private var wanted: Soundscape? = null
@Volatile private var volume = 0f
@Volatile private var earphonesOnly = true
@Volatile private var running = true
```

これらの値は、**メインスレッド**（`set` を呼ぶ `WalkService`）が書き、**音のスレッド**（`loop`）が読みます。何もしないと、片方のスレッドが書いた値が、もう片方からいつまでも見えないことがあります（CPU がそれぞれ値を手元に覚えているため）。`@Volatile` を付けると、書いた値がすぐにほかのスレッドから見えるようになります。

`release()` は `running = false` にして、ループが終わるのを最大 1 秒待ちます（`worker.join(1_000)`）。散策を終えると `WalkService.onDestroy` から呼ばれます（[3-2](../03-walk/02-service.md)）。

## ハンズオン: 背景音を WAV ファイルにして聞く

散策ガイドの背景音を、端末と同じコード（`Voices`）でパソコンの上で合成し、WAV ファイルに書き出して聞いてみます。

### 1. 書き出し用のテストを置いて流す

[scripts/SoundscapeWavExport.kt](scripts/SoundscapeWavExport.kt) をコピーして流します。

```sh
cd /c/Dev/apps/SanpoGuide
cp ../sanpo-tutorial/04-outside/scripts/SoundscapeWavExport.kt platform/kit-voice/src/test/java/io/github/duwenji/michizure/kit/voice/
./gradlew :platform:kit-voice:testDebugUnitTest --tests '*SoundscapeWavExport*'
ls -la platform/kit-voice/build/soundscapes/
```

```
birds.wav  insects.wav  rain.wav  temple.wav  waves.wav  wind.wav
```

6 種類の背景音が、15 秒ずつの WAV ファイルになります。

中身は短いです。

```kotlin
for (scape in Soundscape.entries) {
    val voice = Voices.create(scape, sampleRate, seed = 1L)
    val samples = ShortArray(sampleRate * seconds) {
        (voice.next() * gain * Short.MAX_VALUE).toInt().coerceIn(-32767, 32767).toShort()
    }
    writeWav(File(out, "${scape.name.lowercase()}.wav"), samples)
}
```

`AmbientPlayer` が AudioTrack に書き込むのと同じ形で 16 ビットの整数に直し、スピーカーではなくファイルに書いています。

### 2. 聞く

エクスプローラーで `C:\Dev\apps\SanpoGuide\app\build\soundscapes` を開き、ファイルをダブルクリックすると、Windows のメディアプレーヤーで再生できます（VS Code では再生できないことがあります）。

- `rain.wav`: 「サー」という雨音に、ときどき近くの雨粒
- `waves.wav`: 7〜11 秒ごとに寄せては返す波
- `temple.wav`: 風の音に、数秒後から遠くの鐘
- `birds.wav`・`insects.wav`: 弱い風に、鳥の声・虫の音

どれも、乱数とフィルターと少しの計算だけで作られています。

### 3. 雨粒を増やしてみる

[Voices.kt](../../SanpoGuide/platform/kit-voice/src/main/java/io/github/duwenji/michizure/kit/voice/Voices.kt) の `rain` の

```kotlin
val dropsPerSample = 14f / sr
```

を `140f / sr`（1 秒に 140 粒）に変えて、もう一度手順 1 を実行し、`rain.wav` を聞き比べてください。雨脚が強くなったように聞こえるはずです。

音のテストも流してみましょう。音の大きさの範囲を確かめるテストは、[VoicesTest.kt](../../SanpoGuide/platform/kit-voice/src/test/java/io/github/duwenji/michizure/kit/voice/VoicesTest.kt) にあります（音の部品は、RFC-002 でキット `kit-voice` に移りました）。

```sh
./gradlew :platform:kit-voice:testDebugUnitTest --tests '*VoicesTest*'
```

雨粒を 10 倍にしても、テストは通ります。粒は短く消えるので、全体の大きさは範囲に収まっているからです。

次に、雨粒を元の `14f` に戻し、代わりに「サー」の音の大きさ

```kotlin
val bed = (band - low.lp(band)) * 0.35f
```

を `* 6f` に変えて、もう一度テストを流してください。

```
2 tests completed, 1 failed
```

レポートには `RAIN clips or is NaN` と出ます。音が大きすぎて、上限（±1）に張りついてしまう（クリップする）のを、`every sound stays in range, is audible and isn't stuck to one side` が見つけました。音を変えたときに、聞こえ方だけでなく「大きすぎないか、無音でないか、片寄っていないか」をテストが守っています。

### 4. 片付け

```sh
git checkout -- platform/kit-voice/src/main/java/io/github/duwenji/michizure/kit/voice/Voices.kt
rm platform/kit-voice/src/test/java/io/github/duwenji/michizure/kit/voice/SoundscapeWavExport.kt
git status
```

## つまずきやすいところ

- **TTS は準備ができてから**: `onInit` の前に `speak` しても読まれない。準備の前の文はためておく
- **ほかのアプリと音を分け合う**: 声はオーディオフォーカスで。ただし自分のアプリの中の音どうしは、自分で調整する
- **音量は急に変えない**: プツッという雑音になる。少しずつ近づける
- **スレッドの間で受け渡す値には `@Volatile`**（またはほかの同期の仕組み）
- **周りへの気配り**: イヤホンのときだけ鳴らす、ほかの音楽を邪魔しない、危ない音（作り物の雷鳴）を鳴らさない

## 確認問題

<details>
<summary>問 1. 散策ガイドが話している間、散策者が聞いている音楽はどうなりますか。背景音はどうなりますか。</summary>

音楽は、`Speaker` がオーディオフォーカス（`AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`）を求めるので、小さくなり、読み終わると元に戻ります。背景音は、オーディオフォーカスでは下がらない（同じアプリの音なので）ので、`AmbientPlayer` が `Speaker.speaking` を見て、自分で 2 割の大きさに下げます。ただし、ほかのアプリが音楽を流している間は、背景音はそもそも流れていません。

</details>

<details>
<summary>問 2. 雷雨のとき、背景音に雷の音を鳴らさないのはなぜですか。</summary>

作り物の雷鳴が、本物の雷の音を聞こえにくくしたり、本物と取り違えられたりすると危ないからです。雷雨のときは雨音だけを流します。

</details>

<details>
<summary>問 3. 背景音の合成（<code>Voices</code>）が Android に依存しない純粋な Kotlin で書かれていると、どんな良いことがありますか。</summary>

パソコンの単体テストで、音を作って確かめられることです。散策ガイドは `VoicesTest` で、音が大きすぎないか、無音でないか、片寄っていないか、同じ種なら同じ音になるかをテストしています。このハンズオンのように、WAV ファイルに書き出して聞くこともできます。

</details>

---

前: [4-3 AI を組み込む](03-ai.md) ／ 次: [4-5 端末にデータを置く](05-storage.md)
