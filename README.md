# 스타어부 · Start-Eobu

데이터의 바다에서 창업 기회를 낚는 AI 런치패드. 소스를 고르고, 근거를 확인하며, 브랜드 도메인과 시장 수요를 탐색하는 한국어 정적 웹 앱입니다.

## GitHub Pages 무료 배포

1. 이 폴더의 소스를 공개 GitHub 저장소의 main 브랜치에 올립니다.
2. Settings → Pages → Build and deployment에서 GitHub Actions를 선택합니다.
3. Actions → 스타어부 Pages 배포 → Run workflow를 실행합니다. 완료되면 github-pages 환경의 주소에서 앱을 엽니다.

이후 main 푸시와 매일 한국 시각 오전 6시 17분에 새 자료를 수집하고 배포합니다. Hacker News와 GitHub 자료는 키 없이 수집합니다. 기본 지원사업 12건은 제도 탐색용 예시이며 자료 카드에서 확인할 수 있습니다.

### 공식 지원사업 자동 수집

저장소의 Settings → Secrets and variables → Actions → New repository secret에서 사용할 키를 등록합니다.

- `KSTARTUP_API_KEY`에 공공데이터포털 K-Startup 국문 공고 서비스의 일반 인증키(Decoding)를 등록합니다.
- `BIZINFO_API_KEY`에 기업마당 인증키를 등록합니다.

워크플로를 다시 실행하면 Python 수집 단계가 등록한 키를 사용하고, Pages는 수집 결과 JSON을 제공합니다. 각 공급자의 수집 여부는 Actions 로그에서 확인할 수 있습니다. 도메인·시장 조회와 방문자용 AI는 키 없이 브라우저에서 실행됩니다.

## 대화 기록과 계정 동기화

왼쪽 상단의 세 줄 메뉴로 대화 목록을 열고, 질문과 답변을 검색해 대화를 이어갈 수 있습니다. 넓은 화면에서는 목록이 기본으로 고정되며, 고정 설정은 브라우저에 저장됩니다. 로그인하지 않은 대화는 현재 사이트의 브라우저 저장소에 남습니다. Cloudflare 배포에서 Google 또는 GitHub로 로그인하면 이후 대화를 계정별로 D1에 저장합니다. 기존 브라우저 기록은 로그아웃한 뒤 다시 열 수 있습니다.

### Cloudflare 계정 로그인 배포

GitHub Pages는 정적 화면과 브라우저 기록을 제공합니다. 계정 로그인을 제공하는 주소에는 Cloudflare Worker가 화면과 API를 함께 제공합니다. GitHub Actions는 자료 수집과 배포를 자동화할 수 있습니다.

1. `npx wrangler login`으로 배포 계정에 연결합니다. `npx wrangler d1 create start-eobu`에서 받은 데이터베이스 ID를 `wrangler.jsonc`의 `database_id`에 넣습니다.
2. `npx wrangler d1 migrations apply start-eobu --remote`로 테이블을 생성합니다.
3. GitHub Settings → Developer settings → OAuth Apps → New OAuth App에서 앱을 등록합니다. Homepage URL은 Worker의 공개 HTTPS 주소, Authorization callback URL은 그 주소의 `/api/callback`입니다. 예를 들어 `https://start-eobu.<계정>.workers.dev/api/callback`을 등록합니다.
4. `npx wrangler secret put GITHUB_CLIENT_ID`와 `npx wrangler secret put GITHUB_CLIENT_SECRET`으로 Worker에 로그인 자격 증명을 등록합니다. 이 입력은 운영자 설정입니다.
5. `npm ci`와 `npm run build`를 실행한 뒤 `npx wrangler deploy`로 배포합니다. 빌드 셸의 `VITE_ACCOUNT_SYNC=1` 환경변수는 첫 화면에서 계정 확인을 기다리도록 하는 공개 플래그입니다.

