# 데이터 스키마 (DATA-SCHEMA)

## 1. 회차 매니페스트 — `data/index.json`

```json
{
  "exams": [
    {
      "id": "electricity-2025-r1",            // 회차 식별자 = 폴더명/파일명
      "title": "전기기사 2025년 1회 (세트1)",  // 홈 회차 리스트 표시 텍스트
      "file": "data/electricity-2025-r1.json", // 회차 JSON 경로 (available=true 일 때 필수)
      "date": "2025",                           // 표시용 (현재 UI는 미노출)
      "count": 100,                             // 진행률 표시 분모
      "available": true                         // false면 "준비 중" 비활성 표시
    },
    { "id": "electricity-2022-r1", "title": "...", "available": false }
  ]
}
```

규칙
- `id`는 폴더(`images/<id>/`)와 1:1.
- `available: false` 항목은 `file`/`date`/`count` 생략 가능. 클릭 불가.
- 추가 회차는 매니페스트에 항목 추가 → 데이터 파일 작성 → `available: true`로 플립.

## 2. 회차 JSON — `data/electricity-<id>.json`

```jsonc
{
  "meta": {
    "exam": "전기기사",
    "round": "2022년 제2회",
    "date": "2022-04-24",
    "total_questions": 100,
    "pass_criteria": "과목당 40점 이상 + 평균 60점 이상",
    "time_limit_minutes": 150,
    "source_text":    "kinz.kr/exam/...",   // 자유 형식
    "source_answers": "quz.co.kr PDF",
    "subjects": [
      { "no": 1, "name": "전기자기학",            "range": [1, 20]  },
      { "no": 2, "name": "전력공학",              "range": [21, 40] },
      { "no": 3, "name": "전기기기",              "range": [41, 60] },
      { "no": 4, "name": "회로이론 및 제어공학",  "range": [61, 80] },
      { "no": 5, "name": "전기설비기술기준",      "range": [81, 100] }
    ]
  },
  "questions": [
    {
      "no": 1,                       // 1~100. unique
      "subject": 1,                  // meta.subjects[i].no 와 일치
      "q": "문제 본문…",              // 평문 + LaTeX (`$...$` / `$$...$$`)
      "c": ["선1", "선2", "선3", "선4"],   // 4지선다 권장 (KaTeX 인라인 가능)
      "a": 2,                        // 정답 인덱스 (1-based)
      "has_formula": false,          // 정보용 (UI는 사용 안 함)
      "has_image": false,            // 정보용. 실제 표시는 파일 존재 기반
      "image_note": "..."            // 선택. has_image=true 시 캡션
    }
  ]
}
```

## 3. 제약사항

- **과목 5개 / 과목당 20문제 / 총 100문제**가 권장. 다른 구성도 동작은 하지만 모의고사 채점/하프 분기에 영향.
- `subject`는 **숫자**다. `state.subjectBy[subject]` 로 이름 매핑 (Part 2의 `subjectNameOf` 참고).
- `a`는 **1-based**.
- `q` / `c[]` 모두 LaTeX 인라인 가능. KaTeX auto-render가 `$...$`, `$$...$$`, `\(\)`, `\[\]` 처리.
- 일부 회차에는 `choice_images` 필드가 있지만 **사용하지 않는다** (파일 존재 기반 로직이 우선).

## 4. LaTeX 작성 가이드

- 그리스 문자: `\mu`, `\Omega`, `\pi`, `\varepsilon`, `\lambda`, `\sigma` ...
- 아래첨자 / 위첨자: `\varepsilon_r`, `e^{-t}`, `m^2`
- 분수: `\frac{a}{b}`, `\dfrac{a}{b}`
- 루트: `\sqrt{x^2+y^2}`
- 결합: `\hat{x}`, `\bar{A}`
- 행렬: `\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}`
- 그리스 + 영문자 곱: `\mu S` (공백 필요)
- 그리스 + 첨자: `\mu_r`

JSON 안에서는 백슬래시를 `\\`로 이스케이프해야 한다 (`"$\\mu_r$"`).

## 5. 이미지 파일 규칙

```
images/<examId>/
  <no>.png           # 문제 본문 이미지
  <no>-1.png         # 선택지 1 이미지 (있을 때만)
  <no>-2.png         # 선택지 2 이미지
  ...
  README.md          # 회차별 필요 이미지 표
```

규약
- 포맷: **PNG만** (앱이 다른 확장자를 자동 탐색하지 않음).
- 표시 로직은 **파일 존재 기반**. `has_image` 플래그와 무관.
  - `<no>.png`가 있으면 본문 영역에 자동 표시
  - `<no>-1.png ~ <no>-N.png`가 있으면 해당 선택지 아래 자동 표시
- 404는 조용히 숨김 처리 (`Image.onerror`).
- 회차별 README는 `images/<examId>/README.md`. 새 회차 추가 시 손으로 갱신하거나 재생성 스크립트(추가 예정).

## 6. 신규 회차 추가 절차

1. `data/<id>.json` 작성 (위 스키마)
2. `data/index.json`에 항목 추가 (`available: true`)
3. `images/<id>/` 폴더 + 필요 이미지 + README 추가
4. 유니코드 수학 기호가 섞여 있으면 `tools/latexify.cjs` 경로 인자(또는 새 변환 스크립트) 적용
5. `updates.md` 최상단에 버전 + 변경 항목 기록
