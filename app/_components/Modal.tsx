'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons';

export function Modal({ title, onClose, children, closeRequested = false }: { title: string; onClose: () => void; children: React.ReactNode; closeRequested?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>('entering');
  const finished = useRef(false);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const requestClose = () => setPhase('closing');
  const finishClose = () => {
    if (finished.current) return;
    finished.current = true;
    ref.current?.close();
    closeCallback.current();
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    // Measure before locking: overlay scrollbars and non-scrolling pages yield 0.
    const gutter = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.overflow = 'hidden';
    if (gutter > 0) body.style.paddingRight = `${padding + gutter}px`;
    if (!el.open) el.showModal();
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase(current => current === 'closing' ? current : 'open'));
    });
    return () => {
      cancelAnimationFrame(frame);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, []);
  useEffect(() => { if (closeRequested) setPhase('closing'); }, [closeRequested]);
  useEffect(() => {
    if (phase !== 'closing') return;
    // Reduced motion has no transitionend; keep a bounded fallback for interruptions.
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 270;
    const timer = setTimeout(finishClose, duration);
    return () => clearTimeout(timer);
  }, [phase]);
  return (
    <dialog
      ref={ref}
      className={`modal modal-${phase}`}
      aria-labelledby="dialog-title"
      onClose={() => { if (!finished.current) finishClose(); }}
      onCancel={event => { event.preventDefault(); requestClose(); }}
      onTransitionEnd={event => { if (phase === 'closing' && event.target === event.currentTarget && event.propertyName === 'opacity') finishClose(); }}
      onClick={event => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <button className="modal-close" onClick={requestClose} aria-label="창 닫기"><Icon name="close" /></button>
      <h2 id="dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
