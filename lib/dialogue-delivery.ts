export function sentenceBubbles(text: string): string[] {
  // Protect stage directions and quoted speech while splitting actual sentences.
  const segments: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if ('(（“「'.includes(text[i])) depth++;
    if (')）”」'.includes(text[i])) depth = Math.max(0, depth - 1);
    if (!depth && /[.!?。！？\n]/.test(text[i]) && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      const part = text.slice(start, i + 1).trim();
      if (part) segments.push(part);
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) segments.push(tail);
  return segments.length ? segments : [text];
}

export function bubbleDelay(text: string, initiative = false, random = Math.random): number {
  const complexity = (text.match(/[,，:;“”「」]/g) ?? []).length * 65
    + (text.match(/[0-9]/g) ?? []).length * 20;
  const base = 350 + [...text].length * 32 + complexity + (initiative ? 250 : 0);
  return Math.round(Math.min(5000, Math.max(300, base * (0.75 + random() * 0.5))));
}

type Speech = { role: string; text: string; delivery?: { initiative: boolean } };
export function playBubbles<T extends Speech>(messages: T[], reveal: (message: T) => void, done: () => void,
  schedule: (run: () => void, delay: number) => (() => void) = (run, delay) => {
    const timer = setTimeout(run, delay);
    return () => clearTimeout(timer);
  }) {
  const queue = [...messages];
  let stopped = false;
  let cancelPending = () => {};
  const next = () => {
    if (stopped) return;
    const message = queue.shift();
    if (!message) { done(); return; }
    cancelPending = schedule(() => {
      if (stopped) return;
      reveal(message);
      next();
    }, message.role === 'child' ? bubbleDelay(message.text, !!message.delivery?.initiative) : 0);
  };
  next();
  return () => { stopped = true; cancelPending(); };
}
