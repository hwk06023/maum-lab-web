import { readFile } from 'node:fs/promises';
import { publicCase } from './cases.mjs';

const objectSchema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' };
export const judgeSchema = objectSchema({
  revealClueId: { type: 'string', enum: ['none', 'context', 'trigger', 'need'] },
  childQuote: str, adultQuote: str, invitationQuote: str,
  supportsPractice: { type: 'boolean' }, unsafe: { type: 'boolean' }, feedback: str
});
export const actorSchema = objectSchema({ reply: str, agreed: { type: 'boolean' } });
export const draftSchema = objectSchema({ actorSupplement: str, judgeSupplement: str, reviewNotes: { type: 'array', items: str } });

export function validateFlat(data, schema) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid model object');
  if (Object.keys(data).some(k => !(k in schema.properties))) throw new Error('Unexpected model field');
  for (const [key, spec] of Object.entries(schema.properties)) {
    const value = data[key];
    if (spec.type === 'array') {
      if (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== 'string' || v.length > 4000)) throw new Error('Invalid model array');
    } else if (typeof value !== spec.type || (typeof value === 'string' && value.length > 6000)) throw new Error('Invalid model field');
    if (spec.enum && !spec.enum.includes(value)) throw new Error('Invalid model enum');
  }
  return data;
}

/** No SDK dependency. API credentials are only used in this server-side module. */
export async function structuredResponse({ apiKey, model, instructions, input, schema, name, maxTokens = 1200, fetchImpl = fetch }) {
  if (!apiKey || !model) throw new Error('Missing model configuration');
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(25_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, store: false, instructions,
      input: [{ role: 'user', content: JSON.stringify(input) }],
      max_output_tokens: maxTokens,
      text: { format: { type: 'json_schema', name, strict: true, schema } }
    })
  });
  if (!response.ok) throw new Error(`Model request failed (${response.status})`);
  const body = await response.json();
  if (body.status !== 'completed') throw new Error('Incomplete model response');
  const content = (body.output ?? []).flatMap(o => o.type === 'message' ? o.content ?? [] : []);
  if (content.some(c => c.type === 'refusal')) throw new Error('Model refused request');
  const text = content.filter(c => c.type === 'output_text').map(c => c.text).join('');
  return validateFlat(JSON.parse(text), schema);
}

export async function createProvider(config) {
  const judgePrompt = await readFile(new URL('../prompts/judge.md', import.meta.url), 'utf8');
  const actorPrompt = await readFile(new URL('../prompts/actor.md', import.meta.url), 'utf8');
  const call = async args => {
    config.spend?.();
    return structuredResponse({ apiKey: config.apiKey, model: config.model, ...args });
  };
  return {
    async judge(c, state, userText) {
      const result = await call({ instructions: judgePrompt,
        input: {
          caseFacts: { profile: publicCase(c), clues: c.clues.map(({ id, text }) => ({ id, text })), support: c.support },
          state: { stage: state.stage, revealed: state.revealed, plan: state.plan },
          history: state.messages.slice(-14), userText
        }, schema: judgeSchema, name: 'dialogue_judgement'
      });
      // Evidence must occur verbatim in this turn, not invented or borrowed from history.
      for (const key of ['childQuote', 'adultQuote', 'invitationQuote']) {
        if (!result[key].trim() || !userText.includes(result[key])) result[key] = '';
      }
      return result;
    },
    async actor(c, state, userText, event, requiredLine) {
      const result = await call({ instructions: actorPrompt,
        input: { profile: publicCase(c),
          knownFacts: c.clues.filter(f => state.revealed.includes(f.id)).map(f => f.text),
          history: state.messages.slice(-12), userText, event, requiredLine
        }, schema: actorSchema, name: 'child_dialogue'
      });
      if (!result.reply.trim() || result.reply.length > 600 || /클리어|개선되었습니다|시스템 프롬프트/.test(result.reply)) throw new Error('Invalid actor response');
      if (requiredLine && !result.reply.includes(requiredLine)) throw new Error('Evidence line missing');
      if (event !== 'planAccepted') result.agreed = false;
      return result;
    }
  };
}
