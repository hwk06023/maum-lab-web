'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, Catalog, Message, Session } from '@/lib/types';
import { Icon } from './icons';
import { Home } from './Home';
import { Modal } from './Modal';

const loadGame = () => import('./GameView');
const GameView = dynamic(loadGame, { loading: () => <main id="main" className="game-shell page-width" /> });

type Dialog = { type: 'consent'; caseId: string } | { type: 'guide' } | { type: 'privacy' } | null;
interface PendingRequest { requestId: string; version: number; action: Action; recoveryToken?: string; messages: Message[] }
const STORAGE_KEY = 'maum-conversation-v2';
type ApiError = Error & { status?: number; retryable?: boolean };

export default function MaumApp({ initialCatalog }: { initialCatalog: Catalog | null }) {
  const [catalog, setCatalog] = useState<Catalog | null>(initialCatalog);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  // Browser-owned transcript + pending request. No server-side session cache.
  const [session, setSessionState] = useState<Session | null>(null);
  const [busy, setBusyState] = useState(false);
  const [pending, setPendingState] = useState<PendingRequest | null>(null);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef<PendingRequest | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
    } catch { setToastText('브라우저의 세션 저장 공간을 사용할 수 없습니다. 저장 권한을 확인해 주세요.'); }
  }, []);

  const toast = useCallback((text: string) => {
    setToastText(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), 7000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

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

  // Fallback when the server-rendered catalogue was unavailable at render time.
  useEffect(() => {
    if (initialCatalog) return;
    api<Catalog>('/api/cases').then(setCatalog, () => setLoadFailed(true));
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
      setDialog(null);
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

  const goHome = async () => {
    const current = sessionRef.current;
    if (busyRef.current) return toast('응답 처리 후 이동해 주세요.');
    if (current && current.stage !== 'complete' && !window.confirm('연습을 종료할까요? 이 탭에 저장한 대화 기록이 삭제됩니다.')) return;
    setSession(null);
    setPending(null);
    setPendingMessage(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const downloadResult = () => {
    const s = sessionRef.current;
    if (!s) return;
    const result = { project: '마음연습실', version: '0.1.0', mode: s.mode, case: s.case,
      result: s.result, milestones: s.milestones, notes: s.notes };
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `maum-${s.case.id}-result.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('대화 전문을 제외한 가상 연습 결과를 저장했습니다.');
  };

  const inGame = !!session && !!catalog;
  const closeDialog = () => setDialog(null);

  let content: React.ReactNode;
  if (!catalog) {
    content = loadFailed
      ? <main id="main" className="loading"><h1>연습실을 준비하고 있어요.</h1><p>지금은 서버에 연결할 수 없습니다. 잠시 후 페이지를 새로고침해 주세요.</p></main>
      : <main id="main" className="loading"><p>마음연습실을 준비하고 있어요.</p></main>;
  } else {
    content = (
      <>
        <header className="site-header"><div className="header-inner">
          <button className="brand" onClick={goHome} aria-label="마음연습실 홈"><span className="brand-mark">m<span>•</span></span><span>마음연습실<small>MAUM LAB</small></span></button>
          <nav aria-label="주 메뉴">
            {inGame
              ? <button className="nav-link" onClick={goHome}><Icon name="back" /> 연습실로</button>
              : <a className="nav-link active" href="#stories">연습실 둘러보기</a>}
            <button className="nav-link" data-intent="guide" onClick={() => setDialog({ type: 'guide' })}>진행 방법</button>
          </nav>
          <span className="mode-badge"><span></span>{mode === 'demo' ? '규칙 기반 데모' : aiLabel}</span>
        </div></header>
        {inGame
          ? <GameView
              key={session.sessionId ?? session.case.id}
              session={session} catalog={catalog.cases} mode={mode} aiProviderLabel={aiProviderLabel}
              busy={busy} hasPending={!!pending} pendingMessage={pendingMessage}
              onAction={sendAction} onRetry={submitPendingRequest} onHome={goHome} onExport={downloadResult} />
          : <Home catalog={catalog.cases} filter={filter} onFilter={setFilter} onStart={openConsent} onPreload={loadGame} />}
        <footer className="site-footer"><div><strong>마음연습실</strong><span>이해에서 시작되는 작은 변화.</span></div><p>성인 교육·연습용 프로토타입 · 모든 사연은 창작입니다.<br />공식 기관 인증이나 실제 상담·치료 효과를 표시하지 않습니다.</p><button data-intent="privacy" onClick={() => setDialog({ type: 'privacy' })}>데이터 안내</button></footer>
      </>
    );
  }

  return (
    <>
      <div id="app">{content}</div>
      <div className="toast" role="status" aria-live="polite" hidden={!toastText}>{toastText}</div>
      {dialog?.type === 'consent' && catalog && (
        <ConsentDialog
          name={catalog.cases.find(c => c.id === dialog.caseId)?.name ?? ''}
          demo={mode === 'demo'} onClose={closeDialog}
          onSubmit={consent => startSession(dialog.caseId, consent)} />
      )}
      {dialog?.type === 'guide' && (
        <Modal title="마음연습실, 이렇게 이용해요." onClose={closeDialog}>
          <div className="guide-steps"><h3>하나의 상담 대화로 끝까지</h3><p>무엇이 싫은지 듣고, 들은 마음을 공감해 주세요. 대신 할 작은 행동 하나를 제안한 뒤 지금 해보도록 격려하면 됩니다.</p><p>마음 파악 · 공감 전달 · 작은 행동 유도 · 변화 확인, 네 가지만 대화로 확인합니다. 별도 연습 장면이나 추가 미션은 없어요. 막히면 진행 힌트에서 다음 말을 참고하세요.</p></div><div className="consent-note">1단계는 마음을 알아보려는 시도, 2단계는 사건과 감정의 연결, 3단계는 핵심 이유에 대한 정확한 이해와 구체적 도움·선택이 필요합니다. 결과는 가상 시나리오에서 확인한 작은 변화입니다.</div>
        </Modal>
      )}
      {dialog?.type === 'privacy' && (
        <Modal title="연습 데이터 안내" onClose={closeDialog}>
          <div className="guide-steps"><h3>가상 사례만 사용해요</h3><p>성인의 교육·연습용 프로토타입입니다. 실제 아동의 이름, 학교, 연락처, 건강·가족 정보는 입력하지 마세요. 간단한 탐지 규칙은 모든 개인정보를 걸러내지 못합니다.</p><h3>대화의 저장 범위</h3><p>대화 전체와 진행 정보, 응답 대기 중인 입력은 이 탭의 sessionStorage에만 보관합니다. 새로고침·연습 종료 시 초기화합니다. 매 요청마다 전체 대화를 서버로 보내며, 서버는 응답 처리 중에만 읽고 이후 세션 메모리·데이터베이스·대화 로그에 보관하지 않습니다. 서버가 재시작되어도 이 탭의 기록으로 이어갑니다.</p><h3>AI 모드의 외부 전송</h3><p>AI 모드에서는 입력과 대화 맥락이 {aiProviderLabel}로 전송됩니다. 응답 저장을 끄더라도 공급자 측 보관이 전혀 없다는 뜻은 아닙니다. 운영자는 기관의 승인·개인정보 처리·보안 요건을 따로 검토해야 합니다.</p></div>
        </Modal>
      )}
    </>
  );
}

function ConsentDialog({ name, demo, onClose, onSubmit }: {
  name: string; demo: boolean; onClose: () => void; onSubmit: (consent: boolean) => Promise<string | null>;
}) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal title="한 걸음, 천천히 시작해요." onClose={onClose}>
      <p className="dialog-intro">{name}의 이야기를 만나기 전에</p>
      <div className="consent-note">교사·보호자 등 성인을 위한 가상 대화 연습입니다. 모든 캐릭터와 사연은 창작이며, 실제 상담이나 진단을 제공하지 않습니다.</div>
      <form onSubmit={async event => {
        event.preventDefault();
        setSubmitting(true);
        const message = await onSubmit(new FormData(event.currentTarget).has('consent'));
        if (message) { setError(message); setSubmitting(false); }
      }}>
        <label className="checkbox-label"><input type="checkbox" name="consent" required /><span>가상의 사례만 입력하며, 실제 아이의 이름·학교·연락처 등 개인정보는 입력하지 않겠습니다.</span></label>
        {demo && <p className="small-note">현재는 규칙 기반 데모입니다. LLM API를 호출하지 않습니다.</p>}
        <p className="small-note">대화는 현재 페이지를 사용하는 동안 유지됩니다. 새로고침하거나 연습을 종료하면 초기화됩니다.</p>
        <p className="form-error" role="alert">{error}</p>
        <button className="button primary full-width" type="submit" disabled={submitting}>이야기 시작하기 <Icon name="arrow" /></button>
      </form>
    </Modal>
  );
}
