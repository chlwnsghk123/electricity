# AI 통합 (AI-INTEGRATION)

## 1. 위치

- 클라이언트: `app.js` Part 5 (AI 바텀시트, `sendAiMessage`, `fetchQuestionImages`)
- 서버: `api/ask.js` (Vercel Serverless, ESM)

## 2. 모델

```js
const MODEL_PRIMARY  = 'gemini-2.5-flash';
const MODEL_FALLBACK = 'gemini-2.0-flash';
```

primary가 4xx/5xx로 실패하면 fallback으로 자동 재시도.

## 3. 환경변수

`process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY`

기존 Vite 프로젝트에서 옮겨와 두 이름을 모두 읽는다. Vercel 대시보드에 둘 중 하나만 설정해두면 된다.

## 4. 요청 / 응답

```jsonc
// POST /api/ask
{
  "card": {
    "no": 10, "subject": "전기자기학",
    "q": "...", "c": ["...","...","...","..."], "a": 1,
    "has_image": true
  },
  "question": "왜 정답이 1번인지 간단히 알려줘",
  "history": [
    { "role": "user",  "content": "..." },
    { "role": "model", "content": "..." }
  ],
  "images": [
    { "mime": "image/png", "dataBase64": "iVBORw0..." },
    ...
  ]
}

// 200 OK
{ "answer": "..." }

// 4xx/5xx
{ "error": "..." }
```

## 5. 시스템 프롬프트 (요약 — 실제 문구는 `api/ask.js` `SYSTEM_PROMPT`)

도메인: 전기기사/전기공사기사 필기시험 전문 강사. **모바일에서 빠르게 읽히도록 아주 간결하게** 답한다.

핵심 규칙:
- 기본 길이 5~8줄 / 400자 이내. "자세히/길게/증명/유도" 명시 시에만 길게.
- 인사·요약 반복·메타 설명 금지. 바로 본론.
- 구조: ① 결론 한 줄 → ② 핵심 공식/근거 1~2줄 → ③ (필요 시) 핵심 계산 1~2줄.
- 자주 틀리는 함정은 한 줄로만 덧붙임 (없으면 생략).
- 수식: KaTeX용 LaTeX (`$...$`, `$$...$$`). 평문 기호(μ, Ω, π)는 그대로 허용.

## 6. 멀티모달 — 이미지 첨부

`fetchQuestionImages(examId, no, choiceCount)` 가 자동으로 수집:
- 본문: `images/<examId>/<no>.png`
- 선택지: `images/<examId>/<no>-1.png ~ <no>-N.png`

수집된 모든 이미지는 `inlineData` 파트로 함께 전송. Gemini가 텍스트 + 이미지 동시 처리.

`has_image` 플래그는 무시한다 — 파일 존재 기반.

## 7. 클라이언트 UI

- **컨텍스트 패널**(시트 상단): "문제 N · 과목" 제목 + 펼치기/접기 토글 + 문제 본문(KaTeX 렌더) + 본문 이미지(`<no>.png`, 있을 때만). `state.ai.contextExpanded`가 false면 본문/이미지가 접힘.
- **추천 질문 3개** (메시지 0개일 때만 노출, **클릭 즉시 입력창 경유 없이 전송**):
  1. 이 문제의 핵심 개념을 한 문단으로 알려줘
  2. 왜 정답이 N번인지 간단히 알려줘
  3. 자주 틀리는 함정을 한 줄로 알려줘
- **메시지 렌더**: `renderMarkdownInline` + KaTeX `renderMath`. user 말풍선은 우측 primary, ai는 좌측 surface.
- **메모 저장 버튼**: 모든 ai 말풍선 하단에 `📝 메모에 저장` (저장 후 `✓ 메모에 저장됨`으로 잠김). 한 번에 잘 보이게 outline 스타일.
- **답변 도착 후 스크롤**: `scrollToLatestAiAnswer()` — 답변 시작점으로 부드럽게 이동(끝으로 안 내림).
- **영속화 + TTL**: 시트 닫아도 대화는 `cbt_ai_v2`(per 문제)에 보존. 시트가 그 문제에서 다시 열리거나 송수신이 일어나면 `lastOpenedAt` 갱신. **마지막 열람·송수신 후 70분(`AI_TTL_MS`)** 무활동 시 그 문제의 대화만 자동 삭제(다른 문제와 독립).
- **시트 닫기**: 핸들 드래그(80px↓) / 오버레이 클릭 / ✕ / 안드로이드 시스템 백(시트 우선 닫고 history.forward로 뷰 유지).

## 8. 에러 처리

- 키 누락: 500 + `{ error: 'Gemini API 키가 설정되지 않았습니다 (VITE_GEMINI_API_KEY)' }`
- POST 외 메서드: 405
- card/question 누락: 400
- 모델 빈 응답: 502
- 네트워크 실패: 클라이언트 토스트 + 에러 메시지 출력

## 9. 비용 / 호출 정책

- 클라에서 캐싱 없음. 매 전송마다 전체 history 동봉 (Gemini chat).
- 멀티모달 1장당 base64 ~수백 KB. 한 문제에 본문 + 선택지 4장이면 ~1MB 내외.
- 사용자 의도 호출이라 자동 호출 없음.
