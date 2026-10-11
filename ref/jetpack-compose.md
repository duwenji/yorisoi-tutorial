# Jetpack Compose

[目次](../README.md) ＞ [技術カード](README.md) ＞ Jetpack Compose

## 一言で

Android の画面を、Kotlin の関数で「データがこうなら、画面はこう」と書くためのライブラリです。データが変わると、Compose が関数を呼び直して画面を描き直します。

## 仕組み

```mermaid
flowchart LR
    D["状態<br/>（State・StateFlow）"] -->|読む| C["@Composable 関数<br/>画面の部品を組み立てる"]
    C -->|最初に呼ぶ| T["部品の木<br/>（Compose が覚えている）"]
    T --> S["画面に描く"]
    E["利用者の操作<br/>（タップなど）"] -->|状態を変える| D
    D -. "変わった状態を読む部分だけ<br/>呼び直す（再コンポーズ）" .-> C
```

- **宣言的**: 画面の部品を探して書き換える手順は書きません。「この状態ならこの画面」を関数で書くだけです
- **Composable 関数**: `@Composable` を付けた関数が画面の部品です。中でほかの Composable を呼んで組み立てます。`if` や `forEach` など普通の Kotlin の構文で、表示・非表示やくり返しを書けます
- **再コンポーズ**: Compose は、どの部品がどの状態を読んだかを覚えていて、状態が変わると **その部分の関数だけ** を呼び直します。そのため Composable は、何度呼ばれても同じ結果になるように書きます
- **状態**: `mutableStateOf` で作った値は、変わると Compose に知らせます。`remember` で再コンポーズをまたいで覚え、`rememberSaveable` で画面の回転もまたいで覚えます
- **Modifier**: 大きさ・余白・タップ・背景などを、つなげて指定します。順番に意味があります

## 最小の使い方

手元で試すには、Android Studio で「New Project」→「Empty Activity」を選ぶのが早道です。Compose の設定が済んだプロジェクトができます。下のコードはそこに貼って動かせます（散策ガイドのプロジェクトの中で、コンパイルが通ることを確かめたものです）。

### 部品を書く

```kotlin
@Composable
fun StepCounter(modifier: Modifier = Modifier) {
    var steps by rememberSaveable { mutableIntStateOf(0) }
    Column(modifier.padding(16.dp)) {
        Text("歩いた数: $steps", style = MaterialTheme.typography.titleLarge)
        Row {
            Button(onClick = { steps++ }) { Text("1 歩") }
            Spacer(Modifier.width(8.dp))
            Button(onClick = { steps = 0 }) { Text("リセット") }
        }
        if (steps >= 10) Text("よく歩きました")
    }
}
```

- ボタンを押すと `steps` が変わり、`steps` を読んでいる `Text` と `if` が描き直される
- 10 歩を超えると「よく歩きました」が現れる。表示を足す手順は書いていない
- `mutableIntStateOf` は `Int` 専用の `mutableStateOf`（少し速い）

### プレビューで見る

```kotlin
@Preview(widthDp = 320)
@Composable
private fun StepCounterPreview() {
    MaterialTheme { StepCounter() }
}
```

Android Studio でファイルを開き、右上の「Split」を押すと、アプリを動かさずに部品が描かれます。「Interactive mode」でボタンも押せます。

### 画面に置く

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme { StepCounter() }
        }
    }
}
```

`setContent { … }` の中が、Activity の画面になります。

### よく使う部品

| 部品 | 役割 |
|---|---|
| `Text` | 文字 |
| `Button`・`IconButton` | ボタン |
| `Column`・`Row`・`Box` | 縦に並べる・横に並べる・重ねる |
| `LazyColumn` | 長い一覧（画面に見える分だけ作る） |
| `Scaffold` | 上のバー・下のボタンなど、画面の枠 |
| `Surface`・`Card` | 背景と形のある入れ物 |
| `Canvas` | 図形を自分で描く |
| `AndroidView` | Compose に対応していない昔の部品（View）を置く |

## このリポジトリでは

散策ガイドの画面は、すべて Compose で書かれています（Activity は `MainActivity` の 1 つだけ）。

| 場所 | 見どころ | 章 |
|---|---|---|
| [CompanionCard.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/ui/CompanionCard.kt) | 引数だけで描く部品、`rememberSaveable`、時間で変わる値（`produceState`）、Modifier | [2-1](../02-compose/01-compose-basics.md) |
| [MainScreen.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/ui/MainScreen.kt) | ViewModel の状態を受け取り、操作をラムダで上に伝える | [2-2](../02-compose/02-state-viewmodel.md) |
| [MoodTheme.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/ui/MoodTheme.kt) | Material3 のテーマを雰囲気で切り替え、色をアニメーションで変える | [2-4](../02-compose/04-theme-mood.md) |
| [MoodScene.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/ui/MoodScene.kt) | `Canvas` で風景を描く | [2-4](../02-compose/04-theme-mood.md) |
| [SpotMap.kt](../../SanpoGuide/app/src/main/java/io/github/duwenji/sanpoguide/ui/SpotMap.kt) | `AndroidView` で地図（osmdroid）を置く | [4-2](../04-outside/02-map.md) |

## よくある間違い

| 間違い | 起きること | 正しくは |
|---|---|---|
| Composable の中でネットワークやファイルを扱う | 再コンポーズのたびに走る | ViewModel で行い、結果の状態だけを受け取る |
| `remember` なしで `mutableStateOf` を書く | 描き直すたびに初めの値に戻る | `remember { mutableStateOf(…) }`。回転をまたぐなら `rememberSaveable` |
| リストや data class の中身を書き換える | Compose が変化に気づかず、画面が変わらない | `copy` や新しいリストで、新しい値を入れる |
| Modifier の順番を気にしない | タップの範囲や背景の塗り方が思ったのと違う | 外側から順に効くと考えて並べる |
| 部品に色を直接書く | テーマやダークモードで色が変わらない | `MaterialTheme.colorScheme.◯◯` を使う |
| 長い一覧を `Column` と `forEach` で作る | 全部の項目を一度に作るので重い | `LazyColumn` を使う |

## 版と公式ドキュメント

| 項目 | 版 |
|---|---|
| Compose BOM | 2025.06.00（SanpoGuide の `app/build.gradle.kts`） |
| `androidx.compose.ui:ui` | 1.8.2（BOM が決める） |
| `androidx.compose.material3:material3` | 1.3.2（BOM が決める） |
| Compose のコンパイラ | Kotlin 2.2.0 のプラグイン `org.jetbrains.kotlin.plugin.compose` |

- [Jetpack Compose の公式ドキュメント](https://developer.android.com/develop/ui/compose?hl=ja)
- [Compose の考え方](https://developer.android.com/develop/ui/compose/mental-model?hl=ja)
- [状態と Jetpack Compose](https://developer.android.com/develop/ui/compose/state?hl=ja)
- [Material3 for Compose](https://developer.android.com/develop/ui/compose/designsystems/material3?hl=ja)
