'use client';

import { useLayoutEffect, useRef } from 'react';
import { Icon } from './icons';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
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
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
    >
      <button className="modal-close" onClick={() => ref.current?.close()} aria-label="창 닫기"><Icon name="close" /></button>
      <h2 id="dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
