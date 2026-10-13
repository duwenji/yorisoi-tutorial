# 4-1 HTTP と JSON

[目次](../README.md) ＞ 第 4 部 ＞ 4-1

> OkHttp の仕組みと最小の使い方は [技術カード: OkHttp](../ref/okhttp.md) にあります。

## この章で学ぶこと

- 散策ガイドが話しかける外部のサービスと、それぞれから何をもらっているか
- OkHttp で HTTP の要求を送り、結果を受け取る方法（タイムアウト、エラー、後片付け）
- `org.json` で JSON を読む方法
- 無料の公開サービスと上手に付き合う工夫（予備のサーバー、User-Agent、呼ぶ回数を減らす）

## 散策ガイドが使う外部のサービス

| サービス | 何をもらうか | キー | 呼ぶ部品 |
|---|---|---|---|
| **Overpass API**（OpenStreetMap） | 近くのスポットと施設 | 要らない | [OverpassClient.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/OverpassClient.kt) |
| **Open-Meteo** | 今の天気、15 分ごとの予報、日の入り | 要らない | [WeatherClient.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/weather/WeatherClient.kt) |
| **FOSSGIS OSRM** | 徒歩のルート | 要らない | [RouteClient.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/RouteClient.kt) |
| **Wikimedia Commons** | スポットの写真 | 要らない | [SpotPhotos.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/SpotPhotos.kt) |
| 国土地理院・Google Map Tiles | 地図の画像 | Google だけ要る | [4-2](02-map.md) |
| Claude・OpenAI 互換の AI | 解説と話しかけ | 要る（散策者のキー） | [4-3](03-ai.md) |

キーの要らない無料のサービスを中心に組み立てているので、散策者は AI のキーさえ用意すれば使い始められます（AI のキーがなくても、定型文で動きます）。

## HTTP の要求と応答

どのサービスも **HTTP** でやりとりします。アプリが **要求**（リクエスト）を送り、サーバーが **応答**（レスポンス）を返します。

| 要求の部品 | 例（Open-Meteo） |
|---|---|
| メソッド | `GET`（もらうだけ）、`POST`（データを送る） |
| URL | `https://api.open-meteo.com/v1/forecast?latitude=35.326&longitude=139.556&…` |
| ヘッダー | `User-Agent: SanpoGuide/0.1 (Android)` |
| 本文（POST のとき） | Overpass の問い合わせの文 |

| 応答の部品 | 例 |
|---|---|
| ステータスコード | `200`（成功）、`404`（見つからない）、`429`（呼びすぎ）、`5xx`（サーバー側の失敗） |
| 本文 | JSON |

## OkHttp で呼ぶ

散策ガイドは、Android で定番の HTTP ライブラリ **OkHttp** を使っています。天気を取る [WeatherClient.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/weather/WeatherClient.kt) を読みます。

```kotlin
class WeatherClient {
    private val http = OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build()

    suspend fun current(lat: Double, lon: Double): Weather = withContext(Dispatchers.IO) {
        val url = "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon" +
            "&current=temperature_2m,precipitation,weather_code" +
            "&minutely_15=precipitation,weather_code&forecast_minutely_15=$FORECAST_STEPS" +
            "&daily=sunset&forecast_days=1&timezone=auto"
        http.newCall(Request.Builder().url(url).build()).execute().use { res ->
            if (!res.isSuccessful) throw IOException("Open-Meteo error: HTTP ${res.code}")
            val json = JSONObject(res.body!!.string())
            // … JSON から Weather を作る …
        }
    }
}
```

