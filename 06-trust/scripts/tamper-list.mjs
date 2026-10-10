// 6-7 ハンズオン: 手元で公開したリストの本体を書き換える（署名はそのまま）。
// sanpo-channel-console のフォルダで実行する:
//   node ../sanpo-tutorial/06-trust/scripts/tamper-list.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const path = '.local/site/public/v1/channels.json';
const doc = JSON.parse(readFileSync(path, 'utf8'));

// 本体（payload）をデコードして、最初のチャンネルの名前を変える
const body = JSON.parse(Buffer.from(doc.payload, 'base64url').toString('utf8'));
console.log('変える前:', body.channels[0].name);
body.channels[0].name = '改ざんした名前';
console.log('変えた後:', body.channels[0].name);

// 本体を包み直す。要約（digest）とその署名には手を付けない
doc.payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
writeFileSync(path, JSON.stringify(doc));
console.log(`${path} を書き換えました。元に戻すには npm run publish:local -w api をやり直してください`);
