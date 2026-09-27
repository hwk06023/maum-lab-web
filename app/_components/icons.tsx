const paths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chat: '<path d="M20 11a8 8 0 0 1-8 8H5l-4 3 2-7a8 8 0 1 1 17-4Z"/><path d="M7 9h8m-8 4h5"/>',
  leaf: '<path d="M20 3C9 2 3 7 5 14s15 5 15-11Z"/><path d="M3 22 15 9"/>',
  note: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  shield: '<path d="m12 2 8 4v6c0 6-8 10-8 10S4 18 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
  pencil: '<path d="m5 15-1 6 6-1L21 9l-5-5Z"/><path d="m13 7 5 5M5 15l5 5M3 4h5m-3-2v4"/>',
  blocks: '<rect x="3" y="12" width="8" height="8" rx="1"/><rect x="13" y="12" width="8" height="8" rx="1"/><path d="m7 10 5-8 5 8Z"/>',
  bridge: '<path d="M2 20h20M4 20V8h4v12M16 20V8h4v12M6 8V4m12 4V4M8 12c2 4 6 4 8 0"/>',
  kite: '<path d="m12 2 7 8-7 7-7-7Z"/><path d="M12 2v15M5 10h14m-7 7c6 7-4 2 1 6"/>',
  orbit: '<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-30 12 12)"/><path d="M17 2h4m-2-2v4"/>',
  controller: '<path d="M7 6h10c4 0 7 13 3 13-2 0-3-4-5-4H9c-2 0-3 4-5 4C0 19 3 6 7 6Z"/><path d="M6 10v4m-2-2h4m8-2h.1m2 3h.1"/>',
  send: '<path d="m3 3 19 9L3 21l4-9Z"/><path d="M7 12h15"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
} as const;

// Static, trusted SVG markup only — never pass user content through here.
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  const markup = paths[name as keyof typeof paths] ?? paths.chat;
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
