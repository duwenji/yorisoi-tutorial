// 第 9 部 9-2: 認可コード ＋ PKCE で、ブラウザ（oidc-client-ts）が裏で作っているものを手で作る。
// どこにも送らない。Node.js 20 以上（WebCrypto が globalThis.crypto にある）。
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const s256 = async (text) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));

// 1. RFC 7636（PKCE の仕様）の付録 B の例と同じ答えになるか
const rfcVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
console.log('1. RFC 7636 の例');
console.log('   code_challenge =', await s256(rfcVerifier));
console.log('   期待する値     = E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');

// 2. ログインのたびに作るもの（ブラウザの sessionStorage に、戻ってくるまで取っておく）
const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
const challenge = await s256(verifier);
console.log('\n2. 今回のログインのための値');
console.log('   code_verifier  =', verifier, '（秘密。ブラウザの中だけ）');
console.log('   code_challenge =', challenge, '（ハッシュ。外に出してよい）');
console.log('   state          =', state);

// 3. ログインの画面へ移るときの URL（Cognito のマネージドログイン。ドメインとクライアント ID は例）
const authDomain = 'https://sanpo-example.auth.ap-northeast-1.amazoncognito.com';
const authorize = new URL('/oauth2/authorize', authDomain);
authorize.search = new URLSearchParams({
  client_id: 'exampleclientid0123456789',
  redirect_uri: 'http://localhost:5173/callback',
  response_type: 'code',
  scope: 'openid email profile',
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString();
console.log('\n3. ログインの画面へ');
console.log('  ', authorize.toString().replace(/&/g, '\n     &'));

// 4. 戻ってきたら（/callback?code=…&state=…）、state を確かめ、コードと code_verifier をトークンに引き換える
console.log('\n4. トークンの窓口へ POST する本文（クライアントの秘密はない）');
const body = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: 'exampleclientid0123456789',
  code: '（Cognito が返したコード）',
  redirect_uri: 'http://localhost:5173/callback',
  code_verifier: verifier,
});
console.log('   POST', new URL('/oauth2/token', authDomain).toString());
console.log('  ', body.toString().replace(/&/g, '\n     &'));

// 5. 横取りされたコードだけでは引き換えられない: 窓口は SHA-256(code_verifier) と code_challenge を比べる
const attacker = b64url(crypto.getRandomValues(new Uint8Array(32)));
console.log('\n5. 窓口の確かめ');
console.log('   本物の verifier →', (await s256(verifier)) === challenge ? '一致（トークンを渡す）' : '不一致');
console.log('   別の verifier   →', (await s256(attacker)) === challenge ? '一致' : '不一致（invalid_grant）');
