// チュートリアル 8-6 のハンズオン用。yorisoi-console/.local/ にコピーして実行する。
//   node .local/presigned-post.mjs
// 署名は手元で計算するだけなので、AWS にはつながない（鍵も使い捨ての偽物）。
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const s3 = new S3Client({
  region: 'ap-northeast-1',
  credentials: { accessKeyId: 'AKIAEXAMPLEEXAMPLE00', secretAccessKey: 'example-secret-for-the-tutorial-only' },
});

// 管理システムの presignUpload と同じ形: 決まったキーに、決まった種類・大きさのファイルだけ
const post = await createPresignedPost(s3, {
  Bucket: 'intake-bucket-example',
  Key: 'intake/kamakura-history/01J0000000000000000000000B.zip',
  Conditions: [['content-length-range', 1, 2 * 1024 * 1024], ['eq', '$Content-Type', 'application/zip']],
  Fields: { 'Content-Type': 'application/zip' },
  Expires: 300,
});

console.log('送り先:', post.url);
console.log('フォームの項目:', Object.keys(post.fields));
const policy = JSON.parse(Buffer.from(post.fields.Policy, 'base64').toString('utf8'));
console.log('ポリシー（S3 が確かめる条件）:');
console.log(JSON.stringify(policy, null, 2));
