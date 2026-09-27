import type { Metadata, Viewport } from 'next';
import './globals.css';
import './blue-theme.css';

export const metadata: Metadata = {
  title: '마음연습실 · 이해에서 시작되는 작은 변화',
  description: '서로 다른 여섯 아이의 이야기를 듣고, 작은 변화를 함께 연습하는 가상 대화 시뮬레이터.',
  robots: { index: false, follow: false },
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563eb'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main">본문으로 건너뛰기</a>
        {/* The home page is prerendered, so buttons can be tapped before React hydrates.
            Remember the last such intent; MaumApp replays it once interactive. */}
        <script dangerouslySetInnerHTML={{ __html: "document.addEventListener('click',function(e){if(window.__maumReady)return;var b=e.target.closest&&e.target.closest('[data-intent]');if(b)window.__maumIntent=b.getAttribute('data-intent')},true)" }} />
        {children}
        <noscript>이 연습실을 이용하려면 JavaScript를 켜 주세요.</noscript>
      </body>
    </html>
  );
}
