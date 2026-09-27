const app = document.querySelector('#app');
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chat: '<path d="M20 11a8 8 0 0 1-8 8H5l-4 3 2-7a8 8 0 1 1 17-4Z"/><path d="M7 9h8m-8 4h5"/>',
  leaf: '<path d="M20 3C9 2 3 7 5 14s15 5 15-11Z"/><path d="M3 22 15 9"/>',
  note: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  shield: '<path d="m12 2 8 4v6c0 6-8 10-8 10S4 18 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
  pencil: '<path d="m5 15-1 6 6-1L21 9l-5-5Z"/><path d="m13 7 5 5M5 15l5 5M3 4h5m-3-2v4"/>',
  blocks: '<rect x="3" y="12" width="8" height="8" rx="1"/><rect x="13" y="12" width="8" height="8" rx="1"/><path d="m7 10 5-8 5 8Z"/>',
  bridge: '<path d="M2 20h20M4 20V8h4v12M16 20V8h4v12M6 8V4m12 4V4M8 12c2 4 6 4 8 0"/>',
  kite: '<path d="m12 2 7 8-7 7-7-7Z"/><path d="M12 2v15M5 10h14m-7 7c6 7-4 2 1 6"/>',
  orbit: '<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-30 12 12)"/><path d="M17 2h4m-2-2v4"/>',
  controller: '<path d="M7 6h10c4 0 7 13 3 13-2 0-3-4-5-4H9c-2 0-3 4-5 4C0 19 3 6 7 6Z"/><path d="M6 10v4m-2-2h4m8-2h.1m2 3h.1"/>',
  send: '<path d="m3 3 19 9L3 21l4-9Z"/><path d="M7 12h15"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.chat}</svg>`;
let catalog = [];
let mode = 'demo';
let aiLabel = 'AI 파일럿';
let aiProviderLabel = '외부 AI 공급자 API';
let filter = 0;
let session = null;
let busy = false;
let pendingMessage = null;
let hintsOpen = false;
let toastTimer;

