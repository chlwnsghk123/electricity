# 구현 계획 (PLAN.md)

이 문서는 전기기사 CBT 시뮬레이터 재구성 작업의 **상세 계획 + 구현 상태 + 남은 작업**을 추적한다. 에이전트는 작업 시작 전 이 문서를 읽고, 작업 종료 후 상태를 갱신한다.

> 최종 갱신: 2026-04-20
> 현재 브랜치: `claude/cbt-exam-simulator-zv6ZQ`

---

## 0. 범례

- ✅ 구현 완료 + 커밋/푸시됨
- 🟡 일부 구현 / 미검증
- ⬜ 미구현
- 🗑 삭제 예정 (레거시)

---

## 1. 전체 5단계 로드맵

| 단계 | 내용 | 상태 | 커밋 |
|---|---|---|---|
| 1 | `CLAUDE.md` 작성 (에이전트 프로토콜) | ✅ | `52c8189` |
| 2 | `updates.md` + 데이터 재배치 (`data/`) | ✅ | `4b93a13` |
| 3 | `index.html` + `styles.css` (Toss 라이트 테마 골격) | ✅ | `7c3fd15` |
| 4 | `app.js` (뷰/상태/모드/북마크/태그/localStorage) | ✅ | (이번 브랜치) |
| 5 | `/api/ask.js` Serverless + AI 바텀시트 연동 + 레거시 정리 | ✅ | (이번 브랜치) |

---

## 2. 파일별 상태 스냅샷

```
/
├── CLAUDE.md                        ✅
├── PLAN.md                          ✅ (이 파일)
├── updates.md                       ✅
├── index.html                       ✅ (마크업만, JS 미연결)
├── styles.css                       ✅ (Toss 라이트 테마)
├── app.js                           ✅ (4·5단계 — 뷰/모드/타이머/이벤트/AI 바텀시트 포함)
├── api/
│   └── ask.js                       ✅ (Gemini 프록시, fallback 모델 포함)
├── data/
│   ├── index.json                   ✅ (manifest)
│   └── electricity-2022-r2.json    ✅ (100문제)
├── vercel.json                      ✅ (buildCommand no-op — Vercel이 Node 프로젝트로 오인식하는 문제 회피)
├── package.json                     ✅ (`@google/generative-ai` 단일 의존성)
└── cbt_full.html                    ✅ 삭제 완료
```

---

## 3. 4단계: `app.js` 상세 설계

작성 단위는 **한 파일, ES 모듈 없이 IIFE 또는 간결한 함수 모음**. 향후 필요 시 분리. 아래는 논리 섹션별 설계.

### 3.1 상단: 상수 + 스토리지 키
```js
const LS = {
  bookmarks: 'cbt_bookmarks_v1',    // { [examId]: number[] }
  tags:      'cbt_tags_v1',         // { [examId]: { [no]: color } }
  answers:   'cbt_answers_v1',      // { [examId]: { [no]: selectedIdx(1-based) } }
  session:   'cbt_session_v1',      // { examId, mode, startedAt, elapsedMs, lastNo, subject? }
  lastExam:  'cbt_last_exam_v1'     // string (examId)
};
const TAG_COLORS = ['red','orange','yellow','green','blue'];
const PASS = { perSubjectMin: 8, averageMin: 12 };  // 20문제 기준 환산 (40%, 60%)
```
상태: ⬜

### 3.2 전역 state
```js
const state = {
  manifest: null,           // data/index.json
  exam: null,               // 현재 로드된 회차 JSON
  view: 'home',             // 'home' | 'list' | 'detail' | 'result'
  mode: null,               // 'exam' | 'study' | 'subject'
  subjectFilter: 'all',     // 'all' | '전기자기학' | …
  tagFilter: null,          // null | 'bookmark' | color
  search: '',
  currentNo: null,          // 상세 뷰에서 보고 있는 문제 번호
  timer: { startAt: 0, limitMs: 150*60*1000, intervalId: null, running: false },
  ai: { open: false, messages: [], dragStartY: 0, dragY: 0 }
};
```
상태: ⬜

