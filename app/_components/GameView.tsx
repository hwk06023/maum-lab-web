'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Action, Message, PublicCase, Session } from '@/lib/types';
import { Icon } from './icons';

const stageLabels = ['마음 알아보기', '방법 함께 정하기', '변화 확인'];
const stages = ['listen', 'plan', 'rehearse'];
const milestoneLabels: [string, string][] = [['understanding', '마음 알아보기'], ['agreement', '방법 함께 정하기'], ['practice', '변화 확인']];

function subjectParticle(name: string) {
  const last = name.charCodeAt(name.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 ? '이' : '가';
}

function ChildMessage({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const dialogue = text.replace(/\([^()]+\)|（[^（）]+）|\*[^*\n]+\*/g, description => {
    parts.push(<em className="bubble-description">{description.slice(1, -1).trim()}</em>);
    return '';
  }).trim();
  if (dialogue) parts.push(dialogue);
  return <>{parts.map((part, i) => <Fragment key={i}>{i > 0 && <br />}{part}</Fragment>)}</>;
}

export default function GameView({ session, catalog, mode, aiProviderLabel, busy, hasPending, pendingMessage, onAction, onRetry, onHome, onExport }: {
  session: Session;
  catalog: PublicCase[];
  mode: string;
  aiProviderLabel: string;
  busy: boolean;
  hasPending: boolean;
  pendingMessage: Message | null;
  onAction: (action: Action) => void;
  onRetry: () => void;
  onHome: () => void;
  onExport: () => void;
}) {
  const c = session.case;
  const [hintsOpen, setHintsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(false);
  const revealHints = c.level === 1 || hintsOpen;
  const messages = pendingMessage ? [...session.messages, pendingMessage] : session.messages;
  const locked = busy || hasPending;
  const index = session.stage === 'complete' ? stages.length : session.stage === 'transfer' ? 2 : Math.max(0, stages.indexOf(session.stage));

  // Keep the newest message in view. The first paint jumps; later updates glide.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTo({ top: log.scrollHeight, behavior: mounted.current ? 'smooth' : 'instant' });
    mounted.current = true;
  }, [messages.length, busy, session.result, session.safetyHold]);

  // Return focus to the composer when the session opens and after each reply.
  useEffect(() => {
    if (!busy) inputRef.current?.focus({ preventScroll: true });
  }, [busy]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(timer);
  }, [highlight]);

  const send = () => {
    const text = draft.trim();
    if (!text || locked) return;
    setDraft('');
    onAction({ kind: 'say', text });
  };

  const showEvidence = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight(id);
  };

  return (
    <main id="main" className="game-shell page-width">
      <ol className="progress-steps" aria-label="연습 진행 단계">
        {stageLabels.map((label, i) => (
          <li key={label} className={i < index ? 'done' : i === index ? 'current' : ''} aria-current={i === index ? 'step' : undefined}>
            <span>{i < index ? <Icon name="check" /> : String(i + 1).padStart(2, '0')}</span>{label}
          </li>
        ))}
      </ol>
      <div className="game-grid">
        <aside className={`persona-panel ${c.color}`}>
          <div className="persona-art"><Icon name={c.motif} className="motif" /><span>STORY {String(catalog.findIndex(x => x.id === c.id) + 1).padStart(2, '0')}</span></div>
          <div className="persona-info"><span className="level-pill">LEVEL {c.level}</span><h1>{c.name}의 이야기</h1><p className="persona-age">만 {c.age}세 · {c.gender}</p><h2>{c.title}</h2><div className="profile-detail"><span>좋아하는 것</span><strong>{c.interest}</strong></div><div className="profile-detail"><span>아이의 강점</span><strong>{c.strength}</strong></div></div>
          <div className="persona-tip"><Icon name="leaf" /><p>먼저 판단하지 않고,<br />한 가지씩 물어봐 주세요.</p></div>
        </aside>
        <section className="conversation" aria-label="아이와 대화">
          <div className="conversation-head"><div><span className="status-dot"></span><strong>{c.name}와 나누는 대화</strong></div><span>{session.turns} / 40턴</span></div>
          <div className="chat-messages" role="log" aria-label="대화 기록" aria-live="polite" ref={logRef}>
            <div className="scenario-intro" role="note" aria-label="상황 안내"><strong><Icon name="note" />상황 안내</strong><p>{c.brief}</p><p className="scenario-role">당신은 아이와 대화하는 상담자입니다.</p></div>
            {messages.map(m => m.role === 'guide' || m.role === 'scene'
              ? <div key={m.id} className={`message-${m.role}${highlight === m.id ? ' highlight' : ''}`} id={m.id}><Icon name={m.role === 'scene' ? 'spark' : 'note'} /><p>{m.text}</p></div>
              : <div key={m.id} className={`message-row ${m.role}${highlight === m.id ? ' highlight' : ''}`} id={m.id}>
                  {m.role === 'child' && <span className={`chat-avatar ${c.color}`}>{c.name.slice(0, 1)}</span>}
                  <div>{m.role === 'child' && <span className="message-name">{c.name}</span>}<p className="bubble">{m.role === 'child' ? <ChildMessage text={m.text} /> : m.text}</p></div>
                </div>)}
            {busy && <div className="thinking" role="status">{c.name}{subjectParticle(c.name)} 입력하고 있어요<span>...</span></div>}
          </div>
          {session.result ? (
            <section className="result-panel" aria-label="연습 결과"><Icon name="leaf" className="result-icon" /><p className="eyebrow">작은 변화의 기록</p><h2>{session.result.title}</h2><p>{session.result.change}</p>{session.result.finalResponse && <p className="bubble"><ChildMessage text={session.result.finalResponse} /></p>}<p className="result-disclaimer">{session.result.disclaimer}</p>
              <div className="result-actions"><button className="button primary" onClick={onExport}><Icon name="download" /> 연습 결과 저장</button><button className="button secondary" onClick={onHome}>다른 이야기 만나기</button></div>
            </section>
          ) : session.safetyHold ? (
            <div className="pause-panel"><strong>안전을 먼저 확인해 주세요.</strong><p>실제 상황이라면 게임 대신 필요한 도움을 연결해 주세요.</p><button className="button secondary" onClick={() => onAction({ kind: 'resume' })}>가상 연습으로 돌아가기</button></div>
          ) : (
            <div className="composer-area">
              <div className="coach-note"><Icon name="leaf" /><p>{session.feedback}</p></div>
              <div className="suggestion-head"><button className="hint-toggle" onClick={() => setHintsOpen(open => !open)} aria-expanded={revealHints}><Icon name="spark" /> 진행 힌트 {revealHints ? '−' : '+'}</button>{mode === 'demo' && <span>데모에서는 예시 질문으로 흐름을 확인해 보세요.</span>}</div>
              {revealHints && (
                <>
                {session.guidance && <section className="milestones" aria-label="현재 진행 조건"><h3>{session.guidance.title}</h3>{session.guidance.checks.map(item => <div key={item.id} className={item.done ? 'achieved' : ''}><span aria-label={item.done ? '완료' : '미완료'}>{item.done && <Icon name="check" />}</span>{item.label}</div>)}<p className="notebook-intro">{session.guidance.hint}</p></section>}
                <div className="suggestions">{session.suggestions.map((s, i) => (
                  <button key={i} disabled={locked} onClick={() => { setDraft(s); inputRef.current?.focus(); }}>{s}</button>
                ))}</div>
                </>
              )}
              {hasPending && !busy && <button className="support-button" onClick={onRetry}>대화는 유지되어 있어요. 응답 다시 받기</button>}
              <form className="composer" onSubmit={event => { event.preventDefault(); send(); }}>
                <label className="sr-only" htmlFor="message-input">{c.name}에게 할 말</label>
                <textarea
                  id="message-input" ref={inputRef} name="message" rows={2} maxLength={1000}
                  placeholder={`${c.name}에게 궁금한 점을 물어보세요.`} disabled={locked} value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
                  }} />
                <button className="send-button" type="submit" aria-label="대화 보내기" disabled={locked}><Icon name="send" /></button>
              </form>
              <div className="input-meta"><span>Enter 전송 · Shift + Enter 줄바꿈</span><span>{draft.length} / 1,000</span></div>
              <p className="input-privacy">실제 아이의 이름·학교·연락처를 입력하지 마세요.</p>
            </div>
          )}
        </section>
        <aside className="notebook">
          <div className="notebook-title"><Icon name="note" /><h2>마음 단서 노트</h2><span>{session.notes.length}개</span></div>
          <p className="notebook-intro">아이의 실제 응답에서 확인한 단서예요. 하나를 알아내면 다음 단계로 넘어가요.</p>
          <div className="notes-list">{session.notes.length ? session.notes.map(note => (
            <article key={note.id} className="clue-note"><span>대화에서 확인됨</span><h3>{note.label}</h3><p>{note.text}</p><button onClick={() => showEvidence(note.evidence.childTurnId)}>대화 근거 보기 <Icon name="arrow" /></button></article>
          )) : <div className="empty-note"><p>대화에서 마음 단서를 확인하면<br /><small>아이의 말이 여기에 기록돼요.</small></p></div>}</div>
          <div className="milestones"><h3>작은 변화까지</h3>{milestoneLabels.map(([key, label]) => (
            <div key={key} className={session.milestones[key] ? 'achieved' : ''}><span>{session.milestones[key] && <Icon name="check" />}</span>{label}</div>
          ))}</div>
          <p className="simulation-note">한 대화 안에서 세 단계를 진행해요.<br />막히면 진행 힌트에서 다음 말을 확인하세요.</p>
        </aside>
      </div>
      <div className="game-bottom-note"><Icon name="shield" />{mode === 'demo' ? '규칙 기반 데모 · 반응과 재연은 작성된 시나리오 분기입니다. AI 대화가 아닙니다.' : `AI 파일럿 · 입력은 ${aiProviderLabel}로 전송됩니다. 결과는 가상 연습에만 해당합니다.`}</div>
    </main>
  );
}
