# 4-5 端末にデータを置く

[目次](../README.md) ＞ 第 4 部 ＞ 4-5

> Android Keystore の仕組みと最小の使い方は [技術カード: Android Keystore](../ref/android-keystore.md) にあります。

## この章で学ぶこと

- 散策ガイドが端末に保存しているものと、置き場所の選び方
- SharedPreferences（小さな設定）と、JSON のファイル（散歩の記録）
- 書き込みの途中で落ちてもファイルを壊さない工夫
- アプリの版が上がっても、古いデータを読めるようにする工夫
- API キーを、端末の外に出ない鍵（Android Keystore）で暗号化する方法

## 何をどこに置くか

| 保存するもの | 置き場所 | 形 | 部品 |
|---|---|---|---|
| 設定（AI のサービス、チャンネル、雰囲気、しきい値…） | SharedPreferences `guide_settings` | 「キー=値」 | [SettingsRepository.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/settings/SettingsRepository.kt) |
| API キー（AI、Google Maps） | 同じ SharedPreferences | **暗号化した文字列** | [KeyCipher.kt](../../yorisoi-platform/kit-llm/src/main/java/io/github/duwenji/yorisoi/kit/llm/KeyCipher.kt) |
| 散歩の記録（最大 500 回） | `files/walk_history.json` | JSON のファイル | [HistoryStore.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/history/HistoryStore.kt) |
| 第三者のチャンネルの状態 | `files/channels/state.json` | JSON のファイル | [ChannelStore.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/station/remote/ChannelStore.kt) |
| 第三者のチャンネルのパッケージ | `files/channels/pkg/{SHA-256}.zip` | ZIP のファイル | 同上 |

どれも **アプリ専用の領域**（ほかのアプリからは読めない）に置いています。さらにマニフェストで `android:allowBackup="false"` とし、端末のバックアップにも含めません（[1-3](../01-kotlin-android/03-android-components.md)）。README のとおり、散歩の記録は「端末内に保存」し、外には出しません。

データベース（SQLite・Room）は使っていません。散歩の記録は最大 500 回で、全部読んでもメモリに収まり、検索も単純なので、JSON のファイル 1 つで足りるからです。

## 小さな設定: SharedPreferences

**SharedPreferences** は、「キー=値」の小さなデータを保存する Android の仕組みです。中身は XML のファイルで、アプリの起動時に読み込まれます。

[SettingsRepository.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/settings/SettingsRepository.kt):

```kotlin
class SettingsRepository(context: Context) {
    private val prefs = context.getSharedPreferences("guide_settings", Context.MODE_PRIVATE)

    private val _settings = MutableStateFlow(load())
    val settings: StateFlow<GuideSettings> = _settings.asStateFlow()

    fun save(settings: GuideSettings) {
        prefs.edit {
            putString(KEY_PROVIDER, settings.provider.name)
            putString(KEY_STATION, settings.stationId)
            putBoolean(KEY_MOOD, settings.moodEnabled)
            putInt(KEY_AMBIENT_VOLUME, settings.ambientVolume.coerceIn(0, 100))
            // …
        }
        _settings.value = load()
    }
}
```

- `prefs.edit { … }` の中で `put…` し、ブロックを抜けると保存される（AndroidX の便利な書き方）
- 保存したら、読み直して StateFlow に入れる。画面も `WalkService` も、この StateFlow を見ているので、すぐに新しい設定で動く（[2-2](../02-compose/02-state-viewmodel.md)）
- 読むときは、保存されていなければ既定値（`DEFAULTS`）を使う

`enum` の値は名前（`settings.provider.name` → `"CLAUDE"`）で保存し、読むときに名前で探しています。知らない名前（古い版にあった値など）なら既定値に戻ります。

### 変えた値だけを保存する

しきい値（[1-1](../01-kotlin-android/01-kotlin-syntax.md) の `Threshold`）の保存には、大事な工夫があります。

```kotlin
// Only overrides are stored, so a changed default in a later version still applies.
Threshold.entries.forEach { t ->
    val value = settings.thresholds.values[t]
    if (value == null || value == t.default || !t.isValid(value)) remove(thresholdPref(t))
    else putInt(thresholdPref(t), value)
}
```

