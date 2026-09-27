'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Action, Message, PublicCase, Session } from '@/lib/types';
import { displayText } from '@/lib/display-text';
import { Icon } from './icons';
import { useDialogueDelivery } from './useDialogueDelivery';

const milestoneLabels: [string, string][] = [['understanding', '마음 파악'], ['empathy', '공감 전달'], ['agreement', '작은 행동 유도'], ['practice', '변화 확인']];

function subjectParticle(name: string) {
  const last = name.charCodeAt(name.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 ? '이' : '가';
}

function ChildMessage({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const dialogue = displayText(text).replace(/\([^()]+\)|（[^（）]+）|\*[^*\n]+\*/g, description => {
    parts.push(<em className="bubble-description">{description.slice(1, -1).trim()}</em>);
    return '';
  }).trim();
  if (dialogue) parts.push(dialogue);
  return <>{parts.map((part, i) => <Fragment key={i}>{i > 0 && <br />}{part}</Fragment>)}</>;
}

export default function GameView({ session, catalog, busy, hasPending, pendingMessage, onAction, onRetry, onHome, onExport, onLearning }: {
  session: Session;
  catalog: PublicCase[];
  busy: boolean;
  hasPending: boolean;
  pendingMessage: Message | null;
  onAction: (action: Action) => void;
  onRetry: () => void;
  onHome: () => void;
  onExport: () => void;
  onLearning: () => void;
}) {
  const c = session.case;
  const [hintsOpen, setHintsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(false);
  const { visible, playing } = useDialogueDelivery(session.sessionId || c.id, session.messages);
  const messages = pendingMessage ? [...visible, pendingMessage] : visible;
  const locked = busy || hasPending || playing;
  const completed = milestoneLabels.filter(([key]) => session.milestones[key]).length;
  const learningChecks = session.guidance?.checks ?? milestoneLabels.map(([id, label]) => ({ id, label, done: !!session.milestones[id] }));
  const [lastProgress, setLastProgress] = useState({ turn: session.turns, completed, notes: session.notes.length });
  const progressed = completed > lastProgress.completed || session.notes.length > lastProgress.notes;
  const hintAvailable = !progressed && session.turns - lastProgress.turn >= 4;

  useEffect(() => {
    if (progressed) {
      setLastProgress({ turn: session.turns, completed, notes: session.notes.length });
      setHintsOpen(false);
    }
  }, [progressed, session.turns, completed, session.notes.length]);

  // Keep the newest message in view. The first paint jumps; later updates glide.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTo({ top: log.scrollHeight, behavior: mounted.current ? 'smooth' : 'instant' });
    mounted.current = true;
  }, [messages.length, busy, session.result, session.safetyHold]);

  // Return focus to the composer when the session opens and after each reply.
  useEffect(() => {
    if (!locked) inputRef.current?.focus({ preventScroll: true });
  }, [locked]);

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
      <div className="progress-steps" aria-label="상담 대화 진행"><div><span className="eyebrow">대화 연습</span><strong>작은 변화까지, 한 걸음씩</strong></div><div className="progress-summary"><div className="progress-track" role="progressbar" aria-label="확인한 변화" aria-valuemin={0} aria-valuemax={4} aria-valuenow={completed}><span className={`progress-fill-${completed}`} /></div><span aria-live="polite">{completed} / 4</span></div></div>
      <div className="game-grid">
        <aside className={`persona-panel ${c.color}`}>
          <div className="persona-art"><Icon name={c.motif} className="motif" /><span>STORY {String(catalog.findIndex(x => x.id === c.id) + 1).padStart(2, '0')}</span></div>
          <div className="persona-info"><span className="level-pill">LEVEL {c.level}</span><h1>{c.name}의 이야기</h1><p className="persona-age">{c.schoolLevel ? `${c.schoolLevel} / ` : ""}만 {c.age}세</p><h2>{displayText(c.title)}</h2><div className="profile-detail"><span>좋아하는 것</span><strong>{displayText(c.interest)}</strong></div><div className="profile-detail"><span>아이의 강점</span><strong>{displayText(c.strength)}</strong></div></div>
          <div className="persona-tip"><Icon name="leaf" /><p>한 번에 하나씩 물어봐요.</p></div>
        </aside>
        <section className="conversation" aria-label="아이와 대화">
          <div className="conversation-head">
            <div><strong>{c.name}{subjectParticle(c.name) === '이' ? '과' : '와'}의 대화</strong></div>
            <span>{session.turns} / 40턴</span>
          </div>
          <div className="chat-messages" role="log" aria-label="대화 기록" aria-live="polite" ref={logRef}>
            <div className="scenario-intro" role="note" aria-label="상황 안내"><strong><Icon name="note" />지금 상황</strong><p>{displayText(c.brief)}</p><p className="scenario-role">나의 역할 / 오늘 처음 만난 상담 선생님</p></div>
            {messages.map(m => m.role === 'guide' || m.role === 'scene'
              ? <div key={m.id} className={`message-${m.role}${highlight === m.id ? ' highlight' : ''}`} id={m.id}><Icon name={m.role === 'scene' ? 'spark' : 'note'} /><p>{displayText(m.text)}</p></div>
              : <div key={m.id} className={`message-row ${m.role}${highlight === m.id ? ' highlight' : ''}`} id={m.id}>
                  {m.role === 'child' && <span className={`chat-avatar ${c.color}`}>{c.name.slice(0, 1)}</span>}
                  <div>{m.role === 'child' && <span className="message-name">{c.name}</span>}<p className="bubble">{m.role === 'child' ? <ChildMessage text={m.text} /> : m.text}</p></div>
                </div>)}
            {(busy || playing) && <div className="thinking" role="status">{c.name}의 말을 기다리고 있어요.</div>}
          </div>
          {session.result && !playing ? (
            <section className="result-panel" aria-label="연습 결과"><Icon name="leaf" className="result-icon" /><p className="eyebrow">작은 변화의 기록</p><h2>{displayText(session.result.title)}</h2><p>{displayText(session.result.change)}</p>{session.result.finalResponse && <p className="bubble"><ChildMessage text={session.result.finalResponse} /></p>}
              {session.result.reflection && <div className="learning-reflection">
                <h3>내 대화 돌아보기</h3>
                <div className="reflection-evidence">{session.result.reflection.evidence.map(item => <div className="learning-card" key={item.label}><h4>{item.label}</h4><p>{displayText(item.text)}</p><button onClick={() => showEvidence(item.messageId)}>대화에서 보기</button></div>)}</div>
                <div className="learning-card"><h4>잠깐 생각해 보기</h4><p>{displayText(session.result.reflection.question)}</p></div>
                <div className="learning-card"><h4>다음 만남에는</h4><p>{displayText(session.result.reflection.nextStep)}</p>{session.result.reflection.supportToConsider && <p>더 생각할 지원: {displayText(session.result.reflection.supportToConsider)}</p>}</div>
                <p className="reflection-scope">{displayText(session.result.reflection.scope)}</p>
                <button className="button secondary" onClick={onLearning}>교육적 설계와 자료</button>
              </div>}
              <p className="result-disclaimer">{displayText(session.result.disclaimer)}</p>
              <div className="result-actions"><button className="button primary" onClick={onExport}><Icon name="download" /> 결과 저장</button><button className="button secondary" onClick={onHome}>다른 아이 만나기</button></div>
            </section>
          ) : session.safetyHold ? (
            <div className="pause-panel"><strong>안전을 먼저 확인해 주세요.</strong><p>실제 상황이라면 게임 대신 필요한 도움을 연결해 주세요.</p><button className="button secondary" onClick={() => onAction({ kind: 'resume' })}>가상 연습으로 돌아가기</button></div>
          ) : (
            <div className="composer-area">
              <div className={`context-hint${hintAvailable ? ' is-available' : ''}${hintAvailable && hintsOpen ? ' is-expanded' : ''}`} aria-hidden={!hintAvailable} inert={!hintAvailable}><button className="hint-toggle" onClick={() => setHintsOpen(open => !open)} aria-expanded={hintAvailable && hintsOpen} aria-controls="conversation-hints">힌트</button><p id="conversation-hints" aria-hidden={!hintAvailable || !hintsOpen}>{displayText(session.guidance?.hint || session.feedback)}</p></div>
              {hasPending && !busy && <button className="support-button" onClick={onRetry}>기록은 그대로 / 응답 다시 받기</button>}
              <form className="composer" onSubmit={event => { event.preventDefault(); send(); }}>
                <label className="sr-only" htmlFor="message-input">{c.name}에게 할 말</label>
                <textarea
                  id="message-input" ref={inputRef} name="message" rows={2} maxLength={1000}
                  placeholder={`${c.name}에게 말을 건네보세요.`} disabled={locked} value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
                  }} />
                <button className="send-button" type="submit" aria-label="대화 보내기" disabled={locked}><Icon name="send" /></button>
              </form>
              <div className="input-meta"><span>Enter 전송 / Shift + Enter 줄바꿈</span><span>{draft.length} / 1,000</span></div>
              <p className="input-privacy">실제 개인정보는 입력하지 마세요.</p>
            </div>
          )}
        </section>
        <aside className="notebook">
          <div className="notebook-title"><Icon name="note" /><h2>대화에서 확인한 말</h2><span>{session.notes.length}개</span></div>
          <div className="notes-list">{session.notes.length ? session.notes.map(note => (
            <article key={note.id} className="clue-note"><span>아이의 말</span><h3>{displayText(note.label)}</h3><p>{displayText(note.text)}</p><button onClick={() => showEvidence(note.evidence.childTurnId)}>대화 보기 <Icon name="arrow" /></button></article>
          )) : <div className="empty-note"><Icon name="note" /><p>대화하며 마음을 발견해요.</p></div>}</div>
          <div className="milestones"><h3>이번에 연습할 것</h3>{learningChecks.map(({ id, label, done }) => (
            <div key={id} className={done ? 'achieved' : ''}><span>{done && <Icon name="check" />}</span>{label}</div>
          ))}</div>
        </aside>
      </div>
    </main>
  );
}
