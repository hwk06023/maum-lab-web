import { publicCase } from './cases.mjs';
import { inspectInput } from './guardrails.mjs';

export const STAGES = ['listen', 'plan', 'rehearse', 'transfer', 'complete'];
const test = (pattern, text) => new RegExp(pattern, 'i').test(text);
function add(state, role, text) {
  const message = { id: `m${state.messages.length + 1}`, role, text };
  state.messages.push(message);
  return message;
}
export function createState(c, mode = 'demo') {
  return { caseId: c.id, mode, version: 0, stage: 'listen', revealed: [], evidence: [], plan: null,
    supportConfirmed: false, practicePassed: false, transferPassed: false, turns: 0,
    safetyHold: false, feedback: '행동을 평가하기 전에, 어떤 순간이 어려운지 들어보세요.',
    messages: [{ id: 'm1', role: 'child', text: c.opening }] };
}
export function demoJudge(c, state, userText) {
  // A deliberately transparent deterministic fixture, not a semantic or clinical judge.
  const asks = /[?？]|어때|어땠|어떤|어떻게|언제|누구|무슨|말해줄|알려줄|있니|있어|했어|해볼까|생각/.test(userText);
  const clue = state.stage === 'listen' && asks
    ? c.clues.find(f => !state.revealed.includes(f.id) && test(f.match, userText)) : null;
  const invite = /어때|괜찮|해볼까|해볼래|네 생각|너의 생각|같이.*정|함께.*정/.test(userText);
  const child = test(c.childMatch, userText);
  const adult = test(c.adultMatch, userText);
  return { revealClueId: clue?.id ?? 'none', childQuote: child ? userText : '',
    adultQuote: adult ? userText : '', invitationQuote: invite ? userText : '',
    supportsPractice: child && adult && userText.length >= 16,
    unsafe: false, feedback: '' };
}
function defaultLine(event, c) {
  switch (event) {
    case 'planAccepted': return c.planYes;
    case 'planIncomplete': return '내가 뭘 해볼 수 있는지, 어른은 어떻게 도와줄지도 같이 정하면 좋겠어요. 내 생각도 물어봐 주세요.';
    case 'practicePassed': return c.successLine;
    case 'practiceIncomplete': return '아까 정한 방법을 지금 어떻게 써보면 될까요? 어떤 도움을 받을 수 있는지도 알려주세요.';
    default: return '조금 더 구체적으로 물어봐 주면 이야기해볼게요. 내가 어떤 때 어려운지부터요.';
  }
}

/** Stateless pure transition: caller only commits returned state after ALL work succeeds.
 * LLM judges meaning; this function owns milestones and gates.
 */