散策者が **既定値から変えた項目だけ** を保存し、既定値のままの項目は保存しません。

なぜでしょうか。全部保存すると、アプリの次の版で既定値を見直した（たとえば「トイレの案内は歩き始めて 20 分」を 15 分にした）とき、散策者の端末には古い既定値（20 分）が保存されているので、新しい既定値が届きません。変えた項目だけを保存しておけば、触っていない項目には新しい既定値がそのまま使われます。[README](../../yorisoi-sanpoguide/README.md) にも同じことが書かれています。

> 既定値から変えた項目だけを保存するので、アプリの既定値が変わった場合、変えていない項目には新しい既定値が使われる。

チャンネルごとのカスタマイズ（話しかけの頻度など）も同じ考え方で、チャンネルの値と違うものだけを保存しています。

### 古い設定を新しい形に移す

チャンネルの仕組みができる前、話しかけの頻度はアプリ全体で 1 つの設定でした。今は、チャンネルごとの設定です。古い版から更新した散策者の設定を、新しい形に移す必要があります。

```kotlin
private fun migrateToStations() {
    if (!prefs.contains(KEY_TALK_LEVEL)) return
    val moved = StationMigration.fromLegacy(
        talkLevel = prefs.getString(KEY_TALK_LEVEL, null),
        moodEnabled = prefs.getBoolean(KEY_MOOD, DEFAULTS.moodEnabled),
    )
    prefs.edit {
        remove(KEY_TALK_LEVEL)
        moved.talkLevel?.let { putString(stationPref(STANDARD, FIELD_TALK_LEVEL), it.name) }
        moved.moodTone?.let { putBoolean(stationPref(STANDARD, FIELD_MOOD_TONE), it) }
    }
}
```

- 古いキー（`KEY_TALK_LEVEL`）が残っていたら、その値を「標準」チャンネルの設定に移し、古いキーを消す
- 古いキーがなければ（新しく入れた人、移し終わった人）何もしない。だから、起動のたびに呼んでも安全
- 移し方の判断（`StationMigration.fromLegacy`）は、Android に依存しない小さな部品に出し、テストしている（`StationMigrationTest`。[2-3](../02-compose/03-manual-di.md)）

`SettingsRepository` の `init` で、設定を読む **前に** 呼んでいます。

## 散歩の記録: JSON のファイル

[HistoryStore.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/history/HistoryStore.kt):

```kotlin
/**
 * The user's walking history, kept only on this device (app-private storage, no backup).
 * Walks are listed newest first.
 */
class HistoryStore(context: Context) {
    private val file = AtomicFile(File(context.filesDir, "walk_history.json"))
    private val lock = Mutex()

    private val _walks = MutableStateFlow<List<WalkRecord>>(emptyList())
    val walks: StateFlow<List<WalkRecord>> = _walks.asStateFlow()

    /** Inserts or replaces a walk (walks in progress are saved repeatedly as they grow). */
    suspend fun save(walk: WalkRecord) = lock.withLock {
        val updated = (listOf(walk) + _walks.value.filter { it.id != walk.id })
            .sortedByDescending { it.startedAt }
            .take(MAX_WALKS)
        _walks.value = updated
        withContext(Dispatchers.IO) { write(updated) }
    }
}
```

- `context.filesDir`: アプリ専用のフォルダ
- 全部の記録をメモリ（StateFlow）に持ち、保存のたびにファイル全体を書き直す
- 散歩中の記録は、区切りやスポットのたびに **同じ ID で何度も保存** される（[3-1](../03-walk/01-coroutines.md) の `saveProgress`）。だから「同じ ID のものを消してから足す」
- `Mutex` で、保存が重ならないようにする（散歩の途中の保存と、終わりの保存がほぼ同時に来ることがある）
- 書き込みは `Dispatchers.IO` で（[3-1](../03-walk/01-coroutines.md)）

### 書き込みの途中で落ちても壊さない: AtomicFile

ファイルを書いている途中で、電池が切れたり、アプリが止められたりしたらどうなるでしょう。ファイルが **半分だけ書かれた壊れた状態** になり、次に起動したとき、500 回分の散歩の記録が全部読めなくなるかもしれません。

