# 이미지 리소스

문제에 포함되는 그림/도식을 저장하는 폴더. 자세한 규약은 [`../docs/DATA-SCHEMA.md`](../docs/DATA-SCHEMA.md) §5 참고.

## 빠른 규칙

- 폴더: `images/<examId>/` (예: `images/electricity-2025-r1/`)
- 본문 이미지: `<문제번호>.png` (예: `4.png`)
- 선택지 이미지: `<문제번호>-<선택지>.png` (예: `71-1.png`, `71-2.png`)
- 포맷: **PNG만** (다른 확장자는 자동 탐색되지 않음)
- 표시는 **파일 존재 기반**. JSON의 `has_image` 플래그와 무관.

## 회차별 폴더

| 회차 | 상태 |
|------|------|
| electricity-2025-r1 ~ r5 | 활성 |
| electricity-2022-r2     | 활성 |
| 그 외                    | 준비 중 |

각 폴더의 `README.md`에 본문/선택지 이미지 표가 있다.

## 작동 방식

- `app.js renderDetail`: `<no>.png`를 본문 영역에, `<no>-1.png ~ <no>-N.png`를 각 선택지 아래에 자동 표시. 404는 조용히 숨김.
- `fetchQuestionImages` (Part 5): 본문 + 선택지 이미지 모두 base64로 읽어 Gemini에 멀티모달 첨부.
