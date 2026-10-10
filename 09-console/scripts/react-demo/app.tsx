// 第 9 部 9-1 の React の練習。管理画面と同じ部品（useState・useEffect・react-router）だけを使う。
import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router';

interface Channel {
  channelId: string;
  name: string;
  listed: boolean;
}

// 本物の画面では API を呼ぶところ。ここでは 0.3 秒後に決まった値を返す。
function fetchChannels(): Promise<Channel[]> {
  return new Promise((resolve) =>
    setTimeout(() => resolve([
      { channelId: 'kamakura-history', name: '鎌倉歴史散歩', listed: true },
      { channelId: 'yokohama-port', name: '横浜港めぐり', listed: false },
    ]), 300),
  );
}

/** 状態（useState）が変わると、React が描き直す。 */
export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <p>
      押した回数: {count} <button onClick={() => setCount(count + 1)}>押す</button>
    </p>
  );
}

/** 画面に出たあとで読み込む（useEffect）。読み込み中・失敗・成功を描き分ける。 */
export function ChannelList() {
  const [items, setItems] = useState<Channel[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetchChannels().then(setItems, (e: unknown) => setError(String(e)));
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!items) return <p>読み込んでいます…</p>;
  return (
    <ul>
      {items.map((c) => (
        <li key={c.channelId}>
          <Link to={`/channels/${c.channelId}`}>{c.name}</Link> {c.listed ? '（公開中）' : '（未公開）'}
        </li>
      ))}
    </ul>
  );
}

function ChannelPage() {
  const { channelId = '' } = useParams();
  return (
    <section>
      <h1>チャンネル: {channelId}</h1>
      <Link to="/">一覧へ戻る</Link>
    </section>
  );
}

/** 道（URL）ごとに描くものを選ぶ。 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<section><h1>チャンネル</h1><Counter /><ChannelList /></section>} />
      <Route path="/channels/:channelId" element={<ChannelPage />} />
      <Route path="*" element={<p>このページはありません。</p>} />
    </Routes>
  );
}
