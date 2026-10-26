// 技術カード（第 8 部）の CDK の例をまとめたもの。yorisoi-console/.local/cdk-cards/ に置き、
// infra のフォルダで npx tsx ../.local/cdk-cards/app.ts と実行すると、合成して部品の数を表示する。

import { App, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';

const app = new App();
const stack = new Stack(app, 'CardSamples', { env: { region: 'ap-northeast-1', account: '123456789012' } });

// ---- Lambda + IAM ----
const hello = new lambda.Function(stack, 'Hello', {
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
  handler: 'index.handler',
  code: lambda.Code.fromInline("exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ hello: event.rawPath ?? 'world' }) });"),
  memorySize: 256,
  timeout: Duration.seconds(10),
  environment: { GREETING: 'こんにちは' },
});

// ---- DynamoDB ----
const table = new dynamodb.TableV2(stack, 'Walks', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billing: dynamodb.Billing.onDemand(),
  timeToLiveAttribute: 'ttl',
  removalPolicy: RemovalPolicy.DESTROY,
});
table.grantReadWriteData(hello);
hello.addEnvironment('TABLE_NAME', table.tableName);

// ---- IAM: one action, one resource, with a condition ----
hello.addToRolePolicy(new iam.PolicyStatement({
  actions: ['ses:SendEmail'],
  resources: [`arn:aws:ses:ap-northeast-1:123456789012:identity/example.com`],
  conditions: { StringEquals: { 'ses:FromAddress': 'noreply@example.com' } },
}));

// ---- IAM: on the resource side (a KMS key policy) ----
const key = new kms.Key(stack, 'SigningKey', {
  keySpec: kms.KeySpec.ECC_NIST_P256,
  keyUsage: kms.KeyUsage.SIGN_VERIFY,
  removalPolicy: RemovalPolicy.DESTROY,
});
key.addToResourcePolicy(new iam.PolicyStatement({
  actions: ['kms:Sign'],
  principals: [new iam.ArnPrincipal(hello.role!.roleArn)],
  resources: ['*'],
}));

// ---- Cognito + HTTP API with JWT ----
const pool = new cognito.UserPool(stack, 'Users', {
  selfSignUpEnabled: true,
  signInAliases: { email: true },
  mfa: cognito.Mfa.REQUIRED,
  mfaSecondFactor: { sms: false, otp: true },
  removalPolicy: RemovalPolicy.DESTROY,
});
const client = pool.addClient('Web', {
  generateSecret: false,
  oAuth: { flows: { authorizationCodeGrant: true }, callbackUrls: ['http://localhost:5173/callback'] },
});
pool.addDomain('Domain', { cognitoDomain: { domainPrefix: 'card-samples-example' } });
const api = new apigw.HttpApi(stack, 'Api');
api.addRoutes({
  path: '/hello',
  methods: [apigw.HttpMethod.GET],
  integration: new integrations.HttpLambdaIntegration('HelloIntegration', hello),
  authorizer: new authorizers.HttpJwtAuthorizer('Jwt', `https://cognito-idp.ap-northeast-1.amazonaws.com/${pool.userPoolId}`, { jwtAudience: [client.userPoolClientId] }),
});
const stage = api.defaultStage?.node.defaultChild as apigw.CfnStage;
stage.defaultRouteSettings = { throttlingRateLimit: 20, throttlingBurstLimit: 40 };

// ---- S3 + CloudFront (OAC) ----
const bucket = new s3.Bucket(stack, 'Files', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  encryption: s3.BucketEncryption.S3_MANAGED,
  lifecycleRules: [{ prefix: 'tmp/', expiration: Duration.days(7) }],
  removalPolicy: RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});
bucket.grantPut(hello, 'uploads/*');
new cloudfront.Distribution(stack, 'Cdn', {
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
  },
});

// ---- SQS + DLQ + Lambda event source ----
const dead = new sqs.Queue(stack, 'Dead', { retentionPeriod: Duration.days(14) });
const queue = new sqs.Queue(stack, 'Jobs', {
  visibilityTimeout: Duration.minutes(2),
  deadLetterQueue: { queue: dead, maxReceiveCount: 3 },
});
const worker = new lambda.Function(stack, 'Worker', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromInline("exports.handler = async (event) => { const batchItemFailures = []; for (const r of event.Records) { try { JSON.parse(r.body); } catch { batchItemFailures.push({ itemIdentifier: r.messageId }); } } return { batchItemFailures }; };"),
});
worker.addEventSource(new SqsEventSource(queue, { batchSize: 10, reportBatchItemFailures: true }));
queue.grantSendMessages(hello);

// ---- Parameter Store ----
const limit = new ssm.StringParameter(stack, 'DailyLimit', {
  parameterName: '/my-app/dev/daily-limit',
  stringValue: '30',
  description: 'Calls a day: an integer from 5 to 100',
});
limit.grantRead(hello);
hello.addEnvironment('PARAM_DAILY_LIMIT', limit.parameterName);

// ---- Bedrock: the listed model only ----
hello.addToRolePolicy(new iam.PolicyStatement({
  actions: ['bedrock:InvokeModel'],
  resources: [`arn:${stack.partition}:bedrock:ap-northeast-1::foundation-model/deepseek.v3.2`],
}));

// 合成して、大事な設定を確かめ、部品の種類と数を表示する（AWS にはつながらない）
const template = Template.fromStack(stack);
template.hasResourceProperties('AWS::Lambda::Function', { Runtime: 'nodejs22.x' });
const t = template.toJSON();
const counts: Record<string, number> = {};
for (const r of Object.values<any>(t.Resources)) counts[r.Type] = (counts[r.Type] ?? 0) + 1;
console.log(Object.keys(t.Resources).length, 'resources');
console.log(Object.entries(counts).sort().map(([k, v]) => `${v} ${k}`).join('\n'));
