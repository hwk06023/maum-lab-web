import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResultExport } from '../lib/result-export.mjs';
test('download contains the complete ordered conversation and reflection but no credentials',()=>{
 const messages=[{id:'m1',role:'child',text:'(종이를 가린다.) 안 해요.'},{id:'m2',role:'user',text:'어디가 싫은지 알려줄래?'},{id:'m3',role:'child',text:'여기 틀린 거요.'},{id:'m4',role:'guide',text:'마음을 확인했어요.'}];
 const session={mode:'live',case:{id:'minjun'},messages,notes:[{text:'여기 틀린 거요.'}],milestones:{understanding:true},result:{reflection:{question:'어떤 도움을 약속했나요?'}},sessionId:'do-not-export-session',recoveryToken:'do-not-export-token'};
 const downloaded=JSON.parse(JSON.stringify(buildResultExport(session,'2026-09-28T00:00:00Z')));
 assert.deepEqual(downloaded.messages.map(({order,...message})=>message),messages);
 assert.deepEqual(downloaded.messages.map(m=>m.order),[1,2,3,4]);
 assert.deepEqual(downloaded.result,session.result);
 assert.equal(JSON.stringify(downloaded).includes('do-not-export'),false);
 assert.equal(downloaded.messages[0].text,messages[0].text);
});


test('failed game export preserves grade outcome, turns and entire transcript',()=>{
 const session={mode:'live',case:{id:'minjun'},turns:60,game:{outcome:'failed',grade:null,maxTurns:60},result:{title:'교화 실패'},messages:[{id:'m1',role:'child',text:'아직 싫어요.'}],relationshipState:{trust:20}};
 const output=buildResultExport(session);assert.equal(output.turns,60);assert.deepEqual(output.game,session.game);assert.equal(output.messages.length,1);assert.equal(output.relationshipState,undefined);
});