### 3.3 localStorage 헬퍼
- `loadLS(key, fallback)`, `saveLS(key, value)`, `patchLS(key, patcher)`.
- **per-exam 스코프**: 북마크/태그/답은 현재 examId 기준으로 접근하는 얇은 헬퍼 함수 (`getBookmarks()`, `toggleBookmark(no)`, `getTag(no)`, `setTag(no, color)`, `getAnswer(no)`, `setAnswer(no, idx)`).

상태: ⬜

### 3.4 초기화 플로우
```
DOMContentLoaded
  → loadManifest()            // fetch data/index.json
  → resolveLastExam()         // LS.lastExam 또는 첫 항목
  → loadExam(examId)          // fetch data/<file>
  → renderHome()
  → show('home')
```
에러 처리: fetch 실패 시 토스트 + 재시도 버튼.
상태: ⬜

### 3.5 라우팅 / 뷰 전환
- `show(viewName)`: 5개 섹션 `.screen`에 `.hidden` 토글.
- 브라우저 뒤로가기 지원: `history.pushState({view, no})` + `popstate` 핸들러. (nice-to-have — 1차에서는 생략 가능)
상태: ⬜ (뒤로가기 연동은 5단계 이후)

### 3.6 홈 렌더
- 회차 리스트(`.exam-chip`): manifest.exams 순회, active 표시.
- 모드 3개 버튼 이벤트 → mode 설정 + `enterMode(mode)` 호출.
- "북마크만 보기" / "진행도 초기화" 버튼.

상태: ⬜

### 3.7 모드 진입 `enterMode(mode)`
- `exam`: 모든 답/타이머 리셋 확인 모달 → 시작 → 150분 타이머 시작 → `view='list'` (또는 곧바로 1번 문제 상세로).
- `study`: 타이머 없음, 리스트 뷰로.
- `subject`: 과목 선택 모달 → 선택된 과목으로 필터 → 리스트.

상태: ⬜

### 3.8 리스트 뷰 렌더 `renderList()`
- 상단 헤더: 모드별 타이틀, 모의고사 모드에서만 타이머 표시.
- 과목 탭: `['전체', ...meta.subjects]`. 클릭 시 `subjectFilter` 갱신 후 재렌더.
- 검색 input → `state.search` 갱신 → debounce 150ms → 재렌더.
- 필터 칩: 북마크(★) + 5색 태그.
- 카드 리스트: 필터 적용 결과.
  - 각 카드: 번호, 본문 2줄, 과목 뱃지, 북마크 표시, 태그 점.
  - 상태 클래스: `answered`(학습/과목 모드에서 정답 확인 완료), `answered-correct`, `answered-wrong`.
- 모의고사 모드 한정: 하단 `시험 제출하기` 버튼 활성화 (답변 수 ≥ 1).

상태: ⬜

### 3.9 상세 뷰 렌더 `renderDetail(no)`
- 헤더: 번호, 북마크 토글.
- 본문 + image_note.
- 선택지 4개: 클릭 → `setAnswer(no, idx)` → 학습 모드면 즉시 정답/오답 색, 모의고사 모드면 선택 표시만.
- 정답 reveal 박스: 학습/과목 모드에서 정답 확인 후 표시 (`정답: ②, 내 답: ③ (오답)`).
- 태그 피커: 5색 원 → 클릭 토글.
- AI 질문 버튼 → 바텀시트 열기.
- 하단 prev/next: 리스트 필터 결과 기준으로 순환.

상태: ⬜

### 3.10 결과 뷰 `renderResult()`
- 모의고사 제출 시 호출.
- 총점 / 과목별 점수 / 과락 여부 / 합격 여부.
- 각 과목 20문제 중 맞힌 수를 20점 만점으로 환산한 표시.
- "오답 다시 풀기" → 오답 번호 배열을 필터로 걸어 리스트 뷰.

상태: ⬜

