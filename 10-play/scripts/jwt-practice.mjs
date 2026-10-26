// チュートリアル 10-4 のハンズオン用。サービス アカウントとして名乗る JWT を、捨てる鍵で作って確かめる。
// Google にはつながらない。node 10-play/scripts/jwt-practice.mjs で動かす。

import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';

// 本物のサービス アカウントの鍵（JSON）の代わりに、その場で RSA の鍵を作る
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = {
  client_email: 'play-publisher@example-project.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token',
};

// tools/play.mjs の accessToken() と同じ形
const base64url = (s) => Buffer.from(s).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/androidpublisher',
  aud: key.token_uri,
  iat: now,
  exp: now + 3600,
};
const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`;
const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
const jwt = `${unsigned}.${signature}`;

console.log('JWT（. で 3 つに分かれる）:');
console.log(jwt.split('.').map((part) => `  ${part.slice(0, 40)}…（${part.length} 文字）`).join('\n'));

// Google の認証サーバーがすること: 公開鍵で署名を確かめ、中身を読む
function check(token) {
  const [header, payload, sig] = token.split('.');
  const ok = createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, sig, 'base64url');
  return { ok, payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) };
}

const good = check(jwt);
console.log('\nそのまま:', good.ok ? '署名は正しい' : '署名が合わない');
console.log('  名乗る相手:', good.payload.iss);
console.log('  頼む範囲:', good.payload.scope);
console.log('  期限まで:', good.payload.exp - good.payload.iat, '秒');

// 期限を書き換えて、長く使えるトークンにしようとすると…
const [h, , s] = jwt.split('.');
const forged = `${h}.${base64url(JSON.stringify({ ...claims, exp: now + 365 * 24 * 3600 }))}.${s}`;
const bad = check(forged);
console.log('\n期限を書き換えた:', bad.ok ? '署名は正しい' : '署名が合わない（断られる）');
