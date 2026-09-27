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
interface PendingRequest { requestId: string; version: number; action: Action; recoveryToken?: string }
type ApiError = Error & { status?: number };

export default function MaumApp({ initialCatalog }: { initialCatalog: Catalog | null }) {
  const [catalog, setCatalog] = useState<Catalog | null>(initialCatalog);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  // Intentionally page memory, not sessionStorage/localStorage: reload starts fresh.
  // Keep the last acknowledged state/checkpoint and any unacknowledged request.
  const [session, setSessionState] = useState<Session | null>(null);
  const [busy, setBusyState] = useState(false);
  const [pending, setPendingState] = useState<PendingRequest | null>(null);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef<PendingRequest | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setSession = (next: Session | null) => { sessionRef.current = next; setSessionState(next); };
  const setBusy = (next: boolean) => { busyRef.current = next; setBusyState(next); };
  const setPending = (next: PendingRequest | null) => { pendingRef.current = next; setPendingState(next); };

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
    let data: { error?: string };
    try { data = await response.json(); }
    catch { throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    if (!response.ok) throw Object.assign(new Error(data.error || '요청을 완료하지 못했습니다.'), { status: response.status });
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
    const accept = (next: Session) => { setSession(next); setPending(null); setPendingMessage(null); };
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          accept(await api<Session>('/api/turn', request));
          break;
        } catch (err) {
          const error = err as ApiError;
          // A response can be lost after a committed turn. Reconcile first, then
          // reuse the SAME request ID/checkpoint so retrying cannot append twice.
          try {
            const latest = await api<Session>('/api/session');
            if (latest.version > request.version) { accept(latest); break; }
          } catch { /* A missing server cache never clears the page transcript. */ }
          const transient = !error.status || error.status === 401 || error.status === 503 || error.status === 504;
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
    setPending({ requestId: crypto.randomUUID(), version: current.version, action, recoveryToken: current.recoveryToken });
    setPendingMessage(action.kind === 'say' ? { id: 'pending-message', role: 'user', text: action.text } : null);
    await submitPendingRequest();
  }, [submitPendingRequest, toast]);

  const goHome = async () => {
    const current = sessionRef.current;
    if (busyRef.current) return toast('응답 처리 후 이동해 주세요.');
    if (current && current.stage !== 'complete' && !window.confirm('연습을 종료할까요? 서버에 남아 있는 대화 기록이 삭제됩니다.')) return;
    if (current) {
      try { await api('/api/session', undefined, 'DELETE'); }
      catch { /* Explicitly ending the local page session works even offline. */ }
    }
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
          <div className="guide-steps"><h3>01. 먼저 듣고 확인해요</h3><p>언제 어려운지, 그 전후에 어떤 일이 있었는지 질문하세요. 발견한 사실은 단서 노트에 남습니다.</p><h3>02. 함께 방법을 정해요</h3><p>아이가 할 행동, 어른의 구체적인 지원을 제안하고 아이의 의견을 물어보세요. 지원 약속까지 확인해야 다음 단계로 갑니다.</p><h3>03. 두 장면에서 연습해요</h3><p>처음 장면과 다른 상황에 합의한 방법을 적용해 보세요. 정해진 게임 조건을 통과하면 변화 기록을 확인할 수 있습니다.</p></div><div className="consent-note">난이도는 상황의 복잡도입니다. 결과는 실제 아동의 변화나 상담 능력을 보증하지 않습니다. 데모 판정은 키워드 기반이라 합리적인 표현을 놓칠 수 있습니다.</div>
        </Modal>
      )}
      {dialog?.type === 'privacy' && (
        <Modal title="연습 데이터 안내" onClose={closeDialog}>
          <div className="guide-steps"><h3>가상 사례만 사용해요</h3><p>성인의 교육·연습용 프로토타입입니다. 실제 아동의 이름, 학교, 연락처, 건강·가족 정보는 입력하지 마세요. 간단한 탐지 규칙은 모든 개인정보를 걸러내지 못합니다.</p><h3>대화의 저장 범위</h3><p>대화와 암호화된 복구 정보는 현재 페이지 메모리에 보관하며 새로고침·종료 시 초기화됩니다. 서버는 마지막 요청부터 최대 1시간 동안 처리용 사본을 메모리에 보관합니다. 서버가 재시작되어도 열린 페이지의 복구 정보로 이어갈 수 있습니다. 이 앱은 대화를 데이터베이스나 분석 로그에 저장하지 않습니다.</p><h3>AI 모드의 외부 전송</h3><p>AI 모드에서는 입력과 대화 맥락이 {aiProviderLabel}로 전송됩니다. 응답 저장을 끄더라도 공급자 측 보관이 전혀 없다는 뜻은 아닙니다. 운영자는 기관의 승인·개인정보 처리·보안 요건을 따로 검토해야 합니다.</p></div>
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
