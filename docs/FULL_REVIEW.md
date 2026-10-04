# 전체 검수 기록 — 2026-10-04

기준 배포는 `2c3023f`입니다. 이 검수에서는 현재 코드·생성 자료·운영 배포를 확인하고, 아래 두 문제를 수정했습니다. 원천 자료와 생성 통계값은 변경하지 않았습니다.

## 재현하고 수정한 문제

### 연속 입력 직후 이동 시 뒤로가기에서 조건 손실

`전`을 입력한 직후 `전주초등학교`로 바꾸고 탭을 누르면, nuqs의 URL 갱신 대기 중 검색과 새 기록 추가가 합쳐졌습니다. 뒤로가면 마지막 검색어 대신 `전`이 남았습니다. 기존 debounce 제거만으로는 기본 throttle 구간까지 해결되지 않았습니다.

필터의 URL 반영 Promise가 완료된 뒤 이동 기록을 추가하도록 바꿨습니다. 탭·교육문제·지역 선택·학교 선택·평면/입체·학교 차트 전환에 적용했습니다. 기다리는 동안 브라우저 뒤로가기·앞으로가기를 사용하면 예약된 이동을 취소합니다. 학교급 변경과 필터 초기화도 같은 순서를 따릅니다.

수정 전 컴포넌트 테스트와 실제 Chromium 모두 실패를 재현했습니다. 수정 후 세 브라우저의 6개 이동 경로 총 18개 검사를 통과했습니다. 시간 제어로 짧은 경쟁 구간을 재현하며 임의의 기기 속도에 의존하지 않습니다.

### 자료 갱신 후 이전 브라우저 캐시 사용

기본 자료는 최대 한 시간의 브라우저 캐시를 사용할 수 있지만 교육문제 자료는 매번 재검증했습니다. 이 차이로 배포 후 이전 학교·통계 자료와 새 교육문제 자료가 섞일 수 있었습니다. 프로덕션 서버에서 브라우저 캐시를 채우고 서버 파일만 변경했을 때 기본 fetch가 이전 자료를 반환하는 것을 재현했습니다.

기본 자료 요청에도 `cache: "no-cache"`를 적용했습니다. 변경되지 않은 응답 본문은 조건부 요청으로 재사용할 수 있습니다. 수정 후 이전 학교 자료를 캐시에 남겨 둔 실제 브라우저에서 새 학교 이름이 검색되는 것을 확인했습니다. 이 실험은 별도 검수 작업 폴더에서 실행하고 원본 파일을 복구했습니다.

## 검증 범위

| 영역 | 확인 내용 | 근거 |
| --- | --- | --- |
| 검색·기록·공유 | 학교명/학교급, 6개 이동 경로, 취소, 새로고침, 복사 실패 대체 UI | history-races, url-state, comparison-sharing E2E 및 컴포넌트 검사 |
| 일반 지표·비교 | 18개 지표 순회, 두 지역 유지, 차이·단위·결측, CSV 전체 범위 | metric-coverage, comparison-sharing, comparison-export |
| 교육문제 | 10개 질문의 모든 지표, 특수학교와 특수학급 분리, 폐교·기관 명단, 학교급 | metric-coverage, issues, closed-schools, issue 모델 검사 |
| 추이 | 두 지역 공통 축, 연도 선택, 단일 연도, 누락 구간, null과 0 | time-series, TimeSeriesChart |
| 지도 | 학교 선택·HUD, 입체/평면·배경·읍면동, 건물 요청·복구 | school-chart, select-region, city-buildings, education-city, emd |
| 화면·접근성 | 360/390/1024/1280/1440/1600px, 가로 넘침·겹침, 키보드·포커스 | control-room, comparison-sharing, a11y |
| 실패 복구 | WebGL 미지원·컨텍스트 손실, 기본/교육문제 데이터 실패·재시도 | fallback-webgl, fallback-viewport, debug-regressions, issues |
| 데이터·서버 | 14개 시군과 18개 지표, 공식 총계, 건물 API 입력·응답·시간 제한 | data:validate, load, buildings |
| 재현성 | Node 22 clean install, 타입·lint·단위 검사·production build, 문서 링크 | npm 스크립트 및 GitHub CI |