`AtomicFile` は、これを防ぐ AndroidX の部品です。

```kotlin
private fun write(walks: List<WalkRecord>) {
    val json = JSONArray().apply { walks.forEach { put(WalkJson.toJson(it)) } }.toString()
    val out = file.startWrite()
    try {
        out.write(json.toByteArray(Charsets.UTF_8))
        file.finishWrite(out)
    } catch (e: Exception) {
        file.failWrite(out)
        Log.w(TAG, "Could not save walk history", e)
    }
}
```

1. `startWrite()`: 本物のファイルではなく、**新しいファイル** に書き始める
2. 書き終わったら `finishWrite()`: 新しいファイルを本物のファイルと **入れ替える**
3. 失敗したら `failWrite()`: 新しいファイルを捨てる。本物のファイルは前のまま

入れ替えは一瞬で終わる（途中の状態がない）ので、いつ落ちても、ファイルは「前の版」か「新しい版」のどちらかで、壊れた状態にはなりません。

[ChannelStore.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/station/remote/ChannelStore.kt) も、同じことを手で書いています。

```kotlin
fun save(state: ChannelState) {
    dir.mkdirs()
    val tmp = File(dir, "state.json.tmp")
    tmp.writeText(encode(state).toString())
    if (!tmp.renameTo(stateFile)) {
        stateFile.delete()
        tmp.renameTo(stateFile)
    }
}
```

`state.json.tmp` に書いてから、名前を変えて入れ替えています。

### 読めなかったら、空から始める

```kotlin
private fun read(): List<WalkRecord> = try {
    // … ファイルを読んで JSON から WalkRecord に …
} catch (e: Exception) {
    Log.w(TAG, "Could not read walk history; starting fresh", e)
    emptyList()
}
```

それでも読めなかった場合は、アプリを落とさず、空の記録から始めます。記録が読めないことは残念ですが、アプリが起動しなくなるよりはずっとよいからです。

## 古い記録も読めるようにする

アプリの版が上がると、保存する項目が増えることがあります。散歩の記録には、チャンネルの仕組みができたときに「どのチャンネルで歩いたか」（`stations`）が加わりました。では、その前の版で保存した記録は？

```kotlin
/** The history file's format, one walk at a time. Fields added later are optional, so old files still load. */
internal object WalkJson {
    fun fromJson(o: JSONObject): WalkRecord {
        val route = o.optJSONArray("route") ?: JSONArray()
        val visits = o.optJSONArray("visits") ?: JSONArray()
        val stations = o.optJSONArray("stations") ?: JSONArray()
        return WalkRecord(
            id = o.getLong("id"),
            startedAt = o.getLong("startedAt"),
            // …
            visits = (0 until visits.length()).map {
                val v = visits.getJSONObject(it)
                SpotVisit(
                    // …
                    lat = if (v.has("lat")) v.getDouble("lat") else null,
                    lon = if (v.has("lon")) v.getDouble("lon") else null,
                    station = v.optString("station").ifEmpty { null },
                )
            },
            // …
        )
    }
}
```

コメントのとおり、**あとから足した項目は、なくても読めるように** しています（[4-1](01-http-json.md) の `get…` と `opt…` の使い分け）。

- 最初からある項目（`id`・`startedAt` など）は `get…`。なければ壊れたデータなので例外
- あとから足した項目（`stations`・`station`・`lat`・`lon`）は `opt…` や `has` で確かめる。なければ空や null

散策者の端末には、何年も前の版で保存した記録が残っているかもしれません。**保存したデータの形は、アプリの「約束」の一つ** です。第 6 部の API-002 の「知らない項目は無視する。項目の追加は互換性のある変更」と同じ考え方を、端末の中のデータにも当てはめています。

テスト（[WalkJsonTest.kt](../../yorisoi-sanpoguide/app/src/test/java/io/github/duwenji/yorisoi/sanpoguide/history/WalkJsonTest.kt)）は、この約束を守っています。