function toast(text) {
  const el = document.querySelector('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 7000);
}
async function api(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(path, {
    method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  if (!response.ok) throw Object.assign(new Error(data.error || '요청을 완료하지 못했습니다.'), { status: response.status });
  return data;
}
function header(inGame = false) {
  return `<header class="site-header"><div class="header-inner">
    <button class="brand" data-action="home" aria-label="마음연습실 홈"><span class="brand-mark">m<span>•</span></span><span>마음연습실<small>MAUM LAB</small></span></button>
    <nav aria-label="주 메뉴">${inGame ? `<button class="nav-link" data-action="home">${icon('back')} 연습실로</button>` : '<a class="nav-link active" href="#stories">연습실 둘러보기</a>'}<button class="nav-link" data-action="guide">진행 방법</button></nav>
    <span class="mode-badge"><span></span>${mode === 'demo' ? '규칙 기반 데모' : escapeHtml(aiLabel)}</span>
  </div></header>`;
}
function footer() {
  return `<footer class="site-footer"><div><strong>마음연습실</strong><span>이해에서 시작되는 작은 변화.</span></div><p>성인 교육·연습용 프로토타입 · 모든 사연은 창작입니다.<br>공식 기관 인증이나 실제 상담·치료 효과를 표시하지 않습니다.</p><button data-action="privacy">데이터 안내</button></footer>`;
}
function renderHome() {
  const cases = catalog.filter(c => !filter || c.level === filter);
  app.innerHTML = `${header()}<main id="main">
    <section class="hero page-width" aria-labelledby="hero-title"><div class="hero-copy">
      <p class="eyebrow"><span class="eyebrow-line"></span>아이의 세계를 이해하는 대화 연습</p>
      <h1 id="hero-title">아이를 바꾸기 전에,<br><em>이야기를 들어볼까요?</em></h1>
      <p class="hero-description">같은 행동에도 서로 다른 마음이 있어요.<br>여섯 아이의 이야기를 듣고, 작은 변화를 함께 연습해 보세요.</p>
      <a class="button primary" href="#stories">첫 번째 이야기 만나기 ${icon('arrow')}</a>
      <p class="hero-footnote">${icon('shield')} 가상의 아이와 연습하는 안전한 시작</p>
    </div><div class="hero-art" aria-hidden="true">
      <div class="art-ring"></div><span class="art-dot dot-one"></span><span class="art-dot dot-two"></span>
      <div class="floating-label top-label">${icon('chat')} 어떤 순간이 어려웠어?</div>
      <div class="story-paper"><span class="paper-kicker">오늘의 마음 노트</span><div class="paper-lines"><span></span><span></span></div><div class="paper-sprout">${icon('leaf')}</div><p>듣고, 이해하고,<br><strong>함께 자라기.</strong></p><span class="paper-number">01 — 06</span></div>
      <div class="floating-label bottom-label">${icon('spark')} 작은 변화가 시작되는 곳</div>
    </div></section>
    <section class="journey page-width" aria-label="연습 과정"><div><span>01</span><div><strong>이야기 듣기</strong><p>질문 속에서 상황의 단서를 찾아요.</p></div></div><i></i><div><span>02</span><div><strong>방법 함께 찾기</strong><p>아이와 어른이 할 일을 함께 정해요.</p></div></div><i></i><div><span>03</span><div><strong>작은 변화 연습하기</strong><p>다른 상황에서도 방법을 써봐요.</p></div></div></section>
    <section id="stories" class="stories page-width" aria-labelledby="stories-title"><div class="section-heading"><div><p class="eyebrow">SIX STORIES, SMALL STEPS</p><h2 id="stories-title">오늘은 누구의 이야기를 들어볼까요?</h2><p>단계가 올라갈수록 대화 거부와 감정 반응이 강한 상황을 연습해요.</p></div><span class="story-count">${cases.length}<small>개의 이야기</small></span></div>
      <div class="filter-row"><div class="filters" role="group" aria-label="난이도 선택">${[[0, '전체 이야기'], [1, 'Lv.1 마음 알아보기'], [2, 'Lv.2 관계 이해하기'], [3, 'Lv.3 함께 바꾸기']].map(([id, text]) => `<button class="filter ${filter === id ? 'selected' : ''}" data-filter="${id}" aria-pressed="${filter === id}">${text}</button>`).join('')}</div><span class="filter-note">각 단계 남아 1명 · 여아 1명</span></div>
      <div class="card-grid">${cases.map(c => `<article class="story-card ${c.color}"><div class="card-visual"><span class="level-badge">LEVEL ${String(c.level).padStart(2, '0')}</span><span class="visual-orbit"></span>${icon(c.motif, 'motif')}<span class="visual-dot"></span><span class="card-index">${String(catalog.indexOf(c) + 1).padStart(2, '0')}</span></div><div class="card-body"><div class="persona-line"><span class="persona-dot"></span><strong>${escapeHtml(c.name)}</strong><span>만 ${c.age}세 · ${c.gender}</span></div><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.subtitle)}</p><span class="skill-tag">${icon('leaf')}${escapeHtml(c.skill)}</span><button class="card-start" data-case="${c.id}" aria-label="${c.name}의 이야기 만나기">이야기 만나기 ${icon('arrow')}</button></div></article>`).join('')}</div>
      <div class="principle-note">${icon('note')}<p><strong>정답을 말하는 것보다, 함께 방법을 찾는 연습.</strong><br>진단명을 맞히거나 아이를 복종시키는 게임이 아니에요. 질문하고, 확인하고, 실행 가능한 도움을 만들어 보세요.</p></div>
    </section></main>${footer()}`;
}
const stageLabels = ['이야기 듣기', '함께 정하기', '연습하기', '다른 상황', '변화 기록'];
const stages = ['listen', 'plan', 'rehearse', 'transfer', 'complete'];
function subjectParticle(name) {
  const last = name.charCodeAt(name.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 ? '이' : '가';
}
function renderChildMessage(text) {
  const descriptions = [];
  const dialogue = text.replace(/\([^()]+\)|（[^（）]+）|\*[^*\n]+\*/g, description => {
    descriptions.push(`<em class="bubble-description">${escapeHtml(description.slice(1, -1).trim())}</em>`);
    return '';
  }).trim();
  return [...descriptions, ...(dialogue ? [escapeHtml(dialogue)] : [])].join('<br>');
}
function progress() {
  const index = stages.indexOf(session.stage);
  return `<ol class="progress-steps" aria-label="연습 진행 단계">${stageLabels.map((label, i) => `<li class="${i < index ? 'done' : i === index ? 'current' : ''}" ${i === index ? 'aria-current="step"' : ''}><span>${i < index ? icon('check') : String(i + 1).padStart(2, '0')}</span>${label}</li>`).join('')}</ol>`;
}
function renderGame(focus = false) {
  const c = session.case;
  const revealHints = c.level === 1 || hintsOpen;
  const messages = pendingMessage ? [...session.messages, pendingMessage] : session.messages;
  app.innerHTML = `${header(true)}<main id="main" class="game-shell page-width">${progress()}
    <div class="game-grid"><aside class="persona-panel ${c.color}"><div class="persona-art">${icon(c.motif, 'motif')}<span>STORY ${String(catalog.findIndex(x => x.id === c.id) + 1).padStart(2, '0')}</span></div><div class="persona-info"><span class="level-pill">LEVEL ${c.level}</span><h1>${escapeHtml(c.name)}의 이야기</h1><p class="persona-age">만 ${c.age}세 · ${c.gender}</p><h2>${escapeHtml(c.title)}</h2><div class="profile-detail"><span>좋아하는 것</span><strong>${escapeHtml(c.interest)}</strong></div><div class="profile-detail"><span>아이의 강점</span><strong>${escapeHtml(c.strength)}</strong></div></div><div class="persona-tip">${icon('leaf')}<p>먼저 판단하지 않고,<br>한 가지씩 물어봐 주세요.</p></div></aside>
    <section class="conversation" aria-label="아이와 대화"><div class="conversation-head"><div><span class="status-dot"></span><strong>${escapeHtml(c.name)}와 나누는 대화</strong></div><span>${session.turns} / 40턴</span></div>
    <div class="chat-messages" role="log" aria-label="대화 기록" aria-live="polite"><div class="scenario-intro" role="note" aria-label="상황 안내"><strong>${icon('note')}상황 안내</strong><p>${escapeHtml(c.brief)}</p><p class="scenario-role">당신은 아이와 대화하는 상담자입니다.</p></div>${messages.map(m => m.role === 'guide' || m.role === 'scene'
      ? `<div class="message-${m.role}" id="${m.id}">${icon(m.role === 'scene' ? 'spark' : 'note')}<p>${escapeHtml(m.text)}</p></div>`
      : `<div class="message-row ${m.role}" id="${m.id}">${m.role === 'child' ? `<span class="chat-avatar ${c.color}">${escapeHtml(c.name.slice(0, 1))}</span>` : ''}<div>${m.role === 'child' ? `<span class="message-name">${escapeHtml(c.name)}</span>` : ''}<p class="bubble">${m.role === 'child' ? renderChildMessage(m.text) : escapeHtml(m.text)}</p></div></div>`).join('')}${busy ? `<div class="thinking" role="status">${escapeHtml(c.name)}${subjectParticle(c.name)} 입력하고 있어요<span>...</span></div>` : ''}</div>
    ${session.result ? resultPanel() : session.safetyHold ? `<div class="pause-panel"><strong>안전을 먼저 확인해 주세요.</strong><p>실제 상황이라면 게임 대신 필요한 도움을 연결해 주세요.</p><button class="button secondary" data-action="resume">가상 연습으로 돌아가기</button></div>` : `<div class="composer-area"><div class="coach-note">${icon('leaf')}<p>${escapeHtml(session.feedback)}</p></div>
      ${session.plan?.agreed && session.stage === 'plan' ? `<button class="support-button" data-action="support" ${busy ? 'disabled' : ''}>${icon('shield')} 주변 어른의 지원 약속 확인하기 ${icon('arrow')}</button>` : ''}
      <div class="suggestion-head"><button class="hint-toggle" data-action="hints" aria-expanded="${revealHints}">${icon('spark')} 질문 도우미 ${revealHints ? '−' : '+'}</button>${mode === 'demo' ? '<span>데모에서는 예시 질문으로 흐름을 확인해 보세요.</span>' : ''}</div>
      ${revealHints ? `<div class="suggestions">${session.suggestions.map((s, i) => `<button data-suggestion="${i}" ${busy ? 'disabled' : ''}>${escapeHtml(s)}</button>`).join('')}</div>` : ''}
      <form id="chat-form" class="composer"><label class="sr-only" for="message-input">${escapeHtml(c.name)}에게 할 말</label><textarea id="message-input" name="message" rows="2" maxlength="1000" placeholder="${escapeHtml(c.name)}에게 궁금한 점을 물어보세요." ${busy ? 'disabled' : ''}></textarea><button class="send-button" type="submit" aria-label="대화 보내기" ${busy ? 'disabled' : ''}>${icon('send')}</button></form><div class="input-meta"><span>Enter 전송 · Shift + Enter 줄바꿈</span><span id="input-count">0 / 1,000</span></div><p class="input-privacy">실제 아이의 이름·학교·연락처를 입력하지 마세요.</p></div>`}
    </section><aside class="notebook"><div class="notebook-title">${icon('note')}<h2>마음 단서 노트</h2><span>${session.notes.length}/3</span></div><p class="notebook-intro">추측이 아닌, 대화로 확인한 사실을 모아요.</p><div class="notes-list">${[0, 1, 2].map(i => session.notes[i] ? `<article class="clue-note"><span>단서 ${String(i + 1).padStart(2, '0')} · 확인됨</span><h3>${escapeHtml(session.notes[i].label)}</h3><p>${escapeHtml(session.notes[i].text)}</p><button data-evidence="${session.notes[i].evidence.childTurnId}">대화 근거 보기 ${icon('arrow')}</button></article>` : `<div class="empty-note"><span>0${i + 1}</span><p>아직 발견하지 못한 단서<br><small>대화를 통해 한 걸음씩 알아가요.</small></p></div>`).join('')}</div>
      <div class="milestones"><h3>작은 변화까지</h3>${[['understanding','상황의 맥락 이해'],['agreement','아이와 방법 합의'],['support','주변 어른의 지원 확인'],['practice','첫 장면에서 연습'],['transfer','다른 장면에 적용']].map(([key,label])=>`<div class="${session.milestones[key] ? 'achieved' : ''}"><span>${session.milestones[key] ? icon('check') : ''}</span>${label}</div>`).join('')}</div><p class="simulation-note">게임의 진행 조건입니다.<br>실제 심리 상태를 측정하지 않습니다.</p>
    </aside></div><div class="game-bottom-note">${icon('shield')}${mode === 'demo' ? '규칙 기반 데모 · 반응과 재연은 작성된 시나리오 분기입니다. AI 대화가 아닙니다.' : 'AI 파일럿 · 입력은 ' + escapeHtml(aiProviderLabel) + '로 전송됩니다. 결과는 가상 연습에만 해당합니다.'}</div></main>${footer()}`;
  const log = document.querySelector('.chat-messages');
  if (log) log.scrollTop = log.scrollHeight;
  if (focus && !busy) document.querySelector('#message-input')?.focus({ preventScroll: true });
}
function resultPanel() {
  return `<section class="result-panel" aria-label="연습 결과">${icon('leaf', 'result-icon')}<p class="eyebrow">작은 변화의 기록</p><h2>${escapeHtml(session.result.title)}</h2><p>${escapeHtml(session.result.change)}</p><p class="result-disclaimer">${escapeHtml(session.result.disclaimer)}</p><div class="result-actions"><button class="button primary" data-action="export">${icon('download')} 연습 결과 저장</button><button class="button secondary" data-action="home">다른 이야기 만나기</button></div></section>`;
}
function openDialog(html, title) {
  document.querySelector('dialog')?.remove();
  const el = document.createElement('dialog');
  el.className = 'modal';
  el.setAttribute('aria-labelledby', 'dialog-title');
  el.innerHTML = `<button class="modal-close" data-action="close-dialog" aria-label="창 닫기">${icon('close')}</button><h2 id="dialog-title">${title}</h2>${html}`;
  document.body.append(el);
  el.addEventListener('click', e => { if (e.target === el) el.close(); });
  el.addEventListener('close', () => el.remove());
  el.showModal();
  return el;
}
function showConsent(id) {
  const c = catalog.find(x => x.id === id);
  openDialog(`<p class="dialog-intro">${escapeHtml(c.name)}의 이야기를 만나기 전에</p><div class="consent-note">교사·보호자 등 성인을 위한 가상 대화 연습입니다. 모든 캐릭터와 사연은 창작이며, 실제 상담이나 진단을 제공하지 않습니다.</div><form id="consent-form" data-case-id="${id}"><label class="checkbox-label"><input type="checkbox" name="consent" required><span>가상의 사례만 입력하며, 실제 아이의 이름·학교·연락처 등 개인정보는 입력하지 않겠습니다.</span></label>${mode === 'demo' ? '<p class="small-note">현재는 규칙 기반 데모입니다. LLM API를 호출하지 않습니다.</p>' : ''}<p class="small-note">대화는 서버 메모리에 최대 1시간 유지됩니다. 종료하면 삭제됩니다. 새로고침 시에는 남아 있는 세션을 다시 엽니다.</p><p class="form-error" role="alert"></p><button class="button primary full-width" type="submit">이야기 시작하기 ${icon('arrow')}</button></form>`, '한 걸음, 천천히 시작해요.');
}
async function startSession(form) {
  const data = new FormData(form);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    session = await api('/api/session', { caseId: form.dataset.caseId, consent: data.has('consent') });
    hintsOpen = false;
    document.querySelector('dialog')?.close();
    renderGame(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (e) { form.querySelector('.form-error').textContent = e.message; button.disabled = false; }
}
async function sendAction(action) {
  if (busy || !session) return;
  busy = true;
  pendingMessage = action.kind === 'say' ? { id: 'pending-message', role: 'user', text: action.text } : null;
  const version = session.version;
  let restoreInput = false;
  renderGame();
  try {
    session = await api('/api/turn', { requestId: crypto.randomUUID(), version, action });
  } catch (e) {
    toast(e.message);
    // Reconcile after network uncertainty instead of blindly replaying a potentially committed turn.
    try { session = await api('/api/session'); } catch (readError) {
      if (readError.status === 401) session = null;
    }
    restoreInput = action.kind === 'say' && session?.version === version;
  } finally {
    busy = false;
    pendingMessage = null;
    if (session) renderGame(true); else renderHome();
    if (restoreInput) {
      const input = document.querySelector('#message-input');
      if (input) {
        input.value = action.text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }
}
async function goHome() {
  if (busy) return toast('응답 처리 후 이동해 주세요.');
  if (session && session.stage !== 'complete' && !window.confirm('연습을 종료할까요? 서버에 남아 있는 대화 기록이 삭제됩니다.')) return;
  if (session) {
    try { await api('/api/session', undefined, 'DELETE'); }
    catch (e) { toast(e.message); return; }
  }
  session = null;
  renderHome();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function downloadResult() {
  const result = { project: '마음연습실', version: '0.1.0', mode: session.mode, case: session.case,
    result: session.result, milestones: session.milestones, notes: session.notes };
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `maum-${session.case.id}-result.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('대화 전문을 제외한 가상 연습 결과를 저장했습니다.');
}

document.addEventListener('click', event => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.dataset.filter !== undefined) {
    filter = Number(target.dataset.filter); renderHome(); document.querySelector(`[data-filter="${filter}"]`)?.focus({ preventScroll: true }); return;
  }
  if (target.dataset.case) return showConsent(target.dataset.case);
  if (target.dataset.suggestion !== undefined && !busy) {
    const input = document.querySelector('#message-input');
    input.value = session.suggestions[Number(target.dataset.suggestion)];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus(); return;
  }
  if (target.dataset.evidence) {
    const message = document.getElementById(target.dataset.evidence);
    message?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    message?.classList.add('highlight');
    setTimeout(() => message?.classList.remove('highlight'), 2500);
    return;
  }
  switch (target.dataset.action) {
    case 'home': return goHome();
    case 'close-dialog': return document.querySelector('dialog')?.close();
    case 'hints': hintsOpen = !hintsOpen; return renderGame();
    case 'support': return sendAction({ kind: 'support' });
    case 'resume': return sendAction({ kind: 'resume' });
    case 'export': return downloadResult();
    case 'guide': return openDialog(`<div class="guide-steps"><h3>01. 먼저 듣고 확인해요</h3><p>언제 어려운지, 그 전후에 어떤 일이 있었는지 질문하세요. 발견한 사실은 단서 노트에 남습니다.</p><h3>02. 함께 방법을 정해요</h3><p>아이가 할 행동, 어른의 구체적인 지원을 제안하고 아이의 의견을 물어보세요. 지원 약속까지 확인해야 다음 단계로 갑니다.</p><h3>03. 두 장면에서 연습해요</h3><p>처음 장면과 다른 상황에 합의한 방법을 적용해 보세요. 정해진 게임 조건을 통과하면 변화 기록을 확인할 수 있습니다.</p></div><div class="consent-note">난이도는 상황의 복잡도입니다. 결과는 실제 아동의 변화나 상담 능력을 보증하지 않습니다. 데모 판정은 키워드 기반이라 합리적인 표현을 놓칠 수 있습니다.</div>`, '마음연습실, 이렇게 이용해요.');
    case 'privacy': return openDialog(`<div class="guide-steps"><h3>가상 사례만 사용해요</h3><p>성인의 교육·연습용 프로토타입입니다. 실제 아동의 이름, 학교, 연락처, 건강·가족 정보는 입력하지 마세요. 간단한 탐지 규칙은 모든 개인정보를 걸러내지 못합니다.</p><h3>대화의 저장 범위</h3><p>이 앱은 대화를 데이터베이스나 분석 로그에 저장하지 않습니다. 세션은 서버 메모리에 최대 1시간 남으며 종료 시 삭제됩니다. 서비스 운영 환경의 접근 로그는 별도 점검 대상입니다.</p><h3>AI 모드의 외부 전송</h3><p>AI 모드에서는 입력과 대화 맥락이 ${escapeHtml(aiProviderLabel)}로 전송됩니다. 응답 저장을 끄더라도 공급자 측 보관이 전혀 없다는 뜻은 아닙니다. 운영자는 기관의 승인·개인정보 처리·보안 요건을 따로 검토해야 합니다.</p></div>`, '연습 데이터 안내');
  }
});
document.addEventListener('submit', event => {
  if (event.target.id === 'consent-form') { event.preventDefault(); startSession(event.target); }
  if (event.target.id === 'chat-form') {
    event.preventDefault();
    const text = event.target.elements.message.value.trim();
    if (text && !busy) sendAction({ kind: 'say', text });
  }
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'message-input' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault(); event.target.form.requestSubmit();
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'message-input') document.querySelector('#input-count').textContent = `${event.target.value.length} / 1,000`;
});

try {
  const data = await api('/api/cases');
  catalog = data.cases; mode = data.mode;
  aiLabel = data.ai?.model ?? 'AI 파일럿';
  aiProviderLabel = data.ai?.label ?? '외부 AI 공급자 API';
  try { session = await api('/api/session'); } catch (e) { if (e.status !== 401) toast(e.message); }
  if (session) renderGame(); else renderHome();
} catch {
  app.innerHTML = '<main id="main" class="loading"><h1>연습실을 준비하고 있어요.</h1><p>지금은 서버에 연결할 수 없습니다. 잠시 후 페이지를 새로고침해 주세요.</p></main>';
}
