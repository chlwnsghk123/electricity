# CLAUDE.md — 전기기사 CBT 시뮬레이터

이 문서는 Claude Code 에이전트가 이 레포에서 작업할 때 따라야 하는 **프로토콜, 프로젝트 구조, 핵심 알고리즘, 설계 원칙**을 정의한다. 새 세션이 시작될 때마다 가장 먼저 이 파일을 읽는다.

---

## 0. AI 에이전트 작업 프로토콜

### 0.1 모델 / 실행 모드
- 이 프로젝트는 Claude Code `/fast` 모드(빠른 응답 우선) 전제로 운영된다.
- 긴 도구 호출 한 방보다 **짧은 단계 반복**을 선호한다 (스트림 타임아웃 방지).
- 한 번의 응답에 너무 많은 도구 호출을 몰지 않는다. 2~4개 선에서 끊는다.

### 0.2 브리핑 규칙
- 작업 시작 전 **"지금 무엇을 왜 한다"**를 1~2줄로 알린다.
- 각 단계 끝에 **"무엇이 바뀌었고 다음은 무엇"**을 1~2줄로 요약한다.
- 장문 서사는 금지. 핵심만.

### 0.3 브랜치 / 커밋 / 푸시
- 기본 작업 브랜치: `claude/cbt-exam-simulator-zv6ZQ`
- 사용자 명시 허가 없이 `main`에 머지/푸시하지 않는다.
- 커밋 메시지는 **"무엇을 왜"** 한 줄. 예: `feat: add AI chat bottom sheet`.
- 사용자는 git push만 하면 Vercel이 자동 배포한다. 따라서 **푸시 전 로컬에서 문법/파싱 오류 없음을 확인**한다.

### 0.4 updates.md 관리
- 의미 있는 변경(기능 추가/버그 수정/데이터 변경)이 있을 때마다 `updates.md` 최상단에 버전 + 날짜 + 변경 항목을 기록한다.
- 버전은 `vMAJOR.MINOR` 형식. 기능 추가는 MINOR, 파괴적 변경/스키마 변경은 MAJOR.
- 형식:
  ```
  ## v1.02 — 2026-04-20
  - AI 바텀시트 모달 추가
  - 북마크 localStorage 스키마: cbt_bookmarks_v1
  ```

---

## 1. 프로젝트 목적

전기기사 + 전기공사기사 **필기시험 CBT 시뮬레이터**. 사용자는 한 달 내 동시 응시 준비 중이며, 이 앱이 **메인 학습 도구**다.

- 실제 기출 문제 기반 (출처: kinz.kr 등 공개 기출)
- 문제 은행 스타일(선택 → 풀이 → 네비게이션) + 모의고사 모드 병행
- 북마크 + 5색 태그로 약점 관리
- Gemini API 기반 AI 질문 바텀시트 (카드별 문맥 + 대화 히스토리)
- Vercel로 정적 호스팅 + Serverless Function 프록시

---

## 2. 기술 스택

### 2.1 프런트엔드
- **Vanilla JS + HTML + CSS** (프레임워크 없음, 빌드 없음)
- Pretendard Variable 폰트 (CDN)
- localStorage로 상태 저장

### 2.2 백엔드
- **Vercel Serverless Function** (`/api/ask.js`) — Gemini API 프록시. 키는 서버에만 존재.
- Gemini 모델: `models/gemini-3-flash-preview`
- 환경변수: `VITE_GEMINI_API_KEY` (사용자가 이미 Vercel에 설정함. 코드에서 `GEMINI_API_KEY` fallback도 함께 읽음.)

### 2.3 배포
- Vercel (사용자가 git push만 하면 자동 배포)
- 빌드 스텝 없음 (정적 + Serverless)

---

## 3. 데이터 스키마

### 3.1 파일 배치
```
data/
├── index.json                    # 시험/회차 manifest
├── electricity-2022-r2.json      # 전기기사 2022년 2회
└── ...                            # 향후 회차/시험 추가
```

