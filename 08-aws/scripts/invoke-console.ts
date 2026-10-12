// チュートリアル 8-3 のハンズオン用。michizure-console/.local/ にコピーし、
// DynamoDB Local を起動してから実行する（AWS にはつながない）。
//   DDB_PORT=<番号> npx tsx .local/invoke-console.ts
import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

// Lambda の環境変数の代わり。AWS の SDK は AWS_ENDPOINT_URL_DYNAMODB で接続先を DynamoDB Local に向ける
const endpoint = `http://127.0.0.1:${process.env.DDB_PORT}`;
Object.assign(process.env, {
  AWS_REGION: 'ap-northeast-1',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  AWS_ENDPOINT_URL_DYNAMODB: endpoint,
  TABLE_NAME: `console${Date.now()}`,
  CURSOR_KEY: Buffer.alloc(32, 7).toString('base64url'),
  ROOT_PUBLIC_KEY: 'A'.repeat(43),
});

// DM-001 のテーブル（infra/lib/console-stack.ts と同じキーと GSI）
const gsi = (n: 1 | 2) => ({
  IndexName: `GSI${n}`,
  KeySchema: [{ AttributeName: `GSI${n}PK`, KeyType: 'HASH' as const }, { AttributeName: `GSI${n}SK`, KeyType: 'RANGE' as const }],
  Projection: { ProjectionType: 'ALL' as const },
});
await new DynamoDBClient({}).send(new CreateTableCommand({
  TableName: process.env.TABLE_NAME,
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'].map((AttributeName) => ({ AttributeName, AttributeType: 'S' as const })),
  KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
  GlobalSecondaryIndexes: [gsi(1), gsi(2)],
}));

// 環境変数を決めてから読み込む（handler.ts は読み込まれたときに AWS の部品を作るため）
const { handler } = await import('../api/src/console/handler.js');

/** API Gateway（HTTP API）が、JWT を確かめたあとに Lambda へ渡すイベントの形（必要なところだけ）。 */
function event(method: string, path: string, groups: string[], body?: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: 'ANY /api/{proxy+}',
    rawPath: path,
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    body,
    isBase64Encoded: false,
    requestContext: {
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'tutorial' },
      authorizer: { jwt: { claims: { sub: 'user-1', 'cognito:groups': `[${groups.join(' ')}]` }, scopes: [] } },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const show = async (label: string, e: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const res = await handler(e);
  if (typeof res === 'string') return console.log(label, res);
  console.log(`${label} → ${res.statusCode} ${res.headers?.['content-type']}\n   ${res.body}`);
};

await show('1. ログインしている人', event('GET', '/api/me', ['publisher']));
await show('2. 配信元が運用者の API を呼ぶ', event('GET', '/api/admin/publishers', ['publisher']));
await show('3. ない道', event('GET', '/api/nothing', ['operator']));
await show('4. JSON でない本文', event('POST', '/api/publisher', ['publisher'], '{not json'));
