# 마음연습실 배포 및 환경변수

## 저장소와 배포 흐름

- 웹: https://github.com/hwk06023/maum-lab-web — Vercel Git 연동, Production branch `main`.
- 서버: https://github.com/hwk06023/maum-lab-server — 최초 Fly.io 배포는 소유자가 진행. 이후 `main` push → 검사/테스트/Docker 빌드 → Fly 배포.
- 브라우저는 웹의 `/api/*`만 호출합니다. Vercel의 서버리스 함수가 Fly API를 호출하므로 쿠키는 웹 도메인의 HttpOnly 쿠키로 유지됩니다.
- 웹은 정적 HTML/CSS/JS + Node.js 24 서버리스 함수입니다. Next.js 없이 Vercel 배포가 가능합니다.

## 1. Vercel에 등록할 값

Import Git Repository에서 `maum-lab-web`을 선택합니다. Root Directory는 저장소 루트, Framework Preset은 Other, Node.js는 24.x입니다. `vercel.json`에 Build Command `npm run build`, Output Directory `public`, 함수 실행 시간 60초가 설정되어 있습니다. Production branch를 `main`으로 확인하세요.

Settings → Environment Variables에 아래 두 값을 **Production** 범위로 등록합니다. Preview에서도 실제 서버 연결이 필요하면 Preview 범위에도 등록합니다.

| 변수 | 필수 | 값 |
|---|---|---|
| `MAUM_BACKEND_URL` | 필수 | `https://실제-Fly-앱.fly.dev` 또는 서버의 HTTPS 도메인. 경로(`/api`)나 쿼리 없이 origin만 지정 |
| `MAUM_PROXY_SECRET` | 필수 | 충분히 무작위인 32자 이상의 비밀값. 64자리 임의 hex 권장. Fly에 등록한 값과 정확히 같아야 함 |

두 값 모두 서버 전용입니다. `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. OpenAI 키는 Vercel에 등록하지 않습니다. 환경변수를 추가/수정하면 재배포가 필요합니다. 서버 정보가 없어도 웹 빌드는 성공하지만 API는 준비 중 안내를 반환합니다.

## 2. Fly.io에 등록할 값

Fly 앱은 `maum-lab-server`의 `main`과 저장소 루트의 Dockerfile/fly.toml을 사용합니다. 아직 앱 이름/도메인을 받지 않았으므로 `fly.toml`에는 특정 `app`을 하드코딩하지 않았습니다. CLI 사용 시 `--app 실제앱이름`을 전달합니다. 지역은 최초 배포 시 소유자가 선택합니다.

### 직접 등록할 Secret

| 이름 | 필수 | 값 |
|---|---|---|
| `MAUM_PROXY_SECRET` | 필수 | Vercel과 동일한 값. 없거나 32자 미만이면 서버가 시작되지 않음 |
| `OPENAI_API_KEY` | live 모드에서 필수 | 실제 OpenAI API 키. demo 모드에는 불필요 |
| `PILOT_ACCESS_CODE` | live 모드에서 필수 | 16자 이상의 파일럿 접근 코드. AI 전송 동의와 함께 입력해야 세션 시작 가능 |

### 이미 Dockerfile/fly.toml에 들어 있는 값

| 이름 | 기본값 | 역할 |
|---|---|---|
| `NODE_ENV` | `production` | 실행 환경 |
| `HOST` | `0.0.0.0` | Fly 내부 수신 주소 |
| `PORT` | `8080` | Fly HTTP service의 internal_port와 동일 |
| `LLM_MODE` | `demo` | 실제 AI 호출 없이 동작. live 전환은 `live`로 설정 |
| `COOKIE_SECURE` | `true` | HTTPS 보안 쿠키 |
| `REQUIRE_PROXY_SECRET` | `true` | Vercel 프록시 연결 인증 필수 |
| `MAX_SESSIONS` | `100` | 프로세스당 세션 수 제한 |
| `MAX_LLM_CALLS_PER_HOUR` | `100` | 프로세스당 시간당 LLM 호출 제한 |

### 선택 변수

| 이름 | 기본값/설명 |
|---|---|
| `OPENAI_MODEL` | `gpt-4.1-mini`. live 모드/프롬프트 초안 생성에 사용할 지원 모델로 변경 가능 |
| `APP_ORIGIN` | 미등록 시 `http://localhost:8080`. 직접 로컬 개발 요청의 Origin 검증용이며 인증된 Vercel 프록시 연결에는 등록 불필요. 설정한다면 경로/끝 슬래시 없이 origin만 지정 |