### 3.11 모의고사 타이머
- `startTimer(limitMs)`: 시작 시각 기록, 1초 간격 인터벌, 남은 시간 ≤ 10분 warn 클래스.
- `tick()`: 남은시간 계산 → 헤더 갱신. 0이 되면 자동 제출.
- `stopTimer()`: interval clear, state.timer.running=false.
- 세션 복구: 새로고침 시 `LS.session.startedAt`으로 elapsed 계산.

상태: ⬜

### 3.12 채점 로직
```js
function grade() {
  const byS = {};  // subject → { correct, total }
  exam.questions.forEach(q => {
    byS[q.subject] ??= { correct:0, total:0 };
    byS[q.subject].total++;
    if (getAnswer(q.no) === q.a) byS[q.subject].correct++;
  });
  const scores = Object.entries(byS).map(([s, v]) => ({
    subject: s,
    correct: v.correct,
    total: v.total,
    score20: Math.round(v.correct / v.total * 100 / 5)  // 20점 만점 환산
  }));
  const fail = scores.some(s => s.score20 < 8);        // 과락 40점 미만
  const avg = scores.reduce((a,s)=>a+s.score20,0)/scores.length;
  return { scores, avg, pass: !fail && avg >= 12 };
}
```
상태: ⬜

### 3.13 이벤트 바인딩
- 위임 기반: `#app` 하나에 click listener 걸고 `data-action`으로 분기.
- 예: `<button data-action="choose" data-idx="2">`.
- textarea auto-resize(height: auto; height: scrollHeight).

상태: ⬜

### 3.14 유틸
- `qs(sel)`, `qsa(sel)`, `el(tag, attrs, children)`, `debounce(fn, ms)`.
- `preview(text, n=80)`: 개행 제거 + ellipsis.
- `toast(msg, ms=1800)`.
- `formatTime(ms)`: `mm:ss` / `hh:mm:ss`.
- `renderMarkdownInline(text)`: `**b**`, `*i*`, `` `c` ``, `- ` 불릿 → HTML (5단계 AI 메시지에 재사용).

상태: ⬜

### 3.15 엣지 케이스
- 회차 JSON 누락 → 에러 메시지.
- 답 없이 제출 → 확인 모달 (`진행한 문제 X / 100. 제출할까요?`).
- 태그 색 토글: 같은 색 다시 누르면 해제 (`null`).
- `image_note`만 있고 이미지 없음 → 회색 박스에 안내.
- 검색어가 수식 기호 포함 → normalize 없이 substring으로 충분.

상태: ⬜

---

## 4. 5단계: Serverless + AI 바텀시트 + 레거시 정리

### 4.1 `api/ask.js` (Vercel Serverless)
- POST 수신: `{ card: {no, subject, q, c[], a}, question: string, history: [{role, content}] }`.
- 키 로드: `const key = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY`.
- SDK: `@google/generative-ai`. 모델: `models/gemini-3-flash-preview`.
- 시스템 프롬프트:
  > 너는 전기기사/전기공사기사 필기시험 전문 강사다. 주어진 문제를 학습자가 이해하도록 설명하고, 개념/공식/함정/자주 틀리는 포인트를 짚어라. 수식은 일반 텍스트로 적되 가독성을 유지하라. 한국어로 답하라.
- 사용자 프롬프트: 카드 문맥 블록 + 히스토리 + 최신 질문.
- 응답: `res.json({ answer })`. 실패 시 `{ error }` + 적절한 HTTP 상태.
- CORS: same-origin이므로 기본적으로 불필요. OPTIONS 프리플라이트만 대응.
- `package.json`에 `@google/generative-ai` 의존성 추가.

상태: ⬜

### 4.2 AI 바텀시트 동작 (app.js에 포함)
- 열기: `ai.open = true`, `#ai-sheet`/`#ai-overlay`에 `.show` 클래스.
- 문맥 블록: 현재 문제의 번호/과목/본문(잘라서) 표시.
- 추천 질문 3종 (메시지 0개일 때):
  - "이 문제의 핵심 개념을 설명해줘"
  - "왜 정답이 ${a}번인지 자세히 알려줘"
  - "이 주제에서 자주 틀리는 함정은 뭐야?"
