# 전체 디버깅 진단 — 2026-09-23

## 최종 요약

확인된 애플리케이션 오류 4개를 수정했다. 단위 테스트 820개와 전체 브라우저 시나리오 74개가 통과했다(실제 건물 API 시나리오 포함, skip/실패 없음). 타입 검사·데이터 검증·production 빌드도 통과했다. 수정본은 로컬 작업 트리에 있으며 커밋·운영 배포는 하지 않았다. 간접 의존성 보안 경고 및 원자료 참고 사항은 아래 별도 위험에 남겨 두었으며, 보안 무결점 판정은 아니다.

## 대상과 상태

- 기준 커밋: `51361e2b642d0a4f83f6d9d7cc3aa8e6e91f37df`
- 운영 사이트: https://jb-edu-map.vercel.app
- 아래 초기 진단은 기준 커밋에서 수행했다. 후속 작업에서 애플리케이션 코드와 회귀 테스트를 수정했다. 원자료·의존성·운영 배포는 변경하지 않았다.
- Chromium에서 자동 테스트와 장애 주입을 실행하고, 운영 화면·API 및 소스 구현을 대조했다.

## 초기 진단에서 확인한 실제 오류

### 1. 실행 중 그래픽 컨텍스트 손실 시 복구 안내가 나타나지 않음 — 높음

- 운영 사이트에서 지도가 준비된 뒤 실제 canvas의 `WEBGL_lose_context.loseContext()`를 호출했다.
- `isContextLost() === true`, `webglcontextlost` 이벤트 1회 발생을 확인했다. 이후 지도 표현 버튼을 눌러도 `그래픽 컨텍스트가 끊겼습니다` 안내는 0개였다.
- 초기부터 WebGL을 사용할 수 없는 경우의 표 대체 화면과는 별개인 장애다. 실행 중 GPU 컨텍스트를 잃으면 지도 렌더링이 멈추는데 복구 경로가 표시되지 않는다.
- 원인: `src/components/map/DeckMap.tsx:317`의 처리는 deck.gl `onError`에만 의존한다. `onDeviceInitialized`(1248행)는 밀도 지원 여부만 확인한다. 설치된 luma.gl의 손실 이벤트는 `device.lost` Promise를 resolve하지만 이 앱은 구독하지 않는다. 설치된 deck.gl 소스의 `_onContextLost`에는 호출 연결이 확인되지 않는다.
- 수정 방향: 실제 canvas 손실 이벤트 또는 `device.lost`를 구독하고, 해제/재마운트 처리 및 복구 버튼의 동작까지 회귀 테스트한다.
- 증거: `test-results/debug-context-loss-production.png`.

### 2. WebGL 대체 화면에서 학교 상세정보를 볼 수 없음 — 높음

- Chromium의 `getContext('webgl2')`가 null을 반환하도록 한 뒤 표 대체 화면을 확인했다.
- `학교·통계 → 학교명 검색 → 전주초등학교 → 검색 결과 선택`으로 재현했다.
- 선택 후 URL에 `school=B000005959`가 들어가지만 패널은 닫히고 HUD는 0개, 전주초등학교 제목도 0개였다.
- 원인: `src/components/Dashboard.tsx:225`는 학교의 좌표 유무만 보고 패널을 닫는다. 370행은 좌표가 있는 학교의 패널 상세정보를 항상 제외한다. 실제 지도 사용 가능 여부는 반영되지 않는다. `MapShell`의 표 대체 화면에는 학교 HUD가 없다.
- 수정 방향: 지도 사용 불가/오류 상태에서는 학교 상세정보를 패널에 표시하고 선택 시 패널을 유지한다. 학교 선택 취소와 시군 통계 이동도 함께 검증한다.

### 3. 범례의 단위 중복 — 보통

- 운영 사이트의 지표 버튼을 전부 전환하면서 다음 실제 표시를 확인했다.
  - 학생수 5년 증감률: `전북 전체 -12.5%%`
  - 소규모학교 비율: `전북 전체 41.3%%`
  - 면지역 학교 비율: `전북 전체 43.4%%`
  - 학생 1인당 교지면적: `전북 전체 85㎡㎡`
