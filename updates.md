# Updates

## v1.04 — 2026-04-21
- Vercel 빌드 실패 수정: `vercel.json`(buildCommand no-op, outputDirectory `.`) + `package.json`에 no-op `build` 스크립트 추가. 정적 + Serverless 구조이므로 실제 빌드 단계는 없음.

## v1.03 — 2026-04-21
- `app.js`에 모드 진입(`enterMode`: 학습/과목/모의고사/북마크), 모의고사 150분 타이머(경고색/자동 제출), 이벤트 위임 바인딩 추가
- AI 바텀시트 열기/닫기/드래그 닫기, 추천 질문 3종, 로딩/에러 메시지, 인라인 Markdown 렌더 구현
- `api/ask.js` Vercel Serverless 함수 추가: `VITE_GEMINI_API_KEY`/`GEMINI_API_KEY` 로드, `gemini-3-flash-preview` 우선 + `gemini-1.5-flash` 백업, 문맥 + 히스토리 기반 답변
- `package.json` 추가(`@google/generative-ai` 의존성, `type: module`)
- 레거시 `cbt_full.html` 삭제

## v1.02 — 2026-04-21
- `app.js` 초기 구현(진행 중): 상수/스토리지 키, 전역 state, 유틸(el/debounce/toast/formatTime/renderMarkdownInline), localStorage 헬퍼(per-exam 스코프 북마크/태그/답), 데이터 로드·부트스트랩, 홈/리스트/상세/결과 렌더 함수 추가
- 데이터의 `subject` 번호(1~5) → 이름 매핑을 `state.subjectBy`로 처리

## v1.01 — 2026-04-20
- 데이터 파일을 `data/` 디렉토리로 재배치: `exam_2022_r2.json` → `data/electricity-2022-r2.json`
- `data/index.json` manifest 추가 (회차/시험 확장 대비)
- `updates.md` 초기화

## v1.00 — 2026-04-20
- `CLAUDE.md` 추가 (AI 에이전트 프로토콜, 프로젝트 구조, 핵심 알고리즘, Toss 라이트 테마 원칙)
- 초기 베이스라인: `cbt_full.html` 단일 파일 앱 + 전기기사 2022년 2회 100문제 데이터
