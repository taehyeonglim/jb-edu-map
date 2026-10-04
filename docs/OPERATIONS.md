# 개발·배포·데이터 운영

[프로젝트 소개로 돌아가기](../README.md)

## 실행 환경

Node.js 22.x와 npm 10 이상을 사용합니다. `.nvmrc`가 22를 지정합니다. 개발 서버는 `npm run dev`, 배포 빌드는 `npm run build`와 `npm start`입니다. 기본 화면은 저장소의 정적 데이터를 읽으며 원자료나 API 키를 요구하지 않습니다.

## 환경변수

`.env.example`을 `.env.local`로 복사하고 필요한 값만 채웁니다. 실제 키를 커밋하지 않습니다.

| 변수 | 용도 | 기본값 / 미설정 시 동작 |
| --- | --- | --- |
| `NEXT_PUBLIC_VWORLD_KEY` | 브라우저 배경지도 키 | 배경 타일 없이 경계·학교·통계 표시 |
| `VWORLD_BUILDING_KEY` | 서버의 VWorld 건물 조회 키 | 건물 API 503, 기본 지도 계속 사용 |
| `VWORLD_BUILDING_DOMAIN` | 건물 키에 등록한 도메인 | VWorld 키 설정에 맞춰 지정 |
| `BUILDINGS_ENABLED` | 서버 건물 API 활성화 | `false`일 때 API 503 |
| `NEXT_PUBLIC_BUILDINGS_ENABLED` | 화면 건물 레이어 활성화 | `false`이면 건물 요청 안 함 |
| `NEXT_PUBLIC_SITE_URL` | 공유 미리보기의 공개 주소 | `https://jb-edu-map.vercel.app` |
| `NEXT_PUBLIC_EDU_MAP_PROFILE` | 화면 지역 profile | `jeonbuk` |
| `EDU_MAP_PROFILE` | 파이프라인 지역 profile | 공개 profile 변수 또는 `jeonbuk`; `--profile` 우선 |
| `NEXT_PUBLIC_MAP_FX` | 지도 부가 효과 | `off`이면 효과 해제 |

`NEXT_PUBLIC_*` 값은 빌드 시 브라우저 코드에 들어갑니다. 서버용 건물 키에는 이 접두사를 붙이지 않습니다. 공개 설정을 변경했다면 재빌드합니다. `NEXT_PUBLIC_E2E`는 Playwright 전용이며 배포 환경에는 설정하지 않습니다.

## 배포 (Vercel)