- 원인: `src/lib/mapMetrics.ts:205`가 단위를 이미 포함하는 `def.format()` 결과에 `def.unit`을 다시 붙인다.
- 수정 방향: 기존 `src/lib/tooltipText.ts:30`의 `formatWithUnit`을 재사용하고 모든 등록 지표의 요약 문자열을 검증한다.
- 증거: `test-results/debug-duplicate-unit-production.png`.

### 4. 지역소멸 기본 지표 이름 누락 — 보통

- 운영 사이트의 `/?view=issues&issue=regional-sustainability`에서 상단에 `전체 지표 · undefined ▾`가 나타난다.
- 교육문제 패널의 선택된 지표 버튼도 텍스트가 비어 있다. 시각적 표시뿐 아니라 접근 가능한 버튼 이름도 누락된다.
- 원인: profile은 기본 지표로 `decline-small`을 등록했지만 `src/lib/issues/registry.ts:16`의 `METRIC_LABELS`에는 이 키가 없다. `IndicatorMenu.tsx:61`, `IssueExplorer.tsx:216`에서 그대로 조회한다.
- 수정 방향: 지표 이름을 등록하고 모든 공개 지표에 이름이 존재한다는 불변 조건 테스트를 추가한다.
- 증거: `test-results/debug-undefined-label-production.png`.

## 수정 전 자동 검사 결과

| 검사 | 결과 |
| --- | --- |
| `npm run test` | 60개 파일, 816개 테스트 통과 |
| `npm run typecheck` | 통과 |
| `npm run lint` | 오류 0, 기존 unused 변수 경고 2 |
| `npm run build` | 통과 |
| `npm run data:validate` | 통과, 18/18 지표 파일 확인 |
| 기본 전체 E2E (`--workers=1`) | 58 통과, 5 실패, 조건부 7 제외; 11.2분 |
| 운영 사이트 E2E 5개 별도 실행 | 2 통과, 3 실패 |
| 실제 건물 데이터 E2E 2개 별도 실행 | 1 통과, 1 실패 |

조건부 시나리오도 별도 실행했으므로 고유 E2E 70개를 모두 시도했다. 합계는 **61 통과, 9 실패**다. 재시도는 고유 테스트 수에 더하지 않았다. 테스트 전체 통과 상태가 아니다.

### 실패 9개의 원인

| 위치 | 실패 원인 / 필요한 테스트 갱신 |
| --- | --- |
| `e2e/closed-schools.spec.ts:13` | 닫힌 패널의 시군 통계 탭을 바로 클릭한다. 패널 열기 단계 누락. |
| `e2e/emd.spec.ts:59` | 같은 패널 열기 단계 누락. 90초 제한으로 재시도까지 실패. |
| `e2e/education-city.spec.ts:30` | 데스크톱 지도 설정이 숨겨져 있다고 가정한다. 현재 요구는 상시 노출이다. |
| `e2e/issues.spec.ts:47` | 상단과 패널의 동명 `소규모학교 비율` 버튼을 구분하지 못해 strict mode 위반. 패널로 범위를 제한해야 한다. |
| `e2e/school-chart.spec.ts:84` | 모바일 크기로 전환한 뒤 접힌 지도 설정을 열지 않고 `점`을 클릭한다. |
| `e2e/deployed-city.spec.ts:18` | 데스크톱에서 숨겨진 `지도 설정` summary를 클릭한다. 설정은 이미 펼쳐져 있다. |
| `e2e/deployed-school-chart.spec.ts:13` | 위와 같은 summary 클릭 가정. |
| `e2e/deployed-special-schools.spec.ts:22` | 접힌 검색 패널을 열지 않고 학교급 필터를 클릭한다. |
| `e2e/city-buildings-live.spec.ts:81` | 작은학교 주제에 학생 228명의 전주초를 선택한 링크를 사용한다. 기본 `decline-small` 필터에서 학교가 제외되어 선택이 해제되고 광역 보기로 돌아가므로 근접 건물 조회 문구가 없다. 해당 주제에 실제 포함되는 학교를 사용해야 한다. |

