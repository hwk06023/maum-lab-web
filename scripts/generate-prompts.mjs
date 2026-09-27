import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { CASES, getCase } from '../src/cases.mjs';
import { structuredResponse, draftSchema } from '../src/provider.mjs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY를 .env.local에 설정해야 합니다. 키를 코드나 Git에 넣지 마세요.');
  process.exit(1);
}
const selection = process.argv[2];
const cases = selection ? [getCase(selection)] : CASES;
if (cases.some(c => !c)) {
  console.error(`사연 ID를 확인해 주세요: ${CASES.map(c => c.id).join(', ')}`);
  process.exit(1);
}
const meta = await readFile(new URL('../prompts/meta.md', import.meta.url), 'utf8');
const actor = await readFile(new URL('../prompts/actor.md', import.meta.url), 'utf8');
const judge = await readFile(new URL('../prompts/judge.md', import.meta.url), 'utf8');
const output = new URL('../content/generated/', import.meta.url);
await mkdir(output, { recursive: true });
for (const c of cases) {
  try {
    const draft = await structuredResponse({ apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', instructions: meta,
      input: { fictionalCase: c, commonActor: actor, commonJudge: judge },
      schema: draftSchema, name: 'prompt_draft', maxTokens: 2200
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(new URL(`${c.id}-${timestamp}.json`, output), JSON.stringify({
      status: 'draft-not-reviewed', caseId: c.id, caseVersion: '0.1.0',
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', generatedAt: new Date().toISOString(),
      ...draft
    }, null, 2) + '\n', { flag: 'wx' });
    console.log(`${c.id}: 검토용 프롬프트 초안 저장 완료. 런타임에는 적용하지 않았습니다.`);
  } catch {
    console.error(`${c.id}: 생성에 실패했습니다. 키·모델 접근 권한·호출 한도를 확인해 주세요. 응답 원문은 로그에 남기지 않았습니다.`);
    process.exitCode = 1;
    break;
  }
}
