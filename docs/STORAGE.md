# 스토리지 + 상태 (STORAGE)

## 1. localStorage 키 (모두 per-exam 스코프)

| 키 | 값 형태 | 용도 |
|---|---|---|
| `cbt_bookmarks_v1` | `{ [examId]: number[] }` | 북마크 문제 번호 목록 |
| `cbt_tags_v2`      | `{ [examId]: { [no]: 'gray'\|'green'\|'red'\|'orange'\|'yellow'\|'blue' } }` | 6색 태그 |
| `cbt_notes_v1`     | `{ [examId]: { [no]: [{ id, content, savedAt }] } }` | 문제별 메모 배열 |
| `cbt_ai_v2`        | `{ [examId]: { [no]: { lastOpenedAt: number, messages: [{ role, content, saved? }] } } }` | 문제별 AI 대화 히스토리 (시트 닫아도 유지, 마지막 열람·송수신 후 **70분 무활동 시 자동 만료** 삭제) |
| `cbt_last_exam_v1` | `string` (examId) | 마지막 선택 회차 (현재 미사용 — 홈에서 항상 매니페스트 노출) |
| `cbt_settings_v1`  | `{ theme?: 'light'\|'dark' }` | 야간 모드 등 앱 설정 |
| `cbt_exam_history_v1` | `{ [examId]: [{ id, variant, submittedAt, durationMs, examSet, answers, result }] }` | 모의고사 응시 기록 — 제출 시 자동 저장(복기·삭제). 회차당 최근 30개 |

**중요: 진행 중인 답(answers)은 localStorage에 저장하지 않는다.**
- 학습/랜덤 모드: `state.tempAnswer = {no, idx}` (현재 문제만, 이탈 시 소멸)
- 모의고사: `state.examAnswers = {no: idx}` (시험 시작~제출까지 메모리 유지)
- **단, 제출 완료된 모의고사**는 `cbt_exam_history_v1`에 응시 기록 스냅샷(examSet + answers + 점수)으로 보관된다 — 복기 전용. 복기는 상세 화면을 `review` 모드로 재사용하며 답안은 이 스냅샷에서 읽는다.
- **답·정답·태그·채점 모두 "원본 인덱스" 기준으로 일관 저장**. 선택지 셔플은 표시에만 적용되며 `state.shuffles[no]`(메모리)가 한 세션 동안 문제별 순서를 고정한다. `onChooseAnswer`에서 화면 위치 → 원본 인덱스로 변환하여 저장하므로 `q.a`·`attempt.answers`·자동 태그·`cbt_tags_v2`는 셔플과 무관하게 안정적이다.
- **다중 회차 합본 모드**: `loadCombinedExam(ids)` 가 통합 가상 회차를 만들고 `state.examId = "multi:id1,id2,..."`(정렬) 로 둔다. 같은 조합은 같은 LS 스코프를 가지므로 태그·메모·북마크·AI·모의고사 기록이 그 조합 안에서 공유된다(단일 회차 스코프와는 분리). 합본의 각 문제는 일련번호로 재부여되며 `srcExamId`·`srcExamTitle`·`srcNo` 가 보존되어 화면에 «시험명 - 원본번호» 로 표시된다.

## 2. 헬퍼 (Part 2)

- 저수준: `loadLS(key, fallback)` / `saveLS(key, val)` / `patchLS(key, fallback, fn)`
- per-exam: `_scope(key, fallback)` — 현재 `state.examId` 키로 슬라이스
- 도메인:
  - 북마크: `getBookmarks()` / `toggleBookmark(no)`
  - 태그:   `getTags()` / `getTag(no)` / `setTag(no, color)` (gray 또는 같은 색 재선택 → 해제)
  - 메모:   `getNotes(no)` / `addNote(no, content)` / `deleteNote(no, id)`
  - 답:     `getCurrentAnswer(no)` / `setCurrentAnswer(no, idx)` / `clearTempAnswerIfLeaving(no)`
  - AI 대화: `getAiMessages(no)` (TTL 만료 시 lazy 삭제 후 빈 배열) / `saveAiMessages(no, messages)` / `touchAiAccess(no)` (열람 시각만 갱신)
  - 테마: `getSettings()` / `setSetting(key, value)` / `applyTheme('light'|'dark')`
- 초기화: `resetCurrentExam()` — 현재 회차의 북마크/태그/메모/AI 대화 + 메모리 답 모두 삭제 (테마는 유지)

## 3. 자동 태그 정책 (학습/랜덤 모드)

- 답 선택 즉시 `setTag(no, correct ? 'green' : 'red')` 호출 (`applyAutoTagIfNeeded`).
- 사용자가 수동으로 다른 색을 골랐어도 다시 답을 풀면 덮어쓴다.
- 모의고사 모드는 답 선택 시점에 태깅하지 **않고**, 제출 시점에 일괄 태깅 (`submitExam`).

## 4. 진행률 계산

- "맞춘 수" = green 태그 개수 (`correctCountOfExam(examId)`).
- 홈 회차 리스트 우측, 모드 선택 화면 메타에 `<correct> / <count>` 형태로 표시.
- 사용자가 의도적으로 green을 다른 색으로 바꿨다면 카운트에서 빠진다 (의도 동작).

## 5. 전역 state 구조 (Part 1)

```js
const state = {
  manifest, exam, examId,                  // 데이터
  view: 'home'|'modes'|'list'|'detail'|'result',
  mode: 'study'|'exam'|'random'|null,
  examVariant: 'full'|'half'|null,         // 모의고사 유형
  randomSubject: string|null,              // 랜덤 학습 과목명
  subjectFilter, tagFilter, search,        // 학습 모드 리스트 필터
  currentNo, filteredNos,                  // 상세 prev/next
  examSet, examAnswers,                    // 모의고사 전용
  tempAnswer,                              // 학습/랜덤 단일 답 임시 보관
  randomSeen,                              // 랜덤 학습 이력(중복 회피 + prev/next 기반)
  timer: { startedAt, limitMs, intervalId, running },
  ai: {
    messages: [{role:'user'|'ai', content, loading?, error?, saved?}],
    contextExpanded: boolean              // AI 시트의 문제 컨텍스트 펼침 상태
  },
  subjectNames, subjectBy                  // loadExam 시 채워짐
};
```

`state.ai.messages`는 AI 시트가 닫힐 때 `saveAiMessages(currentNo, ...)`로 LS에 직렬화되며, 시트를 다시 열면 `getAiMessages(no)`로 복원된다. TTL(70분) 만료 시 자동 삭제.

## 6. 스키마 마이그레이션

- 파괴적 변경 시 키의 `vN` 부분을 올린다 (예: 태그 5색 → 6색에서 `tags_v1` → `tags_v2`).
- 옛 키는 정리하지 않고 그냥 무시 (LS는 사용자 디바이스에 잔존).
- 사용자가 문제를 겪으면 설정 → 진행도 초기화로 해결 가능.
