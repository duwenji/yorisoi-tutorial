import { generateEd25519, providerId, accountId, b64url, signEd25519, verifyEd25519, utf8 } from '@michizure-console/protocol';

const { privateKey, publicKey } = generateEd25519();
console.log('公開鍵（base64url）:', b64url.encode(publicKey), `(${publicKey.length} バイト)`);
console.log('提供元ID として :', providerId(publicKey));
console.log('アカウントID として:', accountId(publicKey));

const message = utf8.encode('鎌倉歴史散歩');
const sig = signEd25519(privateKey, message);
console.log('署名:', b64url.encode(sig), `(${sig.length} バイト)`);
console.log('確かめる:', verifyEd25519(publicKey, message, sig));
console.log('1 文字変えて確かめる:', verifyEd25519(publicKey, utf8.encode('鎌倉歴史散步'), sig));
console.log('もう一度署名すると同じ？:', b64url.encode(signEd25519(privateKey, message)) === b64url.encode(sig));