```kotlin
@Test
fun `records from before channels still load`() {
    val old = JSONObject(
        """
        {"id": 1, "startedAt": 1, "endedAt": 2, "distanceM": 10.0, "route": [],
         "visits": [{"poiId": "way/1", "name": "段葛", "category": "史跡", "at": 1, "remark": null, "lat": 35.3, "lon": 139.5}]}
        """.trimIndent(),
    )
    val read = WalkJson.fromJson(old)
    assertTrue(read.stations.isEmpty())
    assertNull(read.visits.single().station)
}
```

チャンネルより前の形の記録（`stations` も `station` もない）を、本物の JSON の文字列で用意し、読めることを確かめています。

## API キーを暗号化する: Android Keystore

AI のキーは、散策者のお金に直結する秘密です。SharedPreferences にそのまま保存すると、端末の中のファイルに平文で残ります。

散策ガイドは、キーを **暗号化してから** 保存しています。[KeyCipher.kt](../../yorisoi-platform/kit-llm/src/main/java/io/github/duwenji/yorisoi/kit/llm/KeyCipher.kt)（RFC-002 でキット `kit-llm` に移りました。Keystore の別名 `sanpo_api_keys` は、変えると保存したキーが読めなくなるので、移したあとも元のままです。コメントにもそう書いてあります）:

```kotlin
/** Encrypts API keys with an AES key that never leaves the Android Keystore. */
object KeyCipher {
    private const val KEYSTORE = "AndroidKeyStore"
    /** The Keystore entry holding the key: changing it loses every saved API key (RFC-002 R-8). */
    internal const val ALIAS = "sanpo_api_keys"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_BYTES = 12

    fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
        val out = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(out, Base64.NO_WRAP)
    }

    /** Returns null if the value can't be decrypted (e.g. the keystore entry was reset). */
    fun decrypt(encoded: String): String? = try {
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes, 0, IV_BYTES))
        }
        String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
    } catch (e: Exception) {
        null
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
            init(
                KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
        }.generateKey()
    }
}
```

### 鍵の置き場所が大事

暗号化の鍵をアプリのファイルに置いたら、鍵と暗号文が同じ場所にあることになり、意味がありません。**Android Keystore** は、鍵を **アプリから取り出せない場所**（端末によっては専用の安全なチップ）で作って保管し、暗号化・復号をその中でやってくれる仕組みです。

[第 6 部](../06-trust/04-two-tier-keys.md) の AWS KMS を思い出してください。「鍵を外に出さず、使うときは中でやってもらう」という同じ考え方です。KMS がクラウドで、Keystore が端末の中でそれをしています。

| | AWS KMS（第 6 部） | Android Keystore（この章） |
|---|---|---|
| どこにあるか | クラウド（AWS） | 端末の中 |
| 鍵 | Ed25519（署名） | AES（暗号化） |
| 何に使うか | 承認済みチャンネル・リストへの署名 | API キーの暗号化 |
| 鍵を取り出せるか | できない | できない |

### 暗号化の手順

1. **鍵を用意する**（`secretKey`）: Keystore に `sanpo_api_keys` という名前の鍵があればそれを、なければ 256 ビットの AES の鍵を Keystore の中で作る
2. **暗号化する**（`encrypt`）: AES-GCM で暗号化する。GCM は、暗号化と同時に **改ざんの検出** もしてくれる方式
3. **IV を前に付ける**: GCM は、暗号化のたびに **IV**（初期化ベクトル、12 バイトの使い捨ての乱数）を使う。復号に同じ IV が要るので、暗号文の前にくっつけて保存する（`cipher.iv + cipher.doFinal(…)`）
4. **文字にする**: バイト列を base64 にして、SharedPreferences に文字列として保存する（[技術カード: base64url と base32](../ref/base64url-base32.md)。こちらは普通の base64）

復号は、その逆です。先頭の 12 バイトを IV として取り出し、残りを復号します。

### 復号できなかったら

```kotlin
/** Returns null if the value can't be decrypted (e.g. the keystore entry was reset). */
```

端末の設定を変えたり、アプリのデータが一部だけ消えたりすると、Keystore の鍵がなくなることがあります。そのときは例外で落とさず null を返し、「キーが設定されていない」状態として扱います。散策者はキーを入れ直せば元どおり使えます。

## ハンズオン: 古い記録が読めることを守る