### 3.2 `data/index.json` (manifest)
```json
{
  "exams": [
    {
      "id": "electricity-2022-r2",
      "title": "전기기사 2022년 2회",
      "file": "data/electricity-2022-r2.json",
      "date": "2022-06-12",
      "count": 100
    }
  ]
}
```

### 3.3 회차별 JSON 스키마
```json
{
  "meta": {
    "exam": "전기기사",
    "round": "2022년 2회",
    "date": "2022-06-12",
    "subjects": [
      "전기자기학",
      "전력공학",
      "전기기기",
      "회로이론 및 제어공학",
      "전기설비기술기준"
    ]
  },
  "questions": [
    {
      "no": 1,
      "subject": "전기자기학",
      "q": "문제 본문",
      "c": ["선택지1", "선택지2", "선택지3", "선택지4"],
      "a": 2,                 // 1-based 정답 인덱스
      "has_formula": false,
      "has_image": false,
      "image_note": "..."     // 선택적
    }
  ]
}
```

**제약**: 과목 5개, 과목당 20문제, 총 100문제. `a`는 1-based.

---

## 4. 파일 구조 (목표)

```
/
├── CLAUDE.md                  # 이 문서 (에이전트 프로토콜)
├── updates.md                 # 변경 이력
├── index.html                 # 진입점 (마크업만)
├── styles.css                 # 전역 스타일 (Toss 라이트 테마)
├── app.js                     # 전체 앱 로직 (뷰, 상태, 이벤트)
├── api/
│   └── ask.js                 # Vercel Serverless (Gemini 프록시)
├── data/
│   ├── index.json
│   └── electricity-2022-r2.json
└── vercel.json                # (필요 시)
```

**레거시**: `cbt_full.html`, `exam_2022_r2.json`은 재구성 과정에서 삭제/이동한다.

---

## 5. 핵심 알고리즘

### 5.1 뷰 전환 (리스트 ↔ 상세)
- **리스트 뷰**: 과목 탭 + 검색 + 북마크/태그 필터 → 문제 카드 리스트 (번호, 과목 뱃지, 본문 30자 미리보기, 북마크/태그 표시).
- **상세 뷰**: 카드 한 장 전체 → 문제, 선택지 버튼, 정답 확인, 해설/AI 질문 버튼, 북마크 토글, 5색 태그, 이전/다음 네비.
- 전환: `state.view = 'list' | 'detail'`, 렌더 함수는 `renderList()`/`renderDetail()` 분리.

### 5.2 모드
- **모의고사 모드**: 150분 타이머, 100문제 순차, 제출 시 과목별 점수 + 과락(40점 미만)/합격(평균 60점) 판정.
- **학습 모드**: 정답 즉시 확인, 해설 + AI 질문 가능, 타이머 없음.
- **과목별 20문제 모드**: 특정 과목만 필터해서 풀이.
- 모드 상태: `state.mode = 'exam' | 'study' | 'subject'`.

### 5.3 북마크 + 5색 태그
- 북마크: 단순 on/off. `state.bookmarks: Set<number>` (문제 번호).
- 태그: 5색(red/orange/yellow/green/blue) 중 하나. `state.tags: Record<number, 'red'|'orange'|'yellow'|'green'|'blue'>`.
- 한 문제는 북마크 O/X × 태그 0/1개. 태그는 토글(같은 색 다시 누르면 해제).
- 리스트 필터: "북마크만", 특정 태그 색만.

### 5.4 localStorage 스키마
```
cbt_bookmarks_v1   → number[]                    (문제 번호 배열)
cbt_tags_v1        → Record<number, string>      (번호 → 색)
cbt_answers_v1     → Record<number, number>      (번호 → 선택 인덱스 1-based)
cbt_session_v1     → { mode, examId, startedAt, elapsed, lastIndex }
cbt_settings_v1    → { theme, fontSize }         (선택)
```
- 키는 모두 `v1` 접미사. 스키마 파괴 변경 시 `v2`로 올리고 마이그레이션 함수 제공.