1. **`OkHttpClient` を作る**（1 回だけ）: `callTimeout(15, SECONDS)` は「要求の全体が 15 秒を超えたら諦める」という指定。歩いている人を何十秒も待たせないため
2. **`Request` を作る**: URL（とヘッダー）を決める
3. **`newCall(…).execute()`**: 送って、応答が来るまで **スレッドを止めて** 待つ。だから全体を `withContext(Dispatchers.IO)` の中で行う（[3-1](../03-walk/01-coroutines.md)）
4. **`.use { res -> … }`**: 使い終わったら応答を必ず閉じる。閉じ忘れると接続が使い回されず、たまっていく
5. **`res.isSuccessful`**: ステータスが 200 番台かどうか。それ以外は例外にする
6. **`res.body!!.string()`**: 本文を文字列で読む

### タイムアウトを用途に合わせる

[OverpassClient.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/OverpassClient.kt) のタイムアウトには、実際につまずいた経験がコメントに残っています。

```kotlin
private val http: OkHttpClient = OkHttpClient.Builder()
    .callTimeout(40, TimeUnit.SECONDS)
    // The server may think for up to the query's [timeout:25] before sending anything;
    // OkHttp's default 10-second read timeout gave up on answers that were on their way.
    .readTimeout(30, TimeUnit.SECONDS)
    .build(),
```

Overpass は、問い合わせの処理に最大 25 秒かかることがあり、その間は何も送ってきません。OkHttp の **読み取りのタイムアウトの既定値は 10 秒** なので、答えが来る前に諦めていました。そこで読み取りを 30 秒に延ばしています。

| タイムアウト | 意味 | OkHttp の既定値 |
|---|---|---|
| `connectTimeout` | 接続できるまで | 10 秒 |
| `readTimeout` | データが届かない間 | 10 秒 |
| `writeTimeout` | データを送りきれない間 | 10 秒 |
| `callTimeout` | 要求の全体 | なし（無制限） |

| 部品 | `callTimeout` | 理由 |
|---|---|---|
| `WeatherClient`・`RouteClient` | 15 秒 | すぐ答えが来るはずのサービス |
| `OverpassClient` | 40 秒（読み取り 30 秒） | 問い合わせの処理が重い |
| `OpenAiCompatibleClient` | 90 秒 | AI が長い文を作るのは時間がかかる |

### POST で問い合わせを送る

Overpass には、問い合わせの文を **POST** で送ります。

```kotlin
val request = Request.Builder()
    .url(endpoint)
    .header("User-Agent", "SanpoGuide/0.1 (Android)")
    .post(FormBody.Builder().add("data", query).build())
    .build()
```

問い合わせは Overpass QL という専用の言語で書きます。

```kotlin
val query = """
    [out:json][timeout:25];
    (
      nwr($around)["name"]["historic"];
      nwr($around)["name"]["tourism"~"^(attraction|museum|viewpoint|artwork|gallery)$"];
      nwr($around)["name"]["amenity"="place_of_worship"];
      nwr($around)["name"]["leisure"~"^(park|garden)$"];
      nwr($around)["name"]["natural"~"^(tree|peak|spring|water|beach)$"];
    );
    out tags geom 80;
    nwr($around)["amenity"="toilets"]$open;
    out center 40;
    // …
""".trimIndent()
```

- `nwr(around:600,緯度,経度)`: その点から 600m 以内の、点（node）・線（way）・関係（relation）
- `["name"]["historic"]`: 名前があって、`historic` のタグを持つもの（史跡）
- `out tags geom 80`: タグと形を、最大 80 件
- `"""…"""` は Kotlin の **生の文字列**（改行や `"` をそのまま書ける）、`trimIndent()` は行頭の共通の空白を取る

OpenStreetMap では、場所の種類を **タグ**（`amenity=toilets` のような「キー=値」）で表します。散策ガイドが「何をスポットとみなすか」は、この問い合わせが決めています。

### 混んでいたら次のサーバーへ

