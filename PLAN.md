# PLAN — 향후 작업

> 변경 이력은 [`updates.md`](updates.md), 구조/스키마/모드/AI 등 디테일은 [`docs/`](docs/) 참고.
>
> 이 문서는 **앞으로 할 일** 추적용으로만 사용한다. 완료된 항목은 `updates.md`로 옮긴 뒤 여기서 삭제.

## 진행 중

- (없음)

## 다음 우선순위

1. **2022년 1회 데이터 작성** — 텍스트 소스 입력 대기 중. 들어오면:
   - `data/electricity-2022-r1.json` 작성
   - `data/index.json` `available: true` 플립
   - LaTeX 변환 후 `images/electricity-2022-r1/README.md` 갱신
2. **2021년 r2 / r3 데이터 작성** — 동일 절차
3. **전기공사기사 데이터 추가** — 동일 절차
4. **`tools/latexify.cjs` 일반화** — 현재 데이터 파일 경로가 하드코딩. CLI 인자로 받도록 수정 (회차 추가 때마다 코드 수정 없이 사용 가능하게).

## 이후 (Phase 2)

- 결과 화면에 과목별 정답률 차트
- 일별 풀이량 / 학습 통계
- 오답노트 자동 모음 (red 태그 기반)
- iOS 홈스크린용 PNG `apple-touch-icon` (180×180) 추가
- Service Worker로 오프라인 지원

## 데드 / 보류

- ~~과목별 모드 / 홈 북마크 단축 진입 메뉴~~ — v1.05에서 제거.
- ~~답안 localStorage 영구 저장~~ — v1.05에서 정책 변경(메모리만).
- `vercel.json` 빌드 우회 설정 — 한 번 추가했다가 되돌림. 빌드 실패가 재발하면 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) §1 가이드 참고.
