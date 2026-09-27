import test from 'node:test';
import assert from 'node:assert/strict';
import { sentenceBubbles, bubbleDelay, playBubbles } from '../lib/dialogue-delivery.ts';
test('sentence bubbles preserve words, quotes, stage directions and decimals', () => {
  const text = '(종이를 가린다. 잠깐 본다.) 싫어요. 1.5개? “왜 그래?”라고 했어요.';
  assert.deepEqual(sentenceBubbles(text), ['(종이를 가린다. 잠깐 본다.) 싫어요.', '1.5개?', '“왜 그래?”라고 했어요.']);
});
test('playback reveals one at a time and exit cancels all remaining speech', () => {
  const jobs = [], seen = [];
  let completed = false;
  const stop = playBubbles([{ role:'child',text:'싫어요.' },{ role:'child',text:'이건 아직인데.' }],
    m => seen.push(m.text), () => { completed = true; },
    (run, delay) => { const job = { run, delay, cancelled:false }; jobs.push(job); return () => {job.cancelled=true;}; });
  assert.equal(seen.length, 0);
  assert.equal(jobs.length, 1);
  jobs[0].run();
  assert.deepEqual(seen, ['싫어요.']);
  assert.equal(jobs.length, 2);
  stop(); jobs[1].run();
  assert.equal(jobs[1].cancelled, true);
  assert.equal(seen.length, 1);
  assert.equal(completed, false);
});
test('playback finishes exactly once after the final bubble', () => {
  const jobs=[], seen=[];
  playBubbles([{role:'child',text:'여기요.'},{role:'child',text:'이거 알려줘요.'}],
    m=>seen.push(m.text),()=>seen.push('done'),(run)=>{jobs.push(run);return ()=>{};});
  jobs.shift()();jobs.shift()();
  assert.deepEqual(seen,['여기요.','이거 알려줘요.','done']);
});
test('delay varies with length, complexity and randomness, bounded by five seconds', () => {
  assert.ok(bubbleDelay('싫어.', false, () => 1) > bubbleDelay('싫어.', false, () => 0));
  assert.ok(bubbleDelay('이건 아직 안 끝났어요.', false, () => .5) > bubbleDelay('싫어.', false, () => .5));
  assert.equal(bubbleDelay('아'.repeat(600), true, () => 1), 5000);
});