### 5.5 AI Q&A (바텀시트)
- 카드 상세에서 "AI에게 질문" 버튼 → 바텀시트 모달 열림.
- 모달 구성: 드래그 핸들 + 현재 문제 요약 + 대화 히스토리 + 입력창 + 전송 버튼.
- UX: `max-height: 75vh`, `border-radius: 24px 24px 0 0`, 80px 이상 아래로 드래그하면 닫힘, 오버레이 클릭도 닫힘.
- 프롬프트: "너는 전기기사/전기공사기사 필기시험 전문 강사다. 아래 문제 문맥과 대화 히스토리를 참고해 답하라." + 카드 필드(no, subject, q, c, a) + 히스토리.
- Markdown 인라인 렌더링: `**굵게**`, `*기울임*`, `` `코드` ``, 불릿 `- `.
- Enter 전송 없음 (줄바꿈 보존), 버튼 클릭만으로 전송.
- 에러 처리: 네트워크 실패/키 누락/모델 응답 없음 케이스를 사용자에게 친절히 표시.

### 5.6 Serverless 프록시 (`/api/ask.js`)
- POST만 허용. `{ card, question, history }` 수신.
- `process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY`로 키 로드.
- `@google/generative-ai` SDK 사용. 모델 `models/gemini-3-flash-preview`.
- 응답: `{ answer: string }` 또는 `{ error: string }`.
- CORS 헤더 설정 (same-origin이면 불필요하나 안전 차원).

---

## 6. UI/UX 원칙 (Toss 라이트 테마)

### 6.1 색상 토큰
```
--bg:         #ffffff   (본문 배경)
--surface:    #f9fafb   (섹션/카드 배경)
--border:     #e5e8eb   (선)
--text-1:     #191f28   (본문)
--text-2:     #4e5968   (보조 텍스트)
--text-3:     #8b95a1   (캡션)
--primary:    #3182f6   (토스 블루)
--success:    #00c853
--warn:       #ff9800
--danger:     #f04452
```

### 6.2 타이포
- 폰트: Pretendard Variable (weight 400/500/600/700).
- 본문 16px, 제목 20~24px, 캡션 12~13px.
- line-height 1.5.

### 6.3 레이아웃
- 모바일 우선, 최대 폭 640px 중앙 정렬.
- 카드: `border-radius: 16px`, `padding: 20px`, `border: 1px solid var(--border)` 또는 `background: var(--surface)`.
- 버튼 라운드: 12px. 높이 48px (탭 가능 영역).
- 터치 간격: 최소 8px.

### 6.4 애니메이션
- 자연스러운 `ease-out` 200ms 전환.
- 바텀시트는 translate Y로 열림/닫힘 + 오버레이 페이드.

### 6.5 수식/이미지
- 수식: Phase 2에서 KaTeX/MathJax. 현재는 `has_formula: true` 문제에 "수식 표기 단순화됨" 힌트만.
- 이미지: Phase 2에서 `image_note` 대신 실제 이미지. 현재는 `image_note` 텍스트 표시.

---

## 7. 표준 작업 체크리스트

작업 완료 전 확인:

- [ ] 브리핑 규칙 준수 (작업 전/후 1~2줄)
- [ ] localStorage 키에 `v1` 붙였는가
- [ ] 새 JSON 데이터 시 `data/index.json` manifest 갱신했는가
- [ ] 스키마 변경 시 마이그레이션 함수 추가했는가
- [ ] AI 키를 프론트엔드에 노출하지 않았는가
- [ ] `updates.md`에 변경 기록했는가
- [ ] 커밋 전 로컬 파싱 오류 확인
- [ ] 올바른 브랜치(`claude/cbt-exam-simulator-zv6ZQ`)에 푸시했는가
- [ ] Vercel 자동 배포 가정: 푸시 즉시 배포됨. 깨지는 변경은 별도 브랜치 또는 명시 합의 후 진행.

---

## 8. 장기 로드맵 (참고)

- **Phase 1 (현재)**: 2022년 2회 100문제로 전기기사 CBT MVP. Toss 라이트 테마. AI 바텀시트.
- **Phase 2**: 2022년 1회 추가, KaTeX 수식, 이미지 문제.
- **Phase 3**: 전기공사기사 데이터 추가, 해설, 오답노트.
- **Phase 4**: 통계(과목별 정답률, 일일 풀이량), 학습 추천.
