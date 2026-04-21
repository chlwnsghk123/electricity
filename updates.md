# Updates

## v1.02 — 2026-04-21
- `app.js` 초기 구현(진행 중): 상수/스토리지 키, 전역 state, 유틸(el/debounce/toast/formatTime/renderMarkdownInline), localStorage 헬퍼(per-exam 스코프 북마크/태그/답), 데이터 로드·부트스트랩, 홈/리스트/상세/결과 렌더 함수 추가
- 데이터의 `subject` 번호(1~5) → 이름 매핑을 `state.subjectBy`로 처리
- 남은 작업: 모드 진입 플로우(`enterMode`), 모의고사 타이머, 이벤트 바인딩, AI 바텀시트 로직

## v1.01 — 2026-04-20
- 데이터 파일을 `data/` 디렉토리로 재배치: `exam_2022_r2.json` → `data/electricity-2022-r2.json`
- `data/index.json` manifest 추가 (회차/시험 확장 대비)
- `updates.md` 초기화

## v1.00 — 2026-04-20
- `CLAUDE.md` 추가 (AI 에이전트 프로토콜, 프로젝트 구조, 핵심 알고리즘, Toss 라이트 테마 원칙)
- 초기 베이스라인: `cbt_full.html` 단일 파일 앱 + 전기기사 2022년 2회 100문제 데이터
