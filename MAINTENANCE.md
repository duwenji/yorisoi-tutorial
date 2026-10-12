# チュートリアルの見直し手順

このチュートリアルは、両リポジトリの `main` を追いかけます。コミットに固定しないので、コードが変わると説明が古くなります。次の手順で定期的に見直してください。

## いつ見直すか

- 月に 1 回
- 次のような大きな変更が `main` に入ったとき
  - 契約書（API-002・API-003・API-001）やデータモデル（DM-001）の版が上がった
  - パッケージ・モジュール・Lambda を足した、消した、名前を変えた
  - 依存ライブラリの大きな更新（Kotlin・AGP・Compose BOM・TypeScript・CDK・React など）

## 手順

### 1. 前回からの変更を一覧する

[README.md](README.md) の「照合したコミット」から今の `main` までの差分を見ます。

```sh
cd ../SanpoGuide && git pull && git log --oneline ac66b5d..main
cd ../michizure-console && git pull && git log --oneline 68e7852..main
```

ファイル名だけを見るなら `git diff --stat <前回>..main` が便利です。

### 2. リンク切れを探す

チュートリアルが参照しているファイルが今もあるかを確かめます。

```sh
cd ../sanpo-tutorial
for md in $(find . -name '*.md'); do
  dir=$(dirname "$md")
  grep -oE '\]\([^)#]+' "$md" | sed -E 's/^\]\(//' | grep -v '^http' | while read -r p; do
    [ -e "$dir/$p" ] || echo "$md: 見つからない $p"
  done
done
```

チュートリアルの中の章どうしのリンクも、同じスクリプトで確かめられます。

見つからないものは、移動先を探してリンクを直します。

### 3. 名前を挙げた関数・型が今もあるか確かめる

本文で挙げた関数名・型名（例: `verifyChannelList`、`ProviderDocuments.channelList`、`signChannelList`）で検索し、なくなっていたり意味が変わっていたりしないかを見ます。

```sh
grep -rn "fun channelList\|export function verifyChannelList\|export async function signChannelList" \
  ../SanpoGuide ../michizure-console --include=*.kt --include=*.ts
```

### 4. 引用したコードを照合する

本文に貼ったコードの断片は、元のコードと食い違っていないか目で比べます。食い違っていたら、説明の要点が変わったかどうかで判断します。

- 要点が同じ（名前の変更、引数の追加など）: 断片を今のコードに合わせる
- 要点が変わった（仕組みそのものの変更）: 本文から書き直す

### 5. ハンズオンを実際に流す

各部のハンズオンを、書いてあるとおりに実行します。出力の例が変わっていたら差し替えます。

### 6. 技術カードの版を確かめる

依存ライブラリの版が上がっていたら、該当する技術カード（`ref/`）の「版と公式ドキュメント」の表を直し、「最小の使い方」が今の版でも動くかを確かめます。AWS のサービスは、上限（例: KMS の Sign は 4,096 バイト）や料金が変わることがあるので、公式ドキュメントと料金のページも見直します。

```sh
cd ../SanpoGuide && git diff ac66b5d..main -- '*.gradle.kts' gradle/
cd ../michizure-console && git diff 68e7852..main -- '**/package.json'
```

### 7. 記録を更新する

[README.md](README.md) の「最後に照合した日」と「照合したコミット」を更新します。

## 書くときの決まり

- 場所は **ファイルと関数の名前** で示す。行番号は書かない（すぐずれるため）
- コードの断片は、説明に要る部分だけを短く引用する。省いたところは `// …` と書く
- 契約書の決定事項（P-1、V-03 など）を引くときは、番号も添える。読者が元の文書で根拠をたどれるようにする
- 未実装の機能に触れるときは、両リポジトリの文書にならって 🚧 を付ける
- 人の呼び方は SanpoGuide の [docs/stakeholders.md](../SanpoGuide/docs/stakeholders.md) に従う（散策者・チャンネル提供者・素材提供者・運営、リスト・リストID）。コードや JSON の名前（`publisher`・`producer`・`provider`）はそのまま書き、地の文の呼び方とは分ける。プロンプトやコミットのメッセージを引用するときは、元の言葉（「利用者」など）のまま写す
