'use client';

import { useEffect, useRef } from 'react';
import { Icon } from './icons';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    // Unmounting removes the dialog from the top layer, so no cleanup is needed.
    if (el && !el.open) el.showModal();
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
