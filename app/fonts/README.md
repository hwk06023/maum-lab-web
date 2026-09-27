# NanumSquare / 네이버 나눔스퀘어

Copyright NAVER Corporation and NAVER Cultural Foundation. SIL Open Font License 1.1.

Original design: https://hangeul.naver.com/font
Selected by user: https://noonnu.cc/font_page/37
Unmodified WOFF2 files: https://github.com/moonspam/NanumSquare (webfont distribution linked by Noonnu).
Regular 400, Bold 700, ExtraBold 800. NAVER-LICENSE.txt includes the publisher's full notice and license from https://help.naver.com/service/30016/contents/18088?osType=PC&lang=ko.

These files ship with the application via next/font/local. Runtime requests stay on the application's origin; there is no external font CDN or operating-system installation requirement. All three weights are preloaded. A pre-hydration FontFaceSet gate reveals the UI after they load, preventing the browser's timed font-display fallback from flashing first. On a font download failure the UI is released rather than left inaccessible. Refresh retries the font load.
