import test from 'node:test';
import assert from 'node:assert/strict';
import { structuredResponse, actorSchema, validateFlat } from '../src/provider.mjs';
const base = { apiKey: 'fake-test-key', model: 'fake-model', instructions: 'test', input: {}, schema: actorSchema, name: 'actor' };
function mock(body, assertRequest = () => {}) {
  return async (url, options) => { assertRequest(url, options); return { ok: true, json: async () => body }; };
}
test('structured provider sends store=false and a strict schema', async () => {
  const value = await structuredResponse({ ...base,
    fetchImpl: mock({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"reply":"안녕","agreed":false}' }] }] }, (url, opts) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(opts.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(opts.headers.Authorization, 'Bearer fake-test-key');
    })
  });
  assert.equal(value.reply, '안녕');
});
test('schema validation rejects missing, extra, and mistyped fields', () => {
  assert.throws(() => validateFlat({ reply: 'x' }, actorSchema));
  assert.throws(() => validateFlat({ reply: 'x', agreed: 'yes' }, actorSchema));
  assert.throws(() => validateFlat({ reply: 'x', agreed: false, clear: true }, actorSchema));
});
test('refusal is not treated as a character response', async () => {
  await assert.rejects(structuredResponse({ ...base, fetchImpl: mock({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }) }), /refused/);
});
test('incomplete output is rejected', async () => {
  await assert.rejects(structuredResponse({ ...base, fetchImpl: mock({ status: 'incomplete', output: [] }) }), /Incomplete/);
});
test('HTTP provider errors do not expose response bodies', async () => {
  await assert.rejects(structuredResponse({ ...base, fetchImpl: async () => ({ ok: false, status: 401 }) }), /401/);
});