## 실행 결과

- Node.js 22.23.3, lockfile 기반 clean install. 별도 작업 폴더에서 단위·컴포넌트 **842개 / 64개 파일 통과**, 타입 검사·데이터 검증·문서 링크 검사·production build 통과.
- 깨끗한 소스의 lint 오류·경고 0. 사용자 작업 폴더의 기존 미추적 `.superpowers/collision-check.mjs` 경고는 이 배포에 포함되지 않습니다.
- Chromium 153.0.8010.12의 전체 **90개 시나리오**를 검사했습니다. 89개는 전체 실행에서 통과했고, 유효한 범례의 “특수학교 포함” 안내를 누락한 테스트 기대값 1개를 수정한 뒤 해당 시나리오도 통과했습니다. 이 기대값 보정으로 앱 동작을 변경하지 않았습니다.
- Firefox 155.0 **29개**, WebKit 26.6 **29개**가 최종 실행에서 모두 통과했습니다. 모든 실행의 재시도 설정은 0입니다. macOS WebKit의 버튼 이동은 [Safari의 기본 키보드 동작](https://support.apple.com/guide/safari/cpsh003/mac)에 맞춰 Option-Tab으로 검사했습니다. 일반 Tab이 버튼을 건너뛰는 동작은 앱이 없는 단순 HTML에서도 재현했으며 시스템 설정을 변경하지 않았습니다.
- [구조화된 검증 결과](validation/full-review.json)에 시나리오별 결과, 첫 기대값 실패와 재검증, 브라우저 버전, 캐시 재현 전후, 검사 대상 소스 지문을 보관했습니다.
- API 키·`.env.local`·E2E 전용 설정이 없는 production build에서도 지도·학교 검색·CSV·질문 번호를 실제 브라우저로 확인했습니다. 외부 VWorld 요청 0, page error 0, E2E 전용 전역 객체 없음. 건물 API는 키 미설정 상태를 나타내는 503을 반환했습니다.

## 재현 명령

```bash
nvm use
npm ci
npm run data:validate
npm run docs:check
npm run typecheck
npm run lint
npm test
CI=1 PW_PORT=3110 npm run e2e -- --workers=1 --retries=0

npx playwright install chromium firefox webkit
CI=1 PW_PORT=3111 npx playwright test -c playwright.cross-browser.config.ts \
  e2e/history-races.spec.ts e2e/metric-coverage.spec.ts \
  e2e/comparison-sharing.spec.ts e2e/a11y.spec.ts \
  e2e/fallback-viewport.spec.ts --project firefox --project webkit
```

기본 CI는 Chromium 전체 검사를 유지합니다. 선택 설정은 세 엔진을 제공하며 Chromium 전용 WebGL 비활성화 플래그를 Firefox/WebKit에 적용하지 않습니다. 외부 API의 실제 동작은 [운영 안내](OPERATIONS.md)의 External verification으로 따로 확인합니다.

## 검증의 한계

브라우저 엔진 검사는 macOS의 headless 환경이며 물리 휴대전화의 GPU·터치·성능을 보장하지 않습니다. 기본 E2E의 외부 지도·건물 응답은 fixture입니다. 실제 운영 API 확인은 별도로 구분합니다. 기존 원천 좌표와 행정구역이 일치하지 않는 전주원동초등학교 1건은 원자료의 알려진 차이로 남겨 두었습니다. 출처 근거 없이 통계나 좌표를 변경하지 않았습니다.

성능 전후 수치는 [업그레이드 검증 기록](UPGRADE_VALIDATION.md)을 참고하세요. 이 검수로 속도 향상을 주장하지 않습니다.

## 후속 검수: 학교 클릭 후 드래그 고착

사용자 제보로 `e499006` 운영 사이트에서 재현했습니다. 학교 점을 클릭하고 버튼을 놓은 뒤 마우스만 움직였는데 학교의 화면 위치가 약 126px, -72px 이동하고 커서가 `grabbing`으로 남았습니다. 모든 후속 이동 이벤트의 `buttons`는 0이었습니다. 기존 학교 선택 검사는 HUD가 열리는지만 확인하여 클릭 이후의 잘못된 이동을 놓쳤습니다.

학교 선택용 `onPointerUpCapture`의 `stopPropagation()`이 원인이었습니다. `pointerup`은 문서 캡처 단계에서 1번 관측됐지만 window 버블 단계에는 0번 도착했습니다. 지도 입력 처리기(mjolnir.js)는 window의 `pointerup`으로 눌린 포인터를 해제하므로 이후의 hover를 드래그로 처리했습니다.

버튼 해제 단계의 별도 학교 선택 처리를 제거하고, 점 주변의 넓은 선택 범위는 deck.gl의 완료된 클릭 처리로 옮겼습니다. 데스크톱 9px·모바일 14px의 추가 선택 범위와 전체보기의 지역 선택 규칙을 유지합니다. 실제 드래그에서는 학교가 잘못 선택되지 않으며 정상적인 관성 이동 후 멈춰야 합니다.

실제 건물을 표시한 운영 검증에서는 짧은 탭만 인식하는 지도 제스처의 클릭 누락도 발견했습니다. 400ms 동안 누른 뒤 놓으면 학교 선택이 실패하는 것을 자동 검사로 재현했습니다. `pointerup` 이후 발생하는 브라우저 `click`으로 누락된 학교 선택을 처리하되, 이미 deck.gl이 처리한 클릭과 도중에 6px 넘게 움직인 드래그는 제외합니다. 이 처리에서는 어떤 버튼 해제 이벤트도 차단하지 않습니다.

`e2e/school-point-details.spec.ts`에 평면·입체 지도 각각의 점/주변 클릭 후 버튼 없는 마우스 이동, 실제 드래그 종료 후 hover, 다시 선택, 모바일 연속 탭 검사를 추가했습니다. 선택 애니메이션의 정상 이동과 오류를 구분하도록 카메라가 멈춘 뒤 비교합니다. 브라우저 내 비동기 안정화 검사는 `expect.poll`로 결과를 기다리고, 첫 화면의 글꼴·레이어 준비도 확인합니다.

후속 검사에서 단위·컴포넌트 842개, 타입 검사, 변경 파일 lint, 문서 검사와 production build를 통과했습니다. Chromium의 학교 점·학교 차트·시군 선택 18개, Firefox와 WebKit의 학교 점 각 10개 시나리오를 확인했습니다. 첫 Chromium 실행의 클릭 전 화면 안정화 시간 초과 1건은 글꼴 준비 대기와 충분한 안정화 대기를 적용한 최종 실행에서 통과했습니다. 테스트 전용 객체가 없는 production build에서도 Firefox의 평면·입체 지도에서 버튼 해제 이벤트가 window까지 도착하고, 클릭 후 hover에 따른 학교 위치 변화가 0px임을 확인했습니다.

느린 클릭 처리까지 포함한 최종 학교 점 검사는 Chromium·Firefox·WebKit 각 12개, 총 36개를 재시도 없이 통과했습니다. 평면·입체 각각의 400ms 클릭과 버튼 없는 후속 이동을 포함합니다.

```bash
PW_PORT=3120 npx playwright test e2e/school-point-details.spec.ts \
  e2e/select-region.spec.ts e2e/school-chart.spec.ts --workers=1
PW_PORT=3120 npx playwright test -c playwright.cross-browser.config.ts \
  e2e/school-point-details.spec.ts --project firefox --project webkit
```