### 1. テストを流す

```sh
cd /c/Dev/apps/yorisoi-sanpoguide
./gradlew :app:testDebugUnitTest --tests '*WalkJsonTest*'
```

2 件のテストが通ります。1 つは「保存して読み直すと同じものになる」、もう 1 つは「チャンネルより前の記録も読める」です。

### 2. 古い記録を読めなくしてみる

[HistoryStore.kt](../../yorisoi-sanpoguide/app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/history/HistoryStore.kt) の `WalkJson.fromJson` で、

```kotlin
val stations = o.optJSONArray("stations") ?: JSONArray()
```

を

```kotlin
val stations = o.getJSONArray("stations")
```

に変えて、テストを流します。

```
2 tests completed, 1 failed
```

`records from before channels still load` が `JSONObject["stations"] not found.` で落ちます。もしこの変更がそのまま出荷されたら、古い版から更新した散策者は、`read()` の `catch` で「読めないので空から始める」ことになり、**それまでの散歩の記録がすべて画面から消えて** しまいます。小さな変更が大きな事故につながる例です。

### 3. 元に戻す

```sh
git checkout -- app/src/main/java/io/github/duwenji/yorisoi/sanpoguide/history/HistoryStore.kt
git status
```

### 4. 端末の中をのぞく（任意・デバッグ版だけ）

デバッグ版をエミュレータに入れていれば、`run-as` でアプリ専用の領域をのぞけます（Android SDK の `adb` を使います。[3-2](../03-walk/02-service.md) のハンズオンを参照）。

```sh
adb shell run-as io.github.duwenji.yorisoi.sanpoguide ls files shared_prefs
```

`files/` に `walk_history.json` と `channels/`、`shared_prefs/` に `guide_settings.xml` が見えるはずです。`guide_settings.xml` の中の API キーの値が、暗号化された（読めない）文字列になっていることも確かめられます。

> `run-as` は、デバッグ版（`./gradlew installDebug` で入れたもの）でしか使えません。リリース版が入っていると `package not debuggable` と表示されます。リリース版とデバッグ版は署名が違うので、デバッグ版に入れ替えるにはアンインストールが要り、**端末の散歩の記録や設定が消えます**（[1-4](../01-kotlin-android/04-signing-apk.md)）。大事なデータがある端末では試さないでください。

## つまずきやすいところ

- **書き込みの途中で落ちる前提で書く**: `AtomicFile` や「一時ファイルに書いて名前を変える」で、ファイルを壊さない
- **保存した形は約束**: あとから足した項目は、なくても読めるように。古い形のデータでのテストを用意する
- **既定値は保存しない**: 変えた値だけを保存すれば、次の版の既定値の見直しが届く
- **秘密は平文で保存しない**: Keystore の鍵で暗号化する。鍵そのものをファイルに置かない
- **読めなくても落とさない**: 空から始める、キーがない扱いにする

## 確認問題

<details>
<summary>問 1. 散歩の記録を書いている途中で電池が切れました。次に起動したとき、記録はどうなっていますか。</summary>

書き込みの前の記録がそのまま残っています。`AtomicFile` は新しいファイルに書いてから、書き終わったときに一瞬で入れ替えるので、途中で落ちても本物のファイルは前のままです。失われるのは、その最後の保存の分だけです。

</details>

<details>
<summary>問 2. 散策者が「トイレの案内」の距離を変えず、既定値の 100m のまま使っています。次の版で既定値を 80m にしました。散策者の端末ではどうなりますか。</summary>

80m になります。既定値のままの項目は保存していないので、新しい版の既定値がそのまま使われます。

</details>

<details>
<summary>問 3. API キーを暗号化する鍵を、アプリのファイルに保存しないのはなぜですか。</summary>

鍵と暗号文が同じ場所にあると、ファイルを読める人は鍵も読めてしまい、暗号化の意味がないからです。Android Keystore は、鍵をアプリから取り出せない場所で作って保管し、暗号化と復号をその中で行います。

</details>

---

前: [4-4 声と音](04-voice-sound.md) ／ 次: [5-1 Android に依存しない JVM ライブラリ](../05-station-format/01-jvm-library.md)