```kotlin
// Public Overpass servers are often busy (429/504); fall through to the next mirror.
var lastError: IOException? = null
for (endpoint in ENDPOINTS) {
    // …
    try {
        http.newCall(request).execute().use { res ->
            if (res.isSuccessful) {
                val body = res.body!!.string()
                Log.i(TAG, "OK ${elapsed(startedAt)}ms ${body.length}B $endpoint")
                return@withContext parse(body)
            }
            lastError = IOException("Overpass API error: HTTP ${res.code}")
        }
    } catch (e: IOException) {
        lastError = e
    }
}
throw lastError!!
```

公開の Overpass のサーバーは混んでいることが多く、`429`（呼びすぎ）や `504`（時間切れ）を返します。そこで、同じデータを持つ **ミラー**（別のサーバー）を 3 つ並べ、失敗したら次を試します。全部だめなら、最後のエラーを投げます。

`return@withContext parse(body)` は、ループの途中から `withContext` のブロックの結果として返す書き方です（[3-2](../03-walk/02-service.md) の `return@collect` と同じ）。

かかった時間をログに残しているのは、コメントのとおり、検索にかかる時間とサーバーが諦める頻度を測るためです。

### User-Agent

```kotlin
.header("User-Agent", "SanpoGuide/0.1 (Android)")
```

**User-Agent** は「だれが呼んでいるか」を名乗るヘッダーです。無料の公開サービス（Overpass、OSRM、地図のタイル）の多くは、利用の規約で、アプリを見分けられる User-Agent を付けるよう求めています。困ったことが起きたとき、運営者が連絡できるようにするためです。

## JSON を読む

散策ガイドは、JSON を **`org.json`** で読んでいます。Android に最初から入っているライブラリです（[1-2](../01-kotlin-android/02-gradle.md) の「単体テストでは本物を足す」の、あの `org.json`）。

[RouteClient.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/RouteClient.kt) の `parse` は小さくて読みやすい例です。

```kotlin
internal fun parse(body: String): WalkRoute {
    val json = JSONObject(body)
    if (json.optString("code") != "Ok") throw IOException("Routing error: ${json.optString("code")}")
    val route = json.getJSONArray("routes").getJSONObject(0)
    val coords = route.getJSONObject("geometry").getJSONArray("coordinates")
    val points = (0 until coords.length()).map { i ->
        coords.getJSONArray(i).let { LatLon(lat = it.getDouble(1), lon = it.getDouble(0)) }
    }
    if (points.size < 2) throw IOException("Routing error: empty route")
    return WalkRoute(points, route.optDouble("distance", 0.0), onPaths = true)
}
```

| 書き方 | 項目がないとき |
|---|---|
| `getString`・`getJSONArray`・`getDouble` | 例外（`JSONException`） |
| `optString`・`optJSONArray`・`optDouble(…, 既定値)` | 空文字・null・既定値 |

**必ずあるはずの項目は `get…`、なくてもよい項目は `opt…`** と使い分けています。必ずあるはずの項目がなければ、応答がおかしいので、例外で止めるのが正しい振る舞いです。

`(0 until coords.length()).map { … }` は、`JSONArray` を Kotlin のリストに変える決まり文句です。`JSONArray` は Kotlin のリストではないので、`map` を直接使えません。

OSRM の座標は `[経度, 緯度]` の順（GeoJSON の決まり）なので、`getDouble(1)` が緯度、`getDouble(0)` が経度です。URL を作るときも経度が先です（コメント: "OSRM takes lon,lat"）。緯度と経度の順番は、地図のサービスごとに違うので、よく間違えるところです。

### 同じ場所の重複をまとめる

Overpass の結果を読む `parse` には、OpenStreetMap ならではの工夫があります。

```kotlin
// The same place is often mapped both as a node and an area. Keep the area, whose
// edge tells when the user arrives, but also the node's tags (often the wikipedia link).
val key = "$name@${"%.3f".format(lat)},${"%.3f".format(lon)}"
val seen = result[key]
result[key] = when {
    seen == null -> poi
    seen.shape == null && poi.shape != null -> poi.copy(tags = seen.tags + poi.tags)
    else -> seen
}
```

