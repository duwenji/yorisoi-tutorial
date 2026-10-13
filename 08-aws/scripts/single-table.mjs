// チュートリアル 8-5 のハンズオン用。yorisoi-console/.local/ にコピーし、
// DynamoDB Local を起動してから、DDB_ENDPOINT を付けて実行する。
//   DDB_ENDPOINT=http://127.0.0.1:<番号> node .local/single-table.mjs
import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const raw = new DynamoDBClient({
  endpoint: process.env.DDB_ENDPOINT,
  region: 'ap-northeast-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const db = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });
const TableName = `practice${Date.now()}`;

// 1. テーブル: キーは PK と SK だけ。GSI2 は「載せるときだけ」キーを持つ疎なインデックス
await raw.send(new CreateTableCommand({
  TableName,
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: ['PK', 'SK', 'GSI2PK', 'GSI2SK'].map((AttributeName) => ({ AttributeName, AttributeType: 'S' })),
  KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
  GlobalSecondaryIndexes: [{
    IndexName: 'GSI2',
    KeySchema: [{ AttributeName: 'GSI2PK', KeyType: 'HASH' }, { AttributeName: 'GSI2SK', KeyType: 'RANGE' }],
    Projection: { ProjectionType: 'ALL' },
  }],
}));
console.log('1. テーブルを作りました:', TableName);

// 2. 種類の違う項目を、同じテーブルに入れる（DM-001 のキーの付け方）
const put = (Item) => db.send(new PutCommand({ TableName, Item }));
await put({ PK: 'CH#kamakura-history', SK: 'CH', type: 'channel', name: '鎌倉歴史散歩', rev: 1, GSI2PK: 'LISTED', GSI2SK: 'CH#kamakura-history' });
await put({ PK: 'CH#tokyo-nature', SK: 'CH', type: 'channel', name: '東京の自然', rev: 1 });   // まだリストに載せない
await put({ PK: 'CH#kamakura-history', SK: 'SUB#01J0000000000000000000000A', type: 'submission', version: 1, state: 'approved' });
await put({ PK: 'CH#kamakura-history', SK: 'SUB#01J0000000000000000000000B', type: 'submission', version: 2, state: 'awaiting_review' });
console.log('2. チャンネル 2 つと、申請 2 つを入れました');

// 3. 1 つのチャンネルの申請を、新しい順に（PK が同じで、SK が SUB# で始まるもの）
const subs = await db.send(new QueryCommand({
  TableName,
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sub)',
  ExpressionAttributeValues: { ':pk': 'CH#kamakura-history', ':sub': 'SUB#' },
  ScanIndexForward: false,
}));
console.log('3. 申請（新しい順）:', subs.Items.map((i) => `v${i.version} ${i.state}`));

// 4. リストに載せるチャンネルだけ（GSI2 に LISTED を持つ項目だけが、インデックスに入る）
const listed = await db.send(new QueryCommand({
  TableName, IndexName: 'GSI2',
  KeyConditionExpression: 'GSI2PK = :p', ExpressionAttributeValues: { ':p': 'LISTED' },
}));
console.log('4. リストに載せるチャンネル:', listed.Items.map((i) => i.name));

// 5. 条件つき書き込み: rev が 1 のときだけ書き、rev を 2 にする（楽観的ロック）
const bump = (expected) => db.send(new UpdateCommand({
  TableName, Key: { PK: 'CH#kamakura-history', SK: 'CH' },
  UpdateExpression: 'SET #rev = #rev + :one, #name = :name',
  ConditionExpression: '#rev = :expected',
  ExpressionAttributeNames: { '#rev': 'rev', '#name': 'name' },
  ExpressionAttributeValues: { ':one': 1, ':expected': expected, ':name': '鎌倉歴史散歩（改）' },
}));
await bump(1);
console.log('5. rev 1 のつもりで書く → 成功（rev は 2 に）');
try {
  await bump(1);
} catch (e) {
  console.log('   もう一度 rev 1 のつもりで書く → 失敗:', e.name);
}

// 6. トランザクション: チャンネルの取り下げと、操作の記録を、両方書くか両方書かないか
const revoke = (expectedRev) => db.send(new TransactWriteCommand({
  TransactItems: [
    { Update: {
      TableName, Key: { PK: 'CH#kamakura-history', SK: 'CH' },
      UpdateExpression: 'SET #status = :revoked, #rev = #rev + :one REMOVE GSI2PK, GSI2SK',
      ConditionExpression: '#rev = :expected',
      ExpressionAttributeNames: { '#status': 'status', '#rev': 'rev' },
      ExpressionAttributeValues: { ':revoked': 'revoked', ':one': 1, ':expected': expectedRev },
    } },
    { Put: { TableName, Item: { PK: 'AUDIT#2026-10', SK: `${new Date().toISOString()}#${expectedRev}`, action: 'channel.revoke', target: 'CH#kamakura-history' } } },
  ],
}));
try {
  await revoke(1);   // rev はもう 2 なので、1 つ目の条件が外れる
} catch (e) {
  console.log('6. 古い rev で取り下げ → 失敗:', e.name);
}
const audits1 = await db.send(new QueryCommand({ TableName, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': 'AUDIT#2026-10' } }));
console.log('   操作の記録の数:', audits1.Items.length, '（記録も書かれていない）');
await revoke(2);
const audits2 = await db.send(new QueryCommand({ TableName, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': 'AUDIT#2026-10' } }));
const listedAfter = await db.send(new QueryCommand({ TableName, IndexName: 'GSI2', KeyConditionExpression: 'GSI2PK = :p', ExpressionAttributeValues: { ':p': 'LISTED' } }));
console.log('   正しい rev で取り下げ → 成功。操作の記録の数:', audits2.Items.length, '／ リストに載せるチャンネル:', listedAfter.Items.map((i) => i.name));