실제 AI를 사용하려면 `OPENAI_API_KEY`, `PILOT_ACCESS_CODE`와 함께 `LLM_MODE=live`를 Fly Secrets로 등록하거나 저장소의 fly.toml에서 모드를 변경하세요. Fly Secret은 같은 이름의 `[env]` 값보다 우선합니다. 대시보드에서 비밀이 아닌 설정만 임시로 바꾸면 다음 Git 배포가 fly.toml 값을 다시 적용할 수 있으므로 지속할 일반 설정은 저장소에도 반영하세요.

프롬프트 초안 생성 명령 `npm run prompts:generate`도 `OPENAI_API_KEY` 및 선택적인 `OPENAI_MODEL`을 사용합니다. 결과는 검토용이며 자동으로 런타임에 적용되지 않습니다.

## 3. GitHub Actions에 등록할 값

`maum-lab-server` → Settings → Secrets and variables → Actions:

| 위치 | 이름 | 값 |
|---|---|---|
| Variables → Repository variable | `FLY_APP_NAME` | 실제 Fly 앱 이름. URL/도메인이 아님 |
| Secrets → Repository secret | `FLY_API_TOKEN` | 해당 Fly 앱에 한정된 deploy token의 전체 값 |

앱을 처음 배포한 뒤 로컬 Fly CLI에서 `fly tokens create deploy --app 실제앱이름 --expiry 720h`로 제한된 기간의 배포 토큰을 발급할 수 있습니다. 토큰은 채팅/코드에 붙이지 말고 GitHub Secret에 직접 입력합니다. 만료 전 교체하세요. 기간은 운영 정책에 맞게 조정할 수 있습니다.

워크플로는 이미 `push: main`으로 준비되어 있습니다. 두 설정이 없으면 검사는 수행하고 배포만 건너뛰며 Summary에 이유를 남깁니다. 둘 다 등록한 뒤 Actions의 **Verify and deploy to Fly.io → Run workflow → main**으로 최초 자동 배포를 확인하거나 다음 main push를 사용합니다. PR에서는 검사만 실행합니다.

`MAUM_PROXY_SECRET`, OpenAI 키, 파일럿 코드는 Fly 런타임 Secret이므로 GitHub Actions에 중복 등록할 필요가 없습니다. Vercel 배포용 GitHub Secret도 필요하지 않습니다.

## 4. 최초 배포 시 확인

1. Fly 앱 생성 후 공유 Secret 등록. 제공된 fly.toml로 최초 배포 (`fly deploy --app 실제앱이름 --ha=false --strategy immediate`).
2. 머신 수는 **1개**로 유지합니다. `--ha=false`는 여분 머신 생성을 막지만 이미 여러 머신이 있다면 소유자가 수를 1로 맞춰야 합니다. 자동 정지는 비활성화되어 있습니다.
3. 서버의 `https://서버도메인/api/health`가 `ok: true`를 반환하는지 확인합니다. 인증 없는 `/api/cases`의 403은 정상입니다.
4. Vercel 환경변수 두 개 등록 후 배포. 웹에서 사연 선택 → 새 연습 → 한 턴 → 새로고침 → 종료를 확인합니다.
5. GitHub Actions 변수/Secret 등록 후 자동 배포를 확인합니다.
6. Cloudflare/사용자 도메인은 소유자가 연결합니다. 웹 도메인이 달라져도 API 요청은 같은 출처를 사용하므로 별도 CORS 허용 목록이 필요하지 않습니다.

전달해 주실 정보는 **Fly 앱 이름, 서버 HTTPS 주소, Vercel 웹 주소, demo/live 선택, GitHub 배포 Secret 등록 여부**입니다. 비밀값 자체는 전달하지 않아도 됩니다.

## 운영 범위

현재 세션·호출 예산은 단일 Node 프로세스 메모리에 있으며 세션 만료는 1시간입니다. 서버 재시작/배포 시 세션이 초기화되고 배포 중 잠시 중단될 수 있습니다. 다중 머신이나 세션 영속화가 필요하면 공유 저장소를 추가해야 합니다. Vercel 함수에는 세션 상태를 저장하지 않습니다. 실제 Vercel/Fly 배포 및 LLM 실호출 검증은 계정 설정 이후 수행해야 합니다.

참고: [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), [Vercel 빌드 설정](https://vercel.com/docs/builds/configure-a-build), [Fly GitHub Actions](https://docs.fly.io/launch/continuous-deployment-with-github-actions/), [Fly 설정](https://docs.fly.io/reference/configuration/).