1. Vercel 대시보드에서 "Add New Project" → 이 저장소(GitHub)를 import 합니다.
2. 빌드 설정은 기본값을 그대로 씁니다 — Framework Preset이 자동으로 "Next.js"로 인식되고, Build Command(`next build` = `npm run build`)·Output Directory·Install Command(`npm ci`) 모두 손댈 필요가 없습니다. Node.js 버전은 Vercel이 `package.json`의 `engines.node`(프로젝트 설정에서도 지정 가능)를 기준으로 선택합니다 — `.nvmrc`는 로컬 `nvm use` 전용이며 Vercel은 이를 읽지 않습니다.
3. 배경 도로지도를 표시하려면 `NEXT_PUBLIC_VWORLD_KEY`를 설정합니다. 키가 없어도 학교·경계·통계 기능은 동작합니다. 지표·경계·학교 데이터는 저장소의 `public/data/` 정적 파일을 사용합니다. 입체 현황판이 기본이며 지도 설정에서 평면 보기도 선택할 수 있습니다.
   - 발급: [브이월드 오픈API](https://www.vworld.kr/dev/v4dv_openapireferrer_s001.do)에서 무료로 키를 발급받고, 사용할 배포 도메인(예: `xxx.vercel.app`, 커스텀 도메인)을 인증키 관리에 등록합니다.
   - Vercel 프로젝트 설정 → Environment Variables 에 `NEXT_PUBLIC_VWORLD_KEY`를 추가합니다(Production/Preview 모두 필요하면 각각 등록). `vercel env add NEXT_PUBLIC_VWORLD_KEY production` 로도 등록할 수 있습니다.
   - 로컬 개발은 `.env.local`(`.gitignore`됨 — 커밋되지 않음)에 같은 키를 넣으면 됩니다.
   - 잘못되었거나 도메인이 등록되지 않은 키는 지도에서 조용히 실패합니다(타일이 안 보일 뿐, 에러가 뜨지 않음) — 브이월드는 잘못된 키에도 200 응답(XML 에러 본문)을 주기 때문입니다. 화면을 직접 확인해 키가 유효한지 판단하세요.
   - (`NEXT_PUBLIC_E2E` 는 Playwright e2e 전용으로 `playwright.config.ts` 가 테스트 실행 시에만 주입하며, 배포본에는 전혀 관여하지 않습니다.)
4. Deploy를 누르면 끝입니다. 이후 `main`(또는 배포 대상 브랜치)에 푸시할 때마다 Vercel이 자동으로 재배포합니다.
5. 데이터를 갱신했다면(아래 "데이터 갱신 절차" 참고) 재빌드된 `public/data/**` 를 포함한 커밋을 푸시하는 것만으로 배포본에도 반영됩니다 — 별도의 배포 시점 데이터 빌드 단계는 없습니다(파이프라인은 로컬/CI에서 미리 실행해 결과 JSON을 커밋하는 방식).

카카오톡 등 공유 미리보기에는 1200×630 PNG와 Open Graph 제목·설명을 사용합니다. 다른 지역으로 배포할 때는 `NEXT_PUBLIC_SITE_URL`을 해당 공개 주소로 설정하고, 경계 데이터를 생성한 뒤 `SOCIAL_PROVINCE_NAME`, `SOCIAL_SHORT_NAME`, `SOCIAL_SITE_HOST`를 지정해 `npm run social:build`를 실행하세요. 생성된 `public/social-preview.png`와 `src/app`의 아이콘 파일을 함께 커밋해야 합니다.

## 데이터 갱신 절차

1. **원천 파일을 `data/raw/` 에 새로 받습니다.** 이 저장소의 파이프라인은 소스 파일의 **기준일자를 파일명에서 직접 읽습니다** — 임의로 "오늘 날짜"를 쓰지 않습니다(`scripts/pipeline/sources.ts`의 `referenceDateFromFilename` 참고):
   - 학교 위치: `한국교육시설안전원_초중등학교위치_YYYYMMDD.csv` (예: `..._20260320.csv` → 기준일 2026-03-20). 파일이 없거나 이 규칙에 맞지 않으면 `data:schools` 가 예상 파일명을 알려주며 실패합니다.
   - 폐교재산 현황: `전북특별자치도교육청_폐교재산 현황_YYYYMMDD.csv` — 마찬가지로 파일명 끝의 날짜가 기준일자입니다.
   - 행정구역 경계: `data/raw/admdongkor-ver20260701.geojson` — 파일명의 `verYYYYMMDD` 가 기준일자입니다. 새 버전을 받으면 `scripts/pipeline/sources.ts`의 `BOUNDARY_SOURCE.url`(vuski/admdongkor의 새 `verYYYYMMDD` 태그)도 함께 갱신해야 합니다.
   - KESS 교육기본통계: `kess-<연도>.xlsx` (예: `kess-2026.xlsx`) — 파일명이 아니라 파일 내용에서 기준일자를 읽습니다(`npm run data:kess` 실행 로그의 `referenceDate=...` 로 확인 가능). `data:kess`가 `data/raw/`에 없는 연도 파일을 자동으로 내려받으려 시도합니다.
2. **`npm run data:build` 를 실행합니다.** `regions → emd → kess → schools → indicators → issues → charset → validate` 순으로 전체 파이프라인이 돌고, 마지막 `data:validate` 단계가 실패하면(학교수/학생수/교원수 공식치 대비 오차, 좌표-시군 정합성, 매칭률 100% 등) 0이 아닌 종료 코드와 함께 무엇이 틀렸는지 표로 보여줍니다 — 이 단계를 통과하지 못한 데이터는 커밋하지 않습니다.
3. **`git status`/`git diff public/data/` 로 실제 변경 내용을 확인합니다.** `public/data/manifest.json`의 `builtAt` 필드는 실행할 때마다 항상 바뀌므로, 그 외 내용이 정말 달라졌는지(지표 값, 연도, 학교 수 등) 확인한 뒤 커밋하세요. `builtAt`만 바뀌고 나머지가 동일하다면(원천 데이터가 그대로인 재실행 등) 그 변경은 커밋하지 않아도 됩니다.
4. `public/data/**`(그리고 필요 시 `data/interim/**`, `data/manual/label-offsets.json` 처럼 수동으로 조정한 파일)를 커밋합니다. `data/raw/**` 는 원천 파일이라 `.gitignore` 로 제외되어 있으니 커밋하지 않습니다.

`data:schools`(및 전체 `data:build`)는 `data/raw/`에서 `한국교육시설안전원_초중등학교위치_` 로 시작하는 CSV 파일을 찾습니다. 수동 매칭 보정은 `data/manual/school-aliases.json`(`"KESS 학교명|시군코드": "위치 CSV 학교ID"`)에 근거(주소 일치 등)가 있는 경우에만 추가합니다. 시군 라벨이 겹쳐 보이는 경우의 픽셀 보정값은 `data/manual/label-offsets.json`(`{ "지역코드": [dx, dy] }`)에 있으며, `data:regions` 가 이를 읽어(1px ≈ 250m, `build-regions.ts`의 `LABEL_OFFSET_METERS_PER_PX`) `regions.geojson`의 `properties.labelPoint` 자체를 지리적으로 옮깁니다 — CollisionFilterExtension의 충돌 가시성 판정이 라벨의 원래(오프셋 미반영) 앵커 좌표를 쓰기 때문에, 렌더 타임 픽셀 오프셋 대신 빌드 타임에 앵커를 옮겨야 라벨이 항상 보입니다.


## 데이터 갱신 검토표

- 원천 파일의 실제 기준일·게시일·확인일을 구분하고 파일명과 출처 URL을 확인합니다.
- 학교 수·학생 수·교원 수 등 공식 집계와 대조하고, 신규·폐교·명칭 변경의 원인을 기록합니다.
- 결측값은 0으로 바꾸지 않습니다. 학교 식별자·좌표 없는 학교 수·지역 불일치 경고·매칭률을 검토합니다.
- `npm run data:validate`를 통과한 뒤 `git diff -- public/data data/interim`으로 값·범위·연도를 확인합니다.
- `manifest.builtAt`만 바뀌는 재생성은 실질적인 데이터 갱신으로 기록하지 않습니다.
- 학교 자료와 교육문제 자료를 함께 생성하고 검증합니다. 원자료는 저장소에 넣지 않습니다.
- 데이터 갱신 내역은 [변경 기록](../CHANGELOG.md)에 기능 변경과 구분해 남깁니다.

## 검증과 장애 확인

```bash
npm run docs:check
npm run data:validate
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run e2e -- --workers=1
```

일반 CI는 배경지도·건물 API 응답을 fixture로 대체합니다. 데이터 요청 실패 후 재시도, WebGL 미지원·실행 중 손실, 표 대체 화면의 학교 상세, 건물 API 실패 후 재시도를 포함합니다.

Chromium·Firefox·WebKit의 선택 검사 설정은 `playwright.cross-browser.config.ts`입니다. 브라우저 설치와 대상 시나리오를 포함한 재현 명령은 [전체 검수 기록](FULL_REVIEW.md)에 있습니다. 기본 자료와 교육문제 자료는 앱을 열 때 조건부 재검증하므로 이전 배포의 브라우저 캐시와 새 자료가 섞이지 않도록 합니다.

실제 API와 배포 주소 검사는 GitHub Actions의 **External verification**을 수동 실행합니다. `live-local`은 저장소 secrets `NEXT_PUBLIC_VWORLD_KEY`, `VWORLD_BUILDING_KEY`, 필요 시 `VWORLD_BUILDING_DOMAIN`을 사용합니다. `deployment`는 이미 배포된 사이트의 URL을 입력합니다. 이 워크플로는 사이트를 배포하지 않습니다.

로컬에서 실제 건물을 검증하려면 환경변수를 불러온 뒤 `LIVE_BUILDINGS=1 npm run e2e -- e2e/city-buildings-live.spec.ts --workers=1`을 실행합니다. 배포 주소 검사는 `DEPLOYMENT_URL=https://example.com npm run e2e -- 'e2e/deployed-.*.spec.ts' --workers=1`로 실행합니다. 키는 명령 기록에 직접 넣지 않습니다.

장애별 확인:

- 배경이 비어 있으면 VWorld 도메인 등록과 키를 확인합니다. 잘못된 키도 HTTP 200 XML 오류를 반환할 수 있습니다.
- 건물은 입체 모드의 근접 확대에서 표시합니다. 키 미설정·서버 비활성화와 외부 API 실패를 구분하고 화면의 재시도 안내를 확인합니다.
- 지도 그래픽 오류에서는 표 화면으로 학교 상세와 통계에 접근하고 평면 복구를 시도합니다.
- 데이터 갱신 안내가 계속되면 manifest와 지표 파일의 배포 일치 여부를 확인합니다.

## 성능 재측정

```bash
NEXT_PUBLIC_E2E=1 NEXT_PUBLIC_VWORLD_KEY=e2e-test npm run dev -- -p 3100
# 별도 터미널
npm run perf:measure
```

`MEASURE_URL`, `MEASURE_OUTPUT`으로 대상과 결과 파일을 바꿀 수 있습니다. 같은 서버 모드·기기·브라우저에서 실행하며, 1440×900과 390×844에서 각각 새 브라우저 컨텍스트 3회로 지도 준비·학교 검색·지표 전환·첫 근접 건물 요청과 fixture 건물 레이어의 로드 후 렌더 콜백까지 측정합니다. 외부 API는 fixture이므로 실제 네트워크 지연이나 실제 휴대전화 FPS를 나타내지 않습니다. [업그레이드 검증 기록](UPGRADE_VALIDATION.md)에 측정 조건과 결과를 보관합니다.

## 릴리스

미리보기에서 기능·모바일 화면을 확인한 뒤 프로젝트의 기존 배포 절차를 사용합니다. 기능, 데이터, URL 호환성 변경을 [변경 기록](../CHANGELOG.md)에 나눠 적고 실제 운영 반영 여부를 명시합니다. 이 저장소의 로컬 변경만으로 운영 배포 완료를 선언하지 않습니다.
