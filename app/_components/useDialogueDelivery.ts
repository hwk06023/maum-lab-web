'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/types';
import { playBubbles, sentenceBubbles } from '@/lib/dialogue-delivery';

export type DisplayMessage = Message & { sourceId: string };
export function expandMessages(messages: Message[]): DisplayMessage[] {
  return messages.flatMap(m => m.role === 'child'
    ? sentenceBubbles(m.text).map((text, index) => ({ ...m, text, sourceId: m.id, id: index ? `${m.id}-part-${index}` : m.id }))
    : [{ ...m, sourceId: m.id }]);
}

export function useDialogueDelivery(sessionKey: string, messages: Message[]) {
  const [visible, setVisible] = useState(() => expandMessages(messages));
  const [playing, setPlaying] = useState(false);
  const previous = useRef({ key: sessionKey, ids: new Set(messages.map(m => m.id)) });
  useLayoutEffect(() => {
    const expanded = expandMessages(messages);
    if (previous.current.key !== sessionKey) {
      previous.current = { key: sessionKey, ids: new Set(messages.map(m => m.id)) };
      setVisible(expanded);
      setPlaying(false);
      return;
    }
    const oldIds = previous.current.ids;
    previous.current.ids = new Set(messages.map(m => m.id));
    const queued = expanded.filter(m => !oldIds.has(m.sourceId));
    const immediate = expanded.filter(m => oldIds.has(m.sourceId));
    // The new user message appears at once. Only child speech is paced.
    while (queued.length && queued[0].role !== 'child') immediate.push(queued.shift()!);
    setVisible(immediate);
    setPlaying(queued.length > 0);
    return playBubbles(queued, message => setVisible(items => [...items, message]), () => setPlaying(false));
  }, [sessionKey, messages]);
  return { visible, playing };
}