Google 로그인은 Google Cloud Console의 Google Auth Platform에서 웹 애플리케이션 OAuth 클라이언트를 생성한 뒤 활성화할 수 있습니다. 승인된 리디렉션 URI는 Cloudflare의 공개 HTTPS 주소에 \`/api/callback/google\`을 붙인 값입니다. \`npx wrangler secret put GOOGLE_CLIENT_ID\`와 \`npx wrangler secret put GOOGLE_CLIENT_SECRET\`으로 자격 증명을 등록합니다. 두 로그인은 각각 활성화할 수 있으며 Google 로그인과 GitHub 로그인은 서로 다른 계정으로 저장됩니다.

Cloudflare 주소에 처음 배포하기 전에는 대화 기록을 브라우저에 저장합니다. Worker는 GitHub 사용자 ID를 기준으로 대화를 조회하고, 두 기기에서 같은 대화를 수정하면 새 기록을 별도로 저장해 덮어쓰기를 피합니다.

## 방문자용 AI

첫 화면에서 바로 질문하면 관련 지원사업과 트렌드를 찾습니다. 자료·메모에서 직접 자료를 체크해 답변 근거를 좁힐 수 있습니다. 즉시 브리핑은 한국어·영어 검색 점수와 자료 요약을 사용합니다. 답변의 출처 버튼으로 인용한 카드를 엽니다. 내 메모는 현재 브라우저에 저장됩니다.

브라우저 내장 AI 켜기 버튼을 누르면 고품질 Qwen3-4B(WebGPU, q4f16, 약 2.7GB) 또는 초경량 Gemma3-1B(WASM, q4, 약 800MB)를 선택할 수 있습니다. 첫 실행에는 큰 다운로드와 기기 메모리가 필요합니다. 모델은 IndexedDB에 저장되며 다음 방문 때 재사용합니다. 고품질 모델은 WebGPU와 shader-f16을 확인합니다. 브라우저가 보고한 메모리가 8GB 미만이거나 필요한 GPU 기능이 없거나 모델 로드가 실패하면 Gemma3를 준비합니다. 기기 자원이 부족하거나 다운로드가 실패하면 즉시 브리핑이 계속 동작합니다.

## 로컬 모델 연결

Windows는 setup-local-ai.bat를 실행하고 macOS·Linux는 터미널에서 `sh setup-local-ai.sh`를 실행합니다. Ollama가 없으면 표시되는 설치 명령을 실행한 뒤 스크립트를 다시 시작합니다. 스크립트가 로컬 서버를 확인하고 exaone3.5:7.8b와 qwen3:8b를 내려받으면 페이지를 새로 고칩니다. 이미 실행 중인 Ollama가 Pages 요청을 차단하면 트레이 앱 또는 서비스를 종료한 뒤 스크립트를 다시 실행해 OLLAMA_ORIGINS 설정을 적용하세요. 브라우저의 로컬 네트워크 접근 요청을 허용하세요.

로컬 Ollama 모델이 감지되면 앱이 자동으로 연결합니다. 메뉴에서 사용 중인 모델을 확인하고 브라우저 AI를 고를 수 있습니다. 로컬 연결을 사용할 수 없는 경우 자료를 검색해서 즉시 브리핑합니다.

## 로컬 실행 및 빌드

Node.js 22에서 `npm ci`, `npm run dev` 순으로 실행합니다. 배포 결과는 `npm run build` 후 `npm run preview`로 확인합니다. 자료 갱신은 개발자의 GitHub Actions에서 실행됩니다.

도메인 조회는 RDAP 응답을 사용합니다. 미등록 표시는 등록 가능성을 나타내며 예약 도메인과 등록 정책은 등록처에서 확인하세요. 시장 수요는 Hacker News 논의와 입력한 영문 위키백과 문서의 최근 14일 조회수를 표시합니다. 네트워크 또는 CORS 제한 시 각 결과에 확인 불가 상태가 표시됩니다.