실패 로그는 `test-results/**/error-context.md`, `test-results/deployed-audit/**/error-context.md`, `test-results/live-audit/**/error-context.md`에 있다. 이 경로는 다음 테스트 실행 때 교체될 수 있다.

## 추가 실제 동작 검증

- 1440×900, 1024×768, 390×844, 360×640: 전체 지도 크기, HUD와 컨트롤 비겹침, 가로 넘침 없음, 패널 열기/닫기 검사 통과.
- 운영 1024×600: 학교 HUD가 화면 안에 들어오며 컨트롤과 겹치지 않음.
- 운영 18개 지표 버튼 전환 중 pageerror 없음. 별도로 위의 단위 중복을 발견함.
- 데이터 요청 503 주입 후 재시도로 지도 복구 성공.
- 잘못된 지표·지역·학교·질문 URL 입력 시 기본 지표로 복귀, 잘못된 학교 선택 제거.
- 모바일 패널에서 Tab 40회 후 포커스가 패널 안에 유지되며 Escape로 닫힘.
- 운영 폐교 목록: 현재 메뉴 동선으로 군산시 14개 행 표시 확인.
- 운영 읍면동 경계 설정: 끄기, 새로고침 후 유지, 다시 켜기 확인.
- 운영 교육문제: 패널 내부 지표 선택 후 새로고침 시 `small-share`와 진안군 관련 학교 18개 복원 확인.
- 운영 건물 API `/api/buildings/v1/16/55913/25774`: HTTP 200, 건물 711개. 범위 밖 타일은 HTTP 400 및 `no-store`.
- 실제 건물 이동/캐시 시나리오: 통과, 페이지 오류 없음, 최대 64타일 및 추정 디코딩 데이터 45,161,196바이트로 설정 한도 안에 있음.
- 프레임 측정은 SwiftShader 소프트웨어 렌더러에서 desktop 약 2.36 FPS, mobile viewport 약 4.90 FPS. 실제 GPU나 실제 휴대전화 성능으로 일반화할 수 없으며 성능 합격으로 판정하지 않음. 원본: `test-results/live-building-metrics.json`.

## 별도 위험 및 제한

- `npm audit --omit=dev --json`: 영향 패키지 11개(높음 8, 보통 3). 주로 deck.gl 간접 의존성의 `image-size`, `fflate` 보안 권고가 상위 패키지로 전파된 결과이며, 서로 독립적인 취약점 11개라는 뜻은 아니다. 런타임 악용은 재현하지 않았다. 자동 수정이 주요 패키지 다운그레이드를 제안하므로 `npm audit fix --force`는 실행하지 않았다.
- 앱 페이지 및 건물 API의 production 파일 추적 목록에서 해당 취약 간접 패키지는 발견되지 않았다. 이것만으로 모든 클라이언트/빌드 경로가 안전하다는 판정은 할 수 없다.
- 데이터 검증 참고: 전주원동초의 통계상 전주시 코드와 좌표가 포함된 완주군 경계가 다르다는 기존 경고 1건. 자동으로 원자료를 고치지 않았다.
- README에 밝은 테마·특수학교 좌표 부재 등 현재 구현과 다른 설명이 남아 있다.
- 이 검사는 Chromium 및 이 장비의 소프트웨어 GPU 환경을 대상으로 한다. Safari/Firefox, 실제 모바일 하드웨어, 장기간 부하, 정식 침투 테스트를 수행했다는 의미가 아니다.

## 수정 내역과 후속 검증

