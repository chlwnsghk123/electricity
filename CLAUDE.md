# CLAUDE.md — 전기기사 CBT 시뮬레이터

이 문서는 Claude Code 에이전트가 이 레포에서 작업할 때 **가장 먼저 읽는 진입점**이다.
세부 내용은 모두 [`docs/`](docs/)에 분리되어 있다. 길어지면 절대 한 곳에 몰지 말고 그쪽을 갱신할 것.

---

## 0. 프로젝트 한 줄 요약

전기기사 / 전기공사기사 **필기시험 CBT 시뮬레이터**. 정적 SPA(Vanilla JS) + Vercel Serverless 1개(`api/ask.js`).
빌드 단계 없음. `git push` → Vercel 자동 배포.

---

## 1. 무엇부터 읽나 (작업 종류별 라우팅)

| 작업 | 먼저 읽을 문서 |
|---|---|
| 코드 구조 / 파일 위치 / app.js 섹션 맵 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 회차/문제 JSON 추가·편집, 이미지 규칙 | [`docs/DATA-SCHEMA.md`](docs/DATA-SCHEMA.md) |
| localStorage 키, 상태, 자동 태그 정책 | [`docs/STORAGE.md`](docs/STORAGE.md) |
| 화면(view) · 모드(study/random/exam) 동작 | [`docs/UI-MODES.md`](docs/UI-MODES.md) |
| Gemini 프록시, 멀티모달, 환경변수 | [`docs/AI-INTEGRATION.md`](docs/AI-INTEGRATION.md) |
| Vercel 배포, 환경변수, PWA | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| 자주 하는 작업 절차 / 트러블슈팅 / 커밋 규칙 | [`docs/WORKFLOW.md`](docs/WORKFLOW.md) |
| 향후 로드맵 / 미진 항목 | [`PLAN.md`](PLAN.md) |
| 변경 이력 (vN.NN) | [`updates.md`](updates.md) |

## 2. 황금률 (반드시)

1. **짧은 단계 반복**. 한 응답에 도구 호출 2~4개. 긴 작업은 나눠서.
2. **브리핑**: 시작 1~2줄, 끝 1~2줄. 장문 서사 금지.
3. **푸시 전 `node --check`** (빌드 단계 없음 → 문법 오류는 직접 잡아야 함).
4. **변경 후 [`updates.md`](updates.md) 최상단에 vN.NN 항목 추가**.
5. **사용자 명시 허락 없이는** main 머지/푸시 / `git push --force` / `git reset --hard` 금지. 되돌리기는 `git revert`로.
6. **새 정보가 생기면 적절한 `docs/*.md` 갱신**. CLAUDE.md 자체에 절차/스키마를 새로 적지 말 것.

## 3. 핵심 파일 (자주 만짐)

```
index.html · styles.css · app.js          # 프런트
api/ask.js                                # Gemini 프록시
data/index.json · data/electricity-*.json # 회차 매니페스트 + 데이터
images/electricity-*/                     # 회차별 이미지
tools/latexify.cjs                        # 일회성 변환
```

## 4. 현재 회차 상태 (요지)

- 활성: 2025년 1회 세트1~3, 2025년 3회 세트1~2, 2022년 2회 (총 6개)
- 준비 중: 2022년 1회, 2021년 r2/r3, 전기공사기사 등
- 정확한 목록은 [`data/index.json`](data/index.json) 가 SoT.

## 5. 작업 브랜치

기본 작업 브랜치는 사용자가 세션마다 지정한다 (env 또는 system prompt 참고).
사용자 명시 허락 없이 다른 브랜치에 푸시하지 말 것.

---

**막힐 때**: [`docs/WORKFLOW.md`](docs/WORKFLOW.md)의 트러블슈팅 표를 먼저 보라.
**모르겠으면** 사용자에게 1줄로 묻기. 추측으로 진행하지 말 것.
