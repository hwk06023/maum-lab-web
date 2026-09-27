'use client';

import dynamic from 'next/dynamic';
import { Toaster, toast } from 'sonner';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, Catalog, Message, Session } from '@/lib/types';
import { Icon } from './icons';
import { Home } from './Home';
import { Modal } from './Modal';
import { LearningGuide } from './LearningGuide';
import { buildResultExport } from '@/lib/result-export.mjs';

const loadGame = () => import('./GameView');
const GameView = dynamic(loadGame, { loading: () => <main id="main" className="game-shell page-width" /> });

type Dialog = { type: 'consent'; caseId: string } | { type: 'guide' } | { type: 'privacy' } | { type: 'learning' } | null;
interface PendingRequest { requestId: string; version: number; action: Action; recoveryToken?: string; messages: Message[] }
const STORAGE_KEY = 'maum-conversation-v2';
type ApiError = Error & { status?: number; retryable?: boolean };

export default function MaumApp({ initialCatalog }: { initialCatalog: Catalog | null }) {
  const [catalog, setCatalog] = useState<Catalog | null>(initialCatalog);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState(0);
  const [headerStuck, setHeaderStuck] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  // Browser-owned transcript + pending request. No server-side session cache.
  const [session, setSessionState] = useState<Session | null>(null);
  const [busy, setBusyState] = useState(false);
  const [pending, setPendingState] = useState<PendingRequest | null>(null);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef<PendingRequest | null>(null);
  const exitIntent = useRef<{ button: EventTarget | null; expires: number } | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetExit = useCallback(() => {
    exitIntent.current = null;
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = null;
    toast.dismiss('end-practice');
  }, []);

  useEffect(() => {
    const cancelOnInteraction = (event: Event) => {
      const intent = exitIntent.current;
      if (!intent) return;
      const sameButton = intent.button instanceof Element && event.target instanceof Node && intent.button.contains(event.target);
      const activation = event.type === 'pointerdown' || event.type === 'click' ||
        (event instanceof KeyboardEvent && ['Enter', ' '].includes(event.key));
      if (!sameButton || !activation) resetExit();
    };
    const events = ['pointerdown', 'click', 'keydown', 'input', 'wheel', 'focusin'];
    events.forEach(name => document.addEventListener(name, cancelOnInteraction, true));
    return () => {
      events.forEach(name => document.removeEventListener(name, cancelOnInteraction, true));
      resetExit();
    };
  }, [resetExit]);

  useEffect(() => {
    const updateHeader = () => setHeaderStuck(window.scrollY > 0);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);

  const persist = (nextSession: Session | null, nextPending: PendingRequest | null) => {
    if (!nextSession) { sessionStorage.removeItem(STORAGE_KEY); return; }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ session: nextSession, pending: nextPending }));
  };
  const setSession = (next: Session | null) => { persist(next, pendingRef.current); sessionRef.current = next; setSessionState(next); };
  const setBusy = (next: boolean) => { busyRef.current = next; setBusyState(next); };
  const setPending = (next: PendingRequest | null) => { persist(sessionRef.current, next); pendingRef.current = next; setPendingState(next); };

  useEffect(() => {
    // sessionStorage normally survives reload. Preserve the requested fresh-start
    // behavior by clearing once per document, while React remounts recover it.
    const page = window as Window & { __maumStorageReady?: boolean };
    try {
      if (!page.__maumStorageReady) {
        sessionStorage.removeItem(STORAGE_KEY);
        page.__maumStorageReady = true;
      } else {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          const value = JSON.parse(saved) as { session: Session; pending: PendingRequest | null };
          sessionRef.current = value.session; setSessionState(value.session);
          pendingRef.current = value.pending; setPendingState(value.pending);
          setPendingMessage(value.pending?.action.kind === 'say' ? { id: 'pending-message', role: 'user', text: value.pending.action.text } : null);
        }
      }
    } catch { toast('브라우저의 세션 저장 공간을 사용할 수 없습니다. 저장 권한을 확인해 주세요.'); }
  }, []);

  const api = useCallback(async <T,>(path: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> => {
    const headers: Record<string, string> = body ? { 'Content-Type': 'application/json' } : {};
    const sessionId = sessionRef.current?.sessionId;
    if (sessionId) headers['x-maum-session-id'] = sessionId;
    const response = await fetch(path, {
      method, credentials: 'same-origin', headers, cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined
    });
    let data: { error?: string; retryable?: boolean };
    try { data = await response.json(); }
    catch { throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    if (!response.ok) throw Object.assign(new Error(data.error || '요청을 완료하지 못했습니다.'), { status: response.status, retryable: data.retryable });
    return data as T;
  }, []);

  // Refresh even when ISR supplied a catalogue: backend releases may add cases
  // independently of this deployment. Never reset an active conversation.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (sessionRef.current) return;
      api<Catalog>('/api/cases').then(next => {
        if (!cancelled && !sessionRef.current) { setCatalog(next); setLoadFailed(false); }
      }, () => { if (!cancelled && !initialCatalog) setLoadFailed(true); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; window.removeEventListener('focus', refresh); };
  }, [api, initialCatalog]);

  const mode = catalog?.mode ?? 'demo';
  const aiLabel = catalog?.ai?.model ?? 'AI 파일럿';
  const aiProviderLabel = catalog?.ai?.label ?? '외부 AI 공급자 API';

  const openConsent = useCallback((caseId: string) => {
    void loadGame();
    setDialog({ type: 'consent', caseId });
  }, []);

  // Replay a tap that happened before hydration (see the inline script in layout.tsx).
  useEffect(() => {
    const w = window as Window & { __maumReady?: boolean; __maumIntent?: string };
    w.__maumReady = true;
    const intent = w.__maumIntent;
    delete w.__maumIntent;
    if (!intent || !catalog) return;
    if (intent === 'guide' || intent === 'privacy') setDialog({ type: intent });
    else if (intent.startsWith('case:') && catalog.cases.some(c => c.id === intent.slice(5))) openConsent(intent.slice(5));
  }, [catalog, openConsent]);

  const startSession = async (caseId: string, consent: boolean): Promise<string | null> => {
    try {
      const next = await api<Session>('/api/session', { caseId, consent, pageSession: true });
      setPending(null);
      setPendingMessage(null);
      setSession(next);
      window.scrollTo({ top: 0, behavior: 'instant' });
      return null;
    } catch (e) { return (e as Error).message; }
  };

  const submitPendingRequest = useCallback(async () => {
    const request = pendingRef.current;
    if (busyRef.current || !sessionRef.current || !request) return;
    setBusy(true);
    const accept = (next: Session) => {
      persist(next, null);
      sessionRef.current = next; setSessionState(next);
      pendingRef.current = null; setPendingState(null); setPendingMessage(null);
    };
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          accept(await api<Session>('/api/turn', request));
          break;
        } catch (err) {
          const error = err as ApiError;
          // Retry the identical browser-owned base + action. A lost response
          // cannot append twice because no server state was advanced.
          const transient = error.retryable !== false && (!error.status || error.status === 503 || error.status === 504);
          if (!attempt && transient) continue;
          toast(error.message);
          break;
        }
      }
    } finally {
      setBusy(false);
    }
  }, [api, toast]);

  const sendAction = useCallback(async (action: Action) => {
    const current = sessionRef.current;
    if (busyRef.current || !current || pendingRef.current) return;
    if (current.turns >= 40) return toast('한 회차의 대화 한도에 도달했습니다. 현재 대화 기록은 그대로 유지됩니다.');
    try { setPending({ requestId: crypto.randomUUID(), version: current.version, action, recoveryToken: current.recoveryToken, messages: current.messages }); }
    catch { return toast('대화를 브라우저에 저장하지 못했습니다. 저장 공간을 확인해 주세요.'); }
    setPendingMessage(action.kind === 'say' ? { id: 'pending-message', role: 'user', text: action.text } : null);
    await submitPendingRequest();
  }, [submitPendingRequest, toast]);

  const goHome = (event?: React.MouseEvent<HTMLButtonElement>) => {
    const current = sessionRef.current;
    if (busyRef.current) return toast('응답 처리 후 이동해 주세요.');
    if (current && current.stage !== 'complete') {
      const button = event?.currentTarget ?? null;
      const intent = exitIntent.current;
      if (!button || intent?.button !== button || Date.now() >= intent.expires) {
        resetExit();
        exitIntent.current = { button, expires: Date.now() + 5000 };
        exitTimer.current = setTimeout(resetExit, 5000);
        toast('나가려면 같은 버튼을 한 번 더 눌러주세요.', {
          id: 'end-practice',
          description: '5초 안에 다시 누르면 연습과 대화 기록이 종료돼요.',
          duration: 5000,
          onDismiss: resetExit,
          onAutoClose: resetExit,
        });
        return;
      }
    }
    resetExit();
    setSession(null);
    setPending(null);
    setPendingMessage(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const downloadResult = () => {
    const s = sessionRef.current;
    if (!s) return;
    const result = buildResultExport(s);
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `maum-${s.case.id}-result.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('전체 대화와 연습 결과를 저장했습니다.');
  };

  const inGame = !!session && !!catalog;
  const closeDialog = () => setDialog(null);

  let content: React.ReactNode;
  if (!catalog) {
    content = loadFailed
      ? <main id="main" className="loading"><div className="loading-card"><Icon name="chat" /><h1>잠시 연결이 끊겼어요.</h1><p>새로고침 후 다시 시작해 주세요.</p></div></main>
      : <main id="main" className="loading"><div className="loading-card"><Icon name="chat" /><p>연습실을 준비하고 있어요.</p></div></main>;
  } else {
    content = (
      <>
        <header className={`site-header${headerStuck ? ' is-stuck' : ''}`}><div className="header-inner">
          <button className="brand" onClick={goHome} aria-label="마음연습실 홈"><span className="brand-mark"><Icon name="heartChat" /></span><span className="brand-copy">마음연습실<small>MAUM LAB</small></span></button>
          <nav aria-label="주 메뉴">
            {inGame
              ? <button className="nav-link" onClick={goHome}><Icon name="back" /> 연습실로</button>
              : <a className="nav-link active" href="#stories">연습실</a>}
            <button className="nav-link" data-intent="guide" onClick={() => setDialog({ type: 'guide' })}>진행 방법</button>
          </nav>
          <p className="mode-badge">{mode === 'demo' ? '규칙 기반 데모' : aiLabel}</p>
        </div></header>
        {inGame
          ? <GameView
              key={session.sessionId ?? session.case.id}
              session={session} catalog={catalog.cases} mode={mode} aiProviderLabel={aiProviderLabel}
              busy={busy} hasPending={!!pending} pendingMessage={pendingMessage}
              onAction={sendAction} onRetry={submitPendingRequest} onHome={goHome} onExport={downloadResult} onLearning={() => setDialog({ type: 'learning' })} />
          : <Home catalog={catalog.cases} filter={filter} onFilter={setFilter} onStart={openConsent} onPreload={loadGame} />}
        <footer className="site-footer"><div><strong>마음연습실</strong><span>대화로 시작하는 변화.</span></div><p>성인 교육용 / 가상 사례<br />실제 상담, 진단을 대신하지 않습니다.</p><div className="footer-actions"><button onClick={() => setDialog({ type: 'learning' })}>교육적 설계와 자료</button><button data-intent="privacy" onClick={() => setDialog({ type: 'privacy' })}>데이터 안내 <Icon name="arrow" /></button></div></footer>
      </>
    );
  }

  return (
    <>
      <div id="app">{content}</div>
      <Toaster position="top-center" theme="light" duration={5000} closeButton
        containerAriaLabel="알림" toastOptions={{
          closeButtonAriaLabel: '알림 닫기',
          style: { background: '#fff', color: '#172b4d', borderColor: '#dfe7f3', borderRadius: '14px' },
          actionButtonStyle: { background: '#2563eb', color: '#fff' },
          cancelButtonStyle: { background: '#edf3ff', color: '#184bc0' },
        }} />
      {dialog?.type === 'consent' && catalog && (
        <ConsentDialog
          name={catalog.cases.find(c => c.id === dialog.caseId)?.name ?? ''}
          demo={mode === 'demo'} onClose={closeDialog}
          onSubmit={consent => startSession(dialog.caseId, consent)} />
      )}
      {dialog?.type === 'guide' && (
        <Modal title="이렇게 연습해요" onClose={closeDialog}>
          <div className="guide-steps"><section><span>01</span><div><h3>마음 듣기</h3><p>추측하기보다 관찰하고 물어보세요.</p></div></section><section><span>02</span><div><h3>공감하기</h3><p>들은 마음을 짧게 되짚어 주세요.</p></div></section><section><span>03</span><div><h3>행동 제안</h3><p>작은 행동과 어른의 도움을 함께 정해요.</p></div></section><section><span>04</span><div><h3>변화 확인</h3><p>한 번 시도하고 내 대화도 돌아봐요.</p></div></section></div><div className="consent-note"><strong>서로 다른 연습 상황</strong><p>1 부담과 도움<br />2 경계와 차례<br />3 안전과 선택</p></div><p className="small-note">4턴 동안 진전이 없으면 입력창 위에 ‘힌트’가 나타나요.</p>
        </Modal>
      )}
      {dialog?.type === 'privacy' && (
        <Modal title="연습 데이터 안내" onClose={closeDialog}>
          <div className="guide-steps privacy-cards"><section><Icon name="shield" /><div><h3>가상 사례만</h3><p>실제 아이의 이름, 학교, 연락처, 건강, 가족 정보는 입력하지 마세요.</p></div></section><section><Icon name="note" /><div><h3>이 탭에만 보관</h3><p>대화와 대기 중인 입력은 sessionStorage에 저장합니다.<br />새로고침, 연습 종료 시 초기화됩니다.</p></div></section><section><Icon name="chat" /><div><h3>AI로 전송</h3><p>매번 전체 대화를 서버와 {aiProviderLabel}로 보냅니다.<br />자체 서버에는 대화 기록을 남기지 않습니다.<br />AI 공급자의 보관 정책은 별도로 적용됩니다.</p></div></section></div>
        </Modal>
      )}
      {dialog?.type === 'learning' && <Modal title="이 연습이 지향하는 것" onClose={closeDialog}><LearningGuide /></Modal>}
    </>
  );
}

function ConsentDialog({ name, demo, onClose, onSubmit }: {
  name: string; demo: boolean; onClose: () => void; onSubmit: (consent: boolean) => Promise<string | null>;
}) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  return (
    <Modal title={`${name}의 이야기를 시작할까요?`} onClose={onClose} closeRequested={finished}>
      <form className="consent-form" onSubmit={async event => {
        event.preventDefault();
        setSubmitting(true);
        const message = await onSubmit(new FormData(event.currentTarget).has('consent'));
        if (message) { setError(message); setSubmitting(false); }
        else setFinished(true);
      }}>
        <div className="consent-details">
        <div className="consent-note"><strong>당신은 상담자입니다.</strong><p>가상의 아이와 대화하며 작은 변화를 이끌어보세요.<br />성인 교육용이며 실제 상담, 진단이 아닙니다.</p></div>
        <label className="checkbox-label"><input type="checkbox" name="consent" required /><span>실제 개인정보 없이, 가상 사례만 입력할게요.</span></label>
        {demo && <p className="small-note">규칙 기반 데모 / AI 호출 없음</p>}
        <p className="small-note">새로고침하거나 연습을 종료하면 대화가 초기화돼요.</p>
        <p className="form-error" role="alert">{error}</p>
        </div>
        <button className="button primary full-width" type="submit" disabled={submitting}>{submitting ? '준비하고 있어요' : '이야기 시작하기'} <Icon name="arrow" /></button>
      </form>
    </Modal>
  );
}
