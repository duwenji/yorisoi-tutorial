// 技術カード: WebCrypto の最小の例。Node.js 20 以上で node webcrypto-card.mjs と実行する（ブラウザの開発者ツールのコンソールでも、同じコードが動く）。
const subtle = globalThis.crypto.subtle;
const text = new TextEncoder().encode('こんにちは');

// ハッシュ
const hash = new Uint8Array(await subtle.digest('SHA-256', text));
console.log('SHA-256:', Array.from(hash.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('') + '…');

// Ed25519 の署名
const pair = await subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
const sig = await subtle.sign({ name: 'Ed25519' }, pair.privateKey, text);
console.log('署名の長さ:', sig.byteLength, '／ 確かめ:', await subtle.verify({ name: 'Ed25519' }, pair.publicKey, sig, text));

// AES-GCM の暗号化
const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const iv = crypto.getRandomValues(new Uint8Array(12));
const enc = await subtle.encrypt({ name: 'AES-GCM', iv }, key, text);
console.log('暗号文の長さ:', enc.byteLength, '（本文 15 ＋ 認証タグ 16）');
console.log('戻す:', new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv }, key, enc)));
const broken = new Uint8Array(enc); broken[0] ^= 1;
await subtle.decrypt({ name: 'AES-GCM', iv }, key, broken).catch((e) => console.log('1 ビット変えると:', e.name));

// 取り出せない鍵
await subtle.exportKey('raw', key).catch((e) => console.log('取り出せない鍵の exportKey:', e.name));