OpenStreetMap では、同じ寺が「点」と「敷地の範囲」の両方で登録されていることがよくあります。名前と、小数 3 桁（約 100m）に丸めた位置が同じなら同じ場所とみなし、**範囲の方を残して、点のタグ（Wikipedia へのリンクなど）を足し合わせて** います。範囲を残すのは、[3-3](../03-walk/03-location-sensors.md) で見た「境界から 60m」の判定に使うためです。

## 呼ぶ回数を減らす

無料の公開サービスは、みんなで分け合って使うものです。散策ガイドは呼ぶ回数を減らす工夫をしています。

| 工夫 | 場所 |
|---|---|
| スポットは 300m 動いたときだけ検索し直す | `SpotRepository`（[3-1](../03-walk/01-coroutines.md)） |
| 天気は 15 分に 1 回 | `WalkService.refreshWeather` |
| ルートは目的地か、歩いている道筋が変わったときだけ | `RouteClient` のコメント |
| 写真は Wi-Fi のときだけ（既定） | `MainViewModel.initialPhotoState` |
| AI の解説は、同じスポット・同じチャンネルなら使い回す | `GuideRepository` のキャッシュ（[4-3](03-ai.md)） |

## ハンズオン: 散策ガイドと同じ要求を送ってみる

`curl`（Git Bash に入っている、HTTP の要求を送る道具）で、散策ガイドと同じサービスを呼んでみます。どれもキーの要らない無料のサービスです。**何度も続けて呼ばないでください**（みんなで分け合っているサービスです）。

### 1. 天気（Open-Meteo）

鶴岡八幡宮のあたりの、今の天気と日の入りです。

```sh
cd /tmp
curl -s -o weather.json "https://api.open-meteo.com/v1/forecast?latitude=35.3260&longitude=139.5563&current=temperature_2m,precipitation,weather_code&daily=sunset&forecast_days=1&timezone=auto"
python -m json.tool weather.json
```

```
    "current": {
        "time": "2026-10-04T20:00",
        "interval": 900,
        "temperature_2m": 19.4,
        "precipitation": 0.0,
        "weather_code": 2
    },
    …
    "daily": {
        "time": ["2026-10-04"],
        "sunset": ["2026-10-04T17:22"]
    }
```

`weather_code` は WMO（世界気象機関）の天気の番号です（2 は「一部くもり」）。散策ガイドは [WeatherClient.kt](../../yorisoi-platform/kit-geo/src/main/java/io/github/duwenji/yorisoi/kit/geo/weather/WeatherClient.kt) の `WeatherCodes` で、これを「晴れ」「雨」などに直しています。`interval: 900` は、今の天気が 15 分（900 秒）ごとの値だという意味で、[3-4](../03-walk/04-maybe-talk.md) の `WeatherChangeDetector` のコメントに出てきた「15 分」の正体です。

> Windows では、`℃` などの記号が `°C` のように表示されることがあります（`json.tool` が英数字以外を書き換えるため）。`weather.json` を VS Code で開けば、そのまま読めます。

### 2. 近くの寺社（Overpass）

鶴岡八幡宮のあたり 200m の礼拝所を、散策ガイドの問い合わせを小さくしたもので探します。

```sh
curl -s -A "SanpoGuide-tutorial" -o worship.json \
  --data-urlencode 'data=[out:json][timeout:25];nwr(around:200,35.3260,139.5563)["name"]["amenity"="place_of_worship"];out tags center 5;' \
  https://overpass-api.de/api/interpreter
python -X utf8 -c "
import json
for e in json.load(open('worship.json', encoding='utf-8'))['elements']:
    t = e['tags']; print(e['type'], e['id'], t.get('name'), t.get('religion'), t.get('wikipedia'))"
```

```
way 34547350 舞殿 shinto None
way 34550401 鶴岡八幡宮 shinto ja:鶴岡八幡宮
way 34550404 若宮 shinto None
…
```

