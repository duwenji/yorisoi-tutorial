// 第 9 部 9-3: 配信元の画面が、ブラウザの中で鍵を作り、パッケージに署名する流れを Node.js で動かす。
// 画面と同じ web/src/publisher-crypto.ts をそのまま使う（WebCrypto は Node.js にもある）。
// michizure-console/.local/ に置き、web のフォルダで npx tsx ../.local/key-in-browser.ts と実行する。
import { unzipSync, zipSync } from 'fflate';
import { b64url, createKey, openKeyFile, signPackage } from '../web/src/publisher-crypto.ts';

const passphrase = 'kamakura-history-2026';

// 1. 鍵を作る（合言葉で暗号化した鍵のファイルも一緒にできる）
let t = performance.now();
const { key, file } = await createKey(passphrase);
console.log(`1. 鍵を作った（${Math.round(performance.now() - t)} ms。ほとんどは PBKDF2 の ${file.kdf.iterations.toLocaleString()} 回）`);
console.log('   アカウントID:', key.accountId);
console.log('   鍵のファイル:', JSON.stringify({ ...file, encryptedPrivateKey: file.encryptedPrivateKey.slice(0, 24) + '…' }, null, 1).replace(/\n\s*/g, ' '));

// 2. 使うための秘密鍵は「取り出せない」鍵。exportKey は断られる
console.log('\n2. 秘密鍵を取り出そうとする');
console.log('   extractable =', key.privateKey.extractable, '／ usages =', key.privateKey.usages.join(','));
await crypto.subtle.exportKey('pkcs8', key.privateKey).then(
  () => console.log('   取り出せた（おかしい）'),
  (e: Error) => console.log('   断られた:', e.name),
);

// 3. 鍵のファイルを開く。合言葉が違えば開けない
const text = JSON.stringify(file);
console.log('\n3. 鍵のファイルを開く');
await openKeyFile(text, 'wrong passphrase!').catch((e: Error) => console.log('   違う合言葉 →', e.message));
t = performance.now();
const opened = await openKeyFile(text, passphrase);
console.log(`   正しい合言葉 → ${opened.accountId}（${Math.round(performance.now() - t)} ms）`);

// 4. パッケージに署名する（channel.json の publisher は自分のアカウントID）
const manifest = { format: 1, id: 'kamakura-history', version: 1, publisher: opened.accountId, name: '鎌倉歴史散歩' };
const unsigned = zipSync({
  'channel.json': new TextEncoder().encode(JSON.stringify(manifest)),
  'prompts/guide/focus.md': new TextEncoder().encode('- 由来と、関わった人物を中心に話す\n'),
});
const signed = await signPackage(unsigned, opened, { channel: 'kamakura-history' });
const files = unzipSync(signed.zip);
const signature = JSON.parse(new TextDecoder().decode(files['signature.json']));
const payload = JSON.parse(new TextDecoder().decode(b64url.decode(signature.payload)));
console.log('\n4. 署名したパッケージ');
console.log('   中のファイル:', Object.keys(files).sort().join(', '));
console.log('   署名した中身:', JSON.stringify(payload));

// 5. 受け取る側は、signature.json の公開鍵だけで確かめられる
const pub = await crypto.subtle.importKey('raw', b64url.decode(signature.publisherKey), { name: 'Ed25519' }, false, ['verify']);
const ok = await crypto.subtle.verify({ name: 'Ed25519' }, pub, b64url.decode(signature.sig), b64url.decode(signature.payload));
console.log('\n5. 公開鍵で確かめる →', ok ? '正しい署名' : 'だめ');

// 6. 別の人のアカウントID を publisher に書いたパッケージには、署名しない
const other = zipSync({ 'channel.json': new TextEncoder().encode(JSON.stringify({ ...manifest, publisher: 'sg1' + 'a'.repeat(32) })) });
await signPackage(other, opened, { channel: 'kamakura-history' }).catch((e: Error) => console.log('\n6. 他人の publisher →', e.message));
