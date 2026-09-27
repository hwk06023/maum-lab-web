# 마음연습실 웹 — maum-lab-web

성인을 위한 가상 아동 대화 연습 시뮬레이터입니다. 실제 상담·진단·치료 서비스가 아닙니다.

Vercel은 이 저장소의 **main**을 Production으로 배포합니다. Next.js(App Router) 앱과 Node.js 24 Route Handler API 프록시로 구성됩니다.

**[배포 순서 및 환경변수 전체 목록](docs/DEPLOYMENT.md)**

## Vercel 설정

- Framework: Next.js (`vercel.json`에 설정됨) / Root Directory: 저장소 루트 / Node.js: 24.x
- Build: `npm run build` (`next build`)
- Production 환경변수: `MAUM_BACKEND_URL`, `MAUM_PROXY_SECRET`
- Vercel의 Git 연동이 main 변경을 자동 배포합니다. 별도 GitHub Vercel 배포 워크플로는 필요하지 않습니다.

`app/`은 화면(App Router), `app/api/`는 네 가지 API Route Handler, `lib/proxy.mjs`는 Fly API로의 인증된 연결입니다.

### 렌더링 전략

- `/`: ISR(60초). 공개 사연 목록을 서버에서 미리 렌더링해 CDN에서 즉시 제공하고, 서버의 페르소나가 바뀌면 백그라운드에서 갱신합니다. 빌드·갱신 시 백엔드에 연결하지 못하면 브라우저가 `/api/cases`로 다시 불러옵니다.
- 대화 화면: 클라이언트 컴포넌트. 코드 분할되어 사연 카드에 마우스를 올리거나 동의 창을 열 때 미리 불러옵니다.
- `/api/*`: 동적 Route Handler(Node.js, 최대 60초). API 응답은 캐시하지 않습니다.

로컬에서 데모 백엔드와 연결하려면 `REQUIRE_PROXY_SECRET=true PORT=4100 MAUM_PROXY_SECRET=<32자 이상> SERVE_STATIC=false npm run demo`를 실행한 뒤, `MAUM_BACKEND_URL=http://127.0.0.1:4100 MAUM_PROXY_SECRET=<같은 값> MAUM_ALLOW_LOCAL_BACKEND=1 npm run dev`를 실행합니다. 대화·페이지별 세션 ID·암호화된 서버 복구 정보는 현재 페이지 메모리에서 유지하며 새로고침하면 초기화됩니다. 통신 오류 시 마지막 대화와 미확인 요청을 유지하고 같은 요청 ID로 재시도합니다. API 키나 읽을 수 있는 내부 페르소나 정보는 브라우저로 보내지 않습니다.

## 서버와 콘텐츠 작업

배포용 서버는 별도 저장소 [maum-lab-server](https://github.com/hwk06023/maum-lab-server)의 main입니다. **새 페르소나·사연·모델 프롬프트·서버 기능은 서버 저장소에서 수정합니다.**

이 저장소의 `src/`, `legacy-web/`(이전 정적 화면), `prompts/`, `content/`, Dockerfile 및 기존 엔진 테스트는 원본의 로컬 데모/회귀 검사 자료로 남아 있습니다. Vercel 배포 경로에서 사용하지 않으며 Fly의 최신 상태와 자동 동기화되지 않습니다. `npm run demo`는 이 독립 로컬 데모를 실행합니다. 실제 분리 배포를 확인할 때는 Vercel 프로젝트와 별도 서버를 사용합니다.

## 검증

```sh
npm run check
npm test
npm run build
```

런타임 의존성은 `next`, `react`, `react-dom`입니다. 기존 33개 검사와 프록시 9개 검사를 포함합니다. 서버리스 함수 교체 후 세션 유지, 쿠키, 출처 검증, 비밀값 보호, 요청 크기 제한 및 장애 응답을 확인합니다. 실제 Vercel/Fly 배포는 소유자의 계정 연결과 환경변수 등록 이후 검증합니다.

GitHub 업로드 이전의 v0.1.0 QA 자료 및 스크린샷은 `docs/QA.md`에 기록되어 있습니다. 현재 배포 절차는 `docs/DEPLOYMENT.md`가 기준입니다.