- 그래픽 손실: 비동기로 생성되는 canvas의 `webglcontextlost`를 부모에서 capture해 복구 안내를 표시한다. 리스너 cleanup을 포함하며 라이브러리의 오류 콜백 전달 여부에 의존하지 않는다.
- 지도 대체 화면: `MapShell`이 선택된 학교와 동작 콜백을 오류/미지원 대체 화면 모두에 전달한다. 표 위에 기존 `SchoolDetail`을 재사용하며 선택 시 스크롤·키보드 포커스를 이동한다. 좌표 없는 학교의 기존 패널 경로는 유지한다.
- 단위: `formatWithUnit` 재사용. 퍼센트·면적·명 단위 요약을 회귀 테스트한다.
- 지표 이름: `decline-small` 이름 등록. 모든 공개 질문의 모든 지표에 이름이 존재하는지 검사한다.
- 테스트: 현재 메뉴 개폐 동선과 버튼 영역을 명시한다. 실제 건물 테스트는 지역소멸의 기본 복합 지표를 유지하면서 해당 주제에 포함되는 작은학교를 실제 데이터에서 선택한다. 테스트를 skip하거나 기본 지표를 더 쉬운 다른 지표로 바꾸지 않았다.
- 문서: 야간 테마, 상시 지표 버튼, 학교 HUD/대체 상세 화면, 특수학교 위치 및 시계열 안내를 현재 구현에 맞췄다.

수정 후 최종 검사: 단위 테스트 820개, 타입 검사, 데이터 검증, 빌드 통과. Lint 오류 0이며 기존 경고 2개는 유지된다. 집중 브라우저 검사 32개가 통과했고, 최종 전체 **74개 시나리오가 10.1분에 모두 통과**했다. `test-results/debug-final/.last-run.json`은 `status: passed`, `failedTests: []`다.

최종 실행 명령:

```sh
npm run test
npm run lint
npm run typecheck
npm run data:validate
npm run build
LIVE_BUILDINGS=1 PW_PORT=3100 DEPLOYMENT_URL=http://localhost:3100 node --env-file=.env.local node_modules/@playwright/test/cli.js test --workers=1 --output=test-results/debug-final
```

`DEPLOYMENT_URL` 테스트들도 수정본을 실행하는 로컬 서버를 대상으로 검증했다. 운영 사이트의 수정 완료를 주장하는 결과는 아니다. 실제 건물 조회는 VWorld API로 실행했고 나머지 테스트는 각 기존 fixture의 네트워크 조건을 유지했다.

| 수정 항목 | 최종 근거 |
| --- | --- |
| 그래픽 손실 감지 및 복구 | `e2e/debug-regressions.spec.ts`: 실제 컨텍스트 손실 주입, 안내 표시, 평면 복구 후 정상 context와 학교·시군 URL 유지 |
| 대체 화면 학교 상세 | `e2e/fallback-webgl.spec.ts`: 데스크톱·모바일 선택, 포커스, 상단 비겹침, 재조회, 통계 이동, 선택 해제; `MapFallback.test.tsx`: WebGL 미지원·오류 화면 모두 상세 동작 |
| 단위 중복 | `tests/unit/mapMetrics.test.ts`: 비율 3종·면적·학생수 정확한 요약 문자열; 브라우저에서 `%%` 부재 확인 |
| 누락 지표 이름 | `tests/unit/issues.test.ts`: 공개 지표 전체 이름 검사; 브라우저에서 기본 질문의 메뉴 이름·선택 버튼 확인 |
| 기존 테스트 9개 실패 | 최종 전체 실행에서 실제 API·사이트 시나리오를 포함한 74개 통과; 제외/검증 약화 없이 현재 동선·필터에 맞춤 |

추가 화면 확인: `test-results/fallback-fixed-1440.png`, `test-results/fallback-fixed-390.png`. 모바일에서 상세 카드와 표가 함께 보이며 고정 헤더와 겹치지 않는다.

### 초기 작업 순서 (아래 검증으로 완료 여부 확인)

1. 그래픽 손실 감지와 표 대체 화면의 학교 상세정보 경로 복구.
2. 누락 지표 이름과 단위 중복 수정, 각각 회귀 테스트 추가.
3. 현재 UI와 주제 범위에 맞춰 실패한 테스트 9개 갱신. 실패를 숨기기 위한 skip/검증 약화는 하지 않음.
4. 전체 재검증 후 수정본 배포 여부 결정. 운영 사이트에는 아직 수정본을 배포하지 않았다.
