# docs 인덱스

Claude Code 에이전트와 사람이 모두 빠르게 참조할 수 있는 디테일 문서들. 진입점은 [`../CLAUDE.md`](../CLAUDE.md).

| 파일 | 다루는 주제 |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 파일 트리, app.js Part 섹션 맵, 화면 흐름, 빌드/실행 |
| [DATA-SCHEMA.md](DATA-SCHEMA.md) | manifest, 회차 JSON 필드, LaTeX·이미지 규칙, 신규 회차 추가 절차 |
| [STORAGE.md](STORAGE.md) | localStorage 키, 메모리 state, 자동 태그 정책, 진행률 계산 |
| [UI-MODES.md](UI-MODES.md) | 5개 화면 + 3개 모드 동작, 헤더 정책, 6색 태그, 메모/AI 시트 |
| [AI-INTEGRATION.md](AI-INTEGRATION.md) | Gemini 프록시, 멀티모달 첨부, 시스템 프롬프트, 환경변수 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Vercel 배포, env, PWA, 로컬 개발, 체크리스트 |
| [WORKFLOW.md](WORKFLOW.md) | 자주 하는 작업 절차, 트러블슈팅, 커밋 메시지 규칙 |

## 갱신 정책

- 코드 변경이 어느 docs 항목과 충돌하면 **그 docs를 즉시 갱신**한다.
- CLAUDE.md에는 절차/스키마/숫자를 직접 적지 않고, 항상 docs/* 로 링크.
- 변경 이력은 [`../updates.md`](../updates.md) 한 곳에서 관리. 여기서는 "현재 상태"만 다룬다.
