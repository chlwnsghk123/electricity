# 아키텍처 (ARCHITECTURE)

## 0. 한 줄 요약

빌드 단계가 없는 **정적 SPA (Vanilla JS) + Vercel Serverless 1개**. 모든 화면 전환은 `state.view` 변경 + DOM 표시 토글 + `history.pushState/popstate` 동기화로 처리한다(안드로이드 시스템 백 버튼 → 앱 내 이전 화면).

---

## 1. 파일 트리

```
/
├── index.html               # 5개 화면 + 3개 바텀시트(ai/settings/choice) + 1 팝오버(tag) 마크업
├── styles.css               # 전역 스타일 (라이트/다크 토큰 — `html[data-theme="dark"]`)
├── app.js                   # 단일 파일, 6개 Part 섹션으로 구성 (~1750줄)
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
Part 1 (1~278)     상수(LS 키, TAG_COLORS/TAG_MEANING, EXAM_*, AI_TTL_MS),
                   전역 state, 유틸 (qs, el, debounce, preview, toast, formatTime,
                   escapeHtml, renderMarkdownInline, show, handlePopState,
                   shuffle, uid, renderMath)
Part 2 (280~485)   localStorage 헬퍼 (loadLS/saveLS/patchLS/_scope), per-exam 도메인
                   (북마크/태그/메모/답), AI 영속화 (getAiMessages/saveAiMessages/
                   touchAiAccess — TTL 70분 lazy 만료), 테마 (getSettings/setSetting/
                   applyTheme), 데이터 로드 (loadManifest/loadExam), 과목명 매핑
Part 3 (486~1013)  렌더 (renderHome, renderModes, renderList, renderQuestionCard,
                   renderDetail, renderExamProgressBar, renderNotesList, grade,
                   renderResult) + 태그 팝오버, 메모 폼·long-press 삭제
Part 4 (1014~1271) 모드 진입(enterMode), 모의고사(full/half) 셔플·시작·제출,
                   랜덤 학습 진입·다음·이전(이력 기반 prev/nextRandom), 타이머,
                   선택 바텀시트
Part 5 (1273~1530) AI 바텀시트 — 컨텍스트(문제 전문 + 본문 이미지) 펼치기/접기,
                   추천 질문 즉시 전송, 멀티모달 이미지 수집, 답변 시작점 스크롤,
                   드래그 닫기, 메모 저장
Part 6 (1532~끝)   설정 시트(야간 모드 토글 + 진행도 초기화), bindEvents,
                   bootstrap (테마 적용 + history.replaceState + popstate 등록)
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

- 화면 전환 직전에 해당 렌더 함수 호출 (`renderHome()` → `show('home')`).
- `show(view)` 가 호출되면 직전 뷰가 다르면 자동으로 `history.pushState({view, no})` 한다(브라우저 히스토리 = 앱 내비게이션과 일치).
- 헤더 뒤로 버튼은 `history.back()` 위임. 안드로이드 시스템 백/제스처 백도 같은 `popstate` 경로를 거치므로 동일 동작.
- `popstate` 핸들러(`handlePopState`)는 (a) 열린 시트가 있으면 시트만 닫고 history.forward() 로 복구, (b) 모의고사 detail 이탈 시 중단 확인 모달, (c) 그 외엔 target 뷰의 `render*()` + `show(target, {fromPop:true})` 호출.
- localStorage는 모든 쓰기 직후 즉시 동기화 (캐시 없음).

## 6. 외부 의존성

- **CDN (런타임)**: Pretendard Variable, KaTeX 0.16.9 (CSS + JS + auto-render)
- **NPM (서버리스만)**: `@google/generative-ai` (api/ask.js 전용)

## 7. 빌드/실행

- 빌드 단계 없음. 정적 호스팅(Vercel)이 그대로 서비스.
- 로컬 개발: `python3 -m http.server` 등 임의 정적 서버. `/api/ask`만 동작 안 함.