export async function transition(c, current, action, provider = null) {
  const state = structuredClone(current);
  if (state.stage === 'complete') return state;
  if (state.turns >= 40) throw Object.assign(new Error('한 회차의 대화 한도에 도달했습니다. 기록을 확인한 뒤 새 연습을 시작해 주세요.'), { status: 409 });
  if (action.kind === 'resume') {
    if (!state.safetyHold) return state;
    state.safetyHold = false;
    state.feedback = '가상 상황의 연습으로 돌아왔습니다. 실제 위험은 이 게임에서 다루지 않습니다.';
    add(state, 'guide', state.feedback);
    state.version++;
    return state;
  }
  if (state.safetyHold) throw Object.assign(new Error('안전 안내를 확인하고 연습을 다시 시작해 주세요.'), { status: 409 });
  if (action.kind === 'support') {
    if (state.stage !== 'plan' || !state.plan?.agreed) throw Object.assign(new Error('아이와 실행할 방법을 먼저 함께 정해 주세요.'), { status: 409 });
    state.supportConfirmed = true;
    state.stage = 'rehearse';
    add(state, 'guide', c.support);
    add(state, 'scene', c.rehearsal);
    state.feedback = '지원 약속이 시나리오 안에서 확인되었습니다. 이제 실제 장면에 적용해 보세요.';
    state.version++;
    return state;
  }
  if (action.kind !== 'say' || typeof action.text !== 'string' || !action.text.trim() || action.text.length > 1000)
    throw Object.assign(new Error('대화는 1~1,000자로 입력해 주세요.'), { status: 400 });
  const text = action.text.trim();
  const guard = inspectInput(text);
  if (guard) {
    // Rejected sensitive input is NOT retained in transcript or sent to an AI provider.
    add(state, 'guide', guard.message);
    state.feedback = guard.message;
    if (guard.type === 'safety') state.safetyHold = true;
    state.turns++;
    state.version++;
    return state;
  }
  const userMessage = add(state, 'user', text);
  state.turns++;
  const judgment = provider ? await provider.judge(c, state, text) : demoJudge(c, state, text);
  if (judgment.unsafe) {
    state.messages.pop();
    add(state, 'guide', '위협이나 강요 대신, 아이의 어려움을 확인하는 표현으로 수정해 주세요.');
    state.feedback = '이 표현은 진행 조건으로 인정하지 않았습니다.';
    state.version++;
    return state;
  }
  let event = 'explore';
  let requiredLine = '';
  let nextClue = null;
  if (state.stage === 'listen') {
    nextClue = c.clues.find(f => f.id === judgment.revealClueId && !state.revealed.includes(f.id));
    if (nextClue) { event = 'clue'; requiredLine = nextClue.line; }
    else state.feedback = '구체적인 순간, 전후 상황, 아이가 원하는 도움을 물어보세요.';
  } else if (state.stage === 'plan') {
    const all = judgment.childQuote && judgment.adultQuote && judgment.invitationQuote;
    event = all ? 'planAccepted' : 'planIncomplete';
    requiredLine = defaultLine(event, c);
    state.feedback = all ? '아이의 의견을 확인했습니다. 주변 어른의 지원 약속도 확인해 주세요.'
      : '아이의 행동 + 어른의 구체적 지원 + 아이의 의견을 묻는 제안이 필요합니다.';
  } else if (state.stage === 'rehearse' || state.stage === 'transfer') {
    event = judgment.supportsPractice ? 'practicePassed' : 'practiceIncomplete';
    requiredLine = defaultLine(event, c);
    state.feedback = judgment.supportsPractice ? '합의한 방법이 이 가상 장면에서 적용되었습니다.'
      : '지금 장면에서 사용할 행동과 이어질 지원을 구체적으로 말해 주세요.';
  }
  // Actor only gets already disclosed information plus the one permitted new line.
  const actor = provider ? await provider.actor(c, state, text, event, requiredLine)
    : { reply: requiredLine || defaultLine(event, c), agreed: event === 'planAccepted' };
  const childMessage = add(state, 'child', actor.reply);
  if (nextClue) {
    state.revealed.push(nextClue.id);
    state.evidence.push({ clueId: nextClue.id, userTurnId: userMessage.id, childTurnId: childMessage.id });
    state.feedback = '단서를 확인했습니다. 노트에서 실제 대화 근거를 볼 수 있어요.';
    if (state.revealed.length === c.clues.length) {
      state.stage = 'plan';
      add(state, 'guide', '세 가지 단서를 연결했습니다. 이제 아이의 행동과 어른의 지원을 함께 제안하고, 아이의 의견을 물어보세요.');
    }
  }
  if (event === 'planAccepted' && actor.agreed) {
    state.plan = { text, agreed: true, userTurnId: userMessage.id, childTurnId: childMessage.id,
      childQuote: judgment.childQuote, adultQuote: judgment.adultQuote, invitationQuote: judgment.invitationQuote };
  } else if (event === 'planAccepted') {
    state.plan = null;
    state.feedback = '아이가 수정을 제안했습니다. 의견을 반영해 다시 정해 주세요.';
  }
  if (event === 'practicePassed') {
    if (state.stage === 'rehearse') {
      state.practicePassed = true;
      state.stage = 'transfer';
      add(state, 'scene', c.transfer);
    } else if (state.stage === 'transfer' && state.practicePassed && state.supportConfirmed && state.plan?.agreed) {
      state.transferPassed = true;
      state.stage = 'complete';
      add(state, 'guide', '작은 변화가 시작되었습니다. 가상 시나리오의 연습 목표를 달성했습니다.');
    }
  }
  state.version++;
  return state;
}
export function viewState(c, state) {
  const next = c.clues.filter(f => !state.revealed.includes(f.id));
  const suggestions = state.stage === 'listen' ? next.map(f => f.question)
    : state.stage === 'plan' ? [c.samplePlan]
    : ['rehearse', 'transfer'].includes(state.stage) ? [c.practiceHint] : [];
  return {
    case: publicCase(c), mode: state.mode, version: state.version, stage: state.stage,
    turns: state.turns, feedback: state.feedback, safetyHold: state.safetyHold,
    messages: state.messages,
    notes: c.clues.filter(f => state.revealed.includes(f.id)).map(f => ({ id: f.id, label: f.label,
      text: f.text, evidence: state.evidence.find(e => e.clueId === f.id) })),
    suggestions, plan: state.plan ? { text: state.plan.text, agreed: state.plan.agreed, userTurnId: state.plan.userTurnId } : null,
    supportConfirmed: state.supportConfirmed,
    milestones: { understanding: state.revealed.length === 3, agreement: !!state.plan?.agreed,
      support: state.supportConfirmed, practice: state.practicePassed, transfer: state.transferPassed },
    result: state.stage === 'complete' ? { title: '작은 변화가 시작되었습니다', change: c.change,
      support: c.support, disclaimer: '이 결과는 고정된 가상 시나리오의 게임 목표 달성입니다. 실제 아동의 치료 효과나 사용자의 상담 자격을 평가하지 않습니다.' } : null
  };
}
