// チュートリアル 7-1 のハンズオン用。sanpo-channel-console/.local/ にコピーして使う。
//   実行:       npx tsx .local/ts-practice.ts
//   型の確認:   npx tsc --ignoreConfig --noEmit --strict --target es2023 --module nodenext --types node .local/ts-practice.ts

// 1. 型の別名と、取りうる値を絞った型（ユニオン）
type Role = 'operator' | 'publisher';

interface Caller {
  sub: string;
  roles: Role[];
  displayName?: string; // あってもなくてもよい項目
}

// 2. 判別できるユニオン（Kotlin の sealed に当たる）
type Check =
  | { ok: true; channelId: string }
  | { ok: false; code: 'bad_value' | 'forbidden_text'; detail: string };

function describe(check: Check): string {
  // check.ok を確かめると、その枝の中では型が絞られる
  if (check.ok) return `合格: ${check.channelId}`;
  return `不合格（${check.code}）: ${check.detail}`;
}

// 3. 中身の分からない値（unknown）を、確かめてから使う
function nameOf(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'name' in body && typeof body.name === 'string') {
    return body.name;
  }
  throw new Error('name がありません');
}

// 4. async / await（Kotlin の suspend に当たる）
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main() {
  const op: Caller = { sub: 'op-1', roles: ['operator'] };
  console.log(op.displayName ?? '（名前なし）');           // ?? は Kotlin の ?:
  console.log(op.roles.includes('operator'));

  console.log(describe({ ok: true, channelId: 'kamakura-history' }));
  console.log(describe({ ok: false, code: 'forbidden_text', detail: 'URL がある' }));

  console.log(nameOf(JSON.parse('{"name":"鎌倉歴史散歩"}')));

  const started = Date.now();
  await Promise.all([wait(200), wait(200)]);             // 同時に待つ（Kotlin の async/await）
  console.log(`待った時間: ${Date.now() - started}ms`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
