# 아키텍처 (ARCHITECTURE)

## 0. 한 줄 요약

빌드 단계가 없는 **정적 SPA (Vanilla JS) + Vercel Serverless 1개**. 모든 화면 전환은 `state.view` 변경 + DOM 표시 토글로 처리한다.

---

## 1. 파일 트리

```
/
├── index.html               # 5개 화면 + 3개 바텀시트 마크업
├── styles.css               # 전역 스타일 (Toss 라이트 테마 토큰)
├── app.js                   # 단일 파일, 6개 Part 섹션으로 구성 (1500줄+)
├── api/
│   └── ask.js               # Gemini 프록시 (멀티모달, ESM)
├── data/
│   ├── index.json           # 회차 manifest
│   └── electricity-*.json   # 회차별 100문제 데이터
├── images/
│   ├── README.md            # 폴더 전체 설명
│   └── electricity-*/
│       ├── README.md        # 회차별 필요 이미지 표
│       └── *.png            # <no>.png 또는 <no>-<k>.png
├── tools/
│   └── latexify.cjs         # 일회성 유니코드 → LaTeX 변환 스크립트
├── docs/                    # 모든 디테일 문서 (이 폴더)
├── CLAUDE.md                # 에이전트 진입점 (얇음)
├── PLAN.md                  # 향후 작업 + Phase 로드맵
├── updates.md               # 변경 이력 (vN.NN 단위)
├── package.json             # @google/generative-ai 단일 의존성
├── manifest.webmanifest     # PWA
├── icon.svg / favicon.svg   # 앱 아이콘
└── (vercel.json 없음 — 기본값으로 동작)
```

## 2. app.js 섹션 맵

```
Part 1 (1~221)    상수, state, 유틸 (qs, el, debounce, toast, formatTime,
                  escapeHtml, renderMarkdownInline, show, shuffle, uid, renderMath)
Part 2 (222~365)  localStorage 헬퍼 (loadLS/saveLS/patchLS/_scope), per-exam 헬퍼
                  (북마크/태그/메모/답), 데이터 로드 (loadManifest/loadExam),
                  과목명 매핑
Part 3 (366~852)  렌더 (renderHome, renderModes, renderList, renderDetail,
                  renderQuestionCard, renderNotesList, grade, renderResult)
                  + 태그 팝오버, 메모 폼·long-press 삭제
Part 4 (854~1104) 모드 진입(enterMode), 모의고사(full/half) 셔플·시작·제출,
                  랜덤 학습 진입·다음, 타이머, 선택 바텀시트
Part 5 (1106~1323) AI 바텀시트(렌더, 메시지 송신, 멀티모달 이미지 수집,
                   드래그 닫기, 메모 저장)
Part 6 (1325끝)   설정 시트, bindEvents, bootstrap, DOMContentLoaded
```

라인 번호는 변할 수 있다. 빠르게 찾으려면 `grep -n "^// Part\|^function "` 또는 `grep -n "^// ----------"` 사용.

## 3. 화면 흐름

```
[home]  회차 선택
  ↓ 회차 클릭 → loadExam(id)
[modes] 학습 / 랜덤 학습 / 모의고사 카드
  ↓ 학습              ↓ 랜덤 (과목 선택 시트)   ↓ 모의고사 (정식/하프 시트)
[list]  필터+카드 리스트  [detail] (랜덤 1문제)    [detail] (셔플된 examSet 순회)
  ↓ 카드 클릭                  ↓ "다음 랜덤"            ↓ 마지막 문제 "시험 제출"
[detail] 본문/선택지/태그/메모/AI                            [result] 채점 결과
```

뷰 전환은 `show(view)` 한 곳에서. 5개 섹션 `.screen` 의 `.hidden` 토글.

## 4. 이벤트 바인딩 패턴

- 거의 모든 클릭 이벤트는 `bindEvents()` 한 군데서 위임 처리
- 동적으로 생성된 요소는 `data-action="..."` + 부모에 위임 리스너
- 단발성 핸들러(헤더 버튼 등)는 직접 `addEventListener`

## 5. 상태 갱신 규칙

- 화면 전환 직전에 해당 렌더 함수 호출 (`renderHome()` → `show('home')`)
- 뒤로 가기 시에도 진행률·태그가 갱신되어야 하므로 `modes-back`/`list-back`/`result-back` 핸들러는 `render*()` + `show(...)` 둘 다 호출
- localStorage는 모든 쓰기 직후 즉시 동기화 (캐시 없음)

## 6. 외부 의존성

- **CDN (런타임)**: Pretendard Variable, KaTeX 0.16.9 (CSS + JS + auto-render)
- **NPM (서버리스만)**: `@google/generative-ai` (api/ask.js 전용)

## 7. 빌드/실행

- 빌드 단계 없음. 정적 호스팅(Vercel)이 그대로 서비스.
- 로컬 개발: `python3 -m http.server` 등 임의 정적 서버. `/api/ask`만 동작 안 함.