- 전송: `POST /api/ask` → 로딩 메시지 → 응답으로 교체.
- 메시지 렌더: `renderMarkdownInline`으로 굵게/기울임/코드/불릿 변환.
- 드래그 닫기: 핸들 touchstart → 아래로 드래그 시 translateY 반영 → 80px 초과 시 close, 아니면 원복.
- 오버레이 클릭 → 닫기.
- textarea Enter → 줄바꿈 (전송 안 함), 버튼만 전송.

상태: ⬜

### 4.3 레거시 / 부수 정리
- `cbt_full.html` 삭제 (git rm).
- `vercel.json` (선택): Serverless 함수 경로 확정이면 기본값으로 충분. 필요 시 추가.
- `package.json` 최소 구성 (의존성: `@google/generative-ai`만).
- README.md: 간단 소개 + 배포/개발 가이드 (선택).

상태: ⬜

---

## 5. 테스트 체크리스트 (수동)

4단계 완료 시 수동 확인:
- [ ] 홈 진입 → 회차 1개 노출됨.
- [ ] 학습 모드 → 리스트 진입 → 카드 탭 → 상세 진입.
- [ ] 상세에서 선택지 클릭 → 정답 즉시 표시 + 클래스 변화.
- [ ] 북마크 토글 → 새로고침 후 유지.
- [ ] 태그 색 설정/해제 → 필터 칩으로 필터링됨.
- [ ] 과목별 모드 → 선택된 과목 20문제만 리스트.
- [ ] 모의고사 모드 → 타이머 작동, 10분 이내 warn 색.
- [ ] 제출 → 과목별 점수, 과락/합격 표시.
- [ ] 검색창 → 디바운스 후 결과 좁혀짐.
- [ ] prev/next → 필터된 목록 안에서만 순환.

5단계 완료 시:
- [ ] AI 바텀시트 열림/닫힘 (버튼/오버레이/드래그).
- [ ] 추천 질문 클릭 → textarea 채움.
- [ ] 전송 → 로딩 → 답변 렌더.
- [ ] Gemini 키 미설정 시 친절한 에러 토스트.
- [ ] Vercel 배포 후 실제 API 호출 성공.

---

## 6. 리스크 / 메모

- **Gemini 모델명**: `models/gemini-3-flash-preview`가 401/404 나면 SDK 버전 / 모델 가용성 재확인 필요. 백업으로 `gemini-1.5-flash` 지정 가능하게 둠.
- **환경변수**: 사용자가 Vercel에 `VITE_GEMINI_API_KEY`로 설정함. Vanilla JS로 전환되었으므로 이상적으로는 `GEMINI_API_KEY`가 맞지만, 기존 설정 존중해서 둘 다 읽음.
- **수식/이미지**: 이번 단계에서는 원문 텍스트 + `image_note` 힌트까지만. KaTeX는 Phase 2.
- **per-exam 스코프 북마크/태그/답**: 회차가 여러 개가 될 때 서로 섞이지 않도록 반드시 examId별 네임스페이스 유지.

---

## 7. 다음 작업 지시 (에이전트용)

1. 4단계: 이 문서의 §3 설계대로 `app.js` 작성. 한 번의 Write 호출로 전체 파일 생성. 문법 오류 없이 로컬에서 파싱되는지 확인(간단히 `node --check`).
2. 커밋: `feat: add app.js with list/detail views, modes, bookmarks+tags, localStorage`.
3. 푸시 후 이 `PLAN.md`의 §1 표와 §3 섹션별 상태를 ✅로 전환, §5 체크리스트 상태 업데이트.
4. 5단계는 별도 턴에서. §4 설계대로 `api/ask.js` + AI 모달 연동 + `cbt_full.html` 삭제.