- `-A "…"` で User-Agent を名乗っています
- 鶴岡八幡宮は `way`（範囲）で登録されていて、`wikipedia` のタグがあります。散策ガイドは、Wikipedia の記事があるスポットを「話題になりそう」として優先します（[3-4](../03-walk/04-maybe-talk.md) の `SpotChooser`、`Poi.notability`）
- 混んでいると `429` などで空の応答が返ります。少し待ってから試してください

### 3. 徒歩のルート（OSRM）

鎌倉駅から鶴岡八幡宮までの徒歩のルートです。**経度が先** であることに注意してください。

```sh
curl -s -A "SanpoGuide-tutorial" -o route.json \
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving/139.5536,35.3190;139.5563,35.3260?overview=false"
python -c "
import json
d = json.load(open('route.json')); r = d['routes'][0]
print(d['code'], round(r['distance']), 'm', round(r['duration'] / 60), 'min')"
```

```
Ok 967 m 13 min
```

URL の `driving` は API の決まりで変えられない部分で、徒歩は `routed-foot` のサーバーが受け持っています（`RouteClient` のコメント）。

### 4. 経度と緯度を入れ替えてみる

手順 3 の URL で、`139.5536,35.3190` を `35.3190,139.5536` に（2 か所とも）入れ替えて送ってみてください。どうなるでしょうか。

<details>
<summary>結果の見方</summary>

緯度と経度を入れ替えると、経度 35°・緯度 139° を指すことになります。緯度は ±90° までなので、OSRM は座標がおかしいというエラーを返します。

```
{"message":"Invalid coordinate value.","code":"InvalidValue"}
```

`code` が `Ok` ではないので、手順 3 の Python は `routes` が見つからずに止まります。散策ガイドの `parse` は `code` が `Ok` でなければ例外にし、ルートが引けないときは地図に直線（破線）を描きます（`WalkRoute.straight`）。

</details>

### 5. 片付け

```sh
rm -f weather.json worship.json route.json
```

## つまずきやすいところ

- **メインスレッドで `execute()` しない**: `withContext(Dispatchers.IO)` の中で
- **応答は必ず閉じる**: `use { … }` で
- **読み取りのタイムアウトの既定値は 10 秒**: 考える時間の長いサービスでは延ばす
- **ステータスコードを確かめる**: 200 番台でなければ、本文はエラーの説明かもしれない
- **緯度と経度の順番**: サービスによって違う（GeoJSON と OSRM は経度が先）
- **無料の公開サービスに優しく**: User-Agent を名乗り、呼ぶ回数を減らす

## 確認問題

<details>
<summary>問 1. Overpass のタイムアウトを OkHttp の既定値のままにすると、何が起きましたか。</summary>

Overpass は問い合わせの処理に最大 25 秒かかり、その間は何も送ってきません。OkHttp の読み取りのタイムアウトの既定値は 10 秒なので、答えが届く前に諦めていました。そこで読み取りを 30 秒、全体を 40 秒にしています。

</details>

<details>
<summary>問 2. JSON の項目を読むとき、<code>getString</code> と <code>optString</code> をどう使い分けますか。</summary>

必ずあるはずの項目は `getString`（なければ例外で止める）、なくてもよい項目は `optString`（なければ空文字や既定値）を使います。必ずあるはずの項目がないのは応答がおかしいということなので、例外で止めるのが正しい振る舞いです。

</details>

<details>
<summary>問 3. Overpass の結果で、同じ寺が「点」と「範囲」の両方で返ってきました。散策ガイドはどちらを残しますか。それはなぜですか。</summary>

範囲を残し、点のタグ（Wikipedia へのリンクなど）を足し合わせます。範囲があれば、散策者が境界から 60m 以内に来たかを判定できるからです。

</details>

---

次: [4-2 地図](02-map.md)
