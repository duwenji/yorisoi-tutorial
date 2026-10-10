// 部品を HTML の文字列にして、端末に表示する（ブラウザなしで、JSX が何になるかを見る）。
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { App } from './app';

for (const path of ['/', '/channels/kamakura-history', '/nothing']) {
  const html = renderToString(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  console.log(`${path}\n  ${html}\n`);
}
