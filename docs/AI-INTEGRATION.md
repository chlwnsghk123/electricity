# AI 통합 (AI-INTEGRATION)

## 1. 위치

- 클라이언트: `app.js` Part 5 (AI 바텀시트, `sendAiMessage`, `fetchQuestionImages`)
- 서버: `api/ask.js` (Vercel Serverless, ESM)

## 2. 모델

```js
const MODEL_PRIMARY  = 'models/gemini-3-flash-preview';
const MODEL_FALLBACK = 'gemini-1.5-flash';
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

## 5. 시스템 프롬프트 (요약)

> 너는 전기기사/전기공사기사 필기시험 전문 강사다. 한국어로 단계별로 설명. **수식은 KaTeX용 LaTeX 사용** (`$...$`, `$$...$$`). 핵심 위주로 간결하게.

## 6. 멀티모달 — 이미지 첨부

`fetchQuestionImages(examId, no, choiceCount)` 가 자동으로 수집:
- 본문: `images/<examId>/<no>.png`
- 선택지: `images/<examId>/<no>-1.png ~ <no>-N.png`

수집된 모든 이미지는 `inlineData` 파트로 함께 전송. Gemini가 텍스트 + 이미지 동시 처리.

`has_image` 플래그는 무시한다 — 파일 존재 기반.

## 7. 클라이언트 UI

- 추천 질문 3개 (메시지 0개일 때만)
  1. 이 문제의 핵심 개념을 설명해줘
  2. 왜 정답이 N번인지 간단히 알려줘
  3. 이 주제에서 자주 틀리는 함정은 뭐야?
- 메시지 렌더: `renderMarkdownInline` + KaTeX `renderMath`
- AI 답변에 "📝 메모에 저장" 액션 → `addNote(currentNo, content)`
- 시트 닫기: 핸들 드래그(80px↓) / 오버레이 클릭 / ✕

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
