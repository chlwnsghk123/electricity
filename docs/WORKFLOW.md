# 에이전트 작업 워크플로우 (WORKFLOW)

이 프로젝트에서 자주 발생하는 작업들을 절차로 정리한다. 새 세션이 시작되면 CLAUDE.md → 이 문서를 차례로 본다.

---

## 0. 황금률

1. **짧은 단계 반복**. 한 번의 응답에 도구 호출 2~4개. 긴 작업은 분할.
2. **브리핑**: 시작 1~2줄, 끝 1~2줄. 장문 서사 금지.
3. **의도된 브랜치에만 푸시**. main 머지는 사용자가 한다.
4. **푸시 전 `node --check`**. 정적 사이트라 빌드가 없으니 문법 오류는 직접 잡아야 한다.
5. **변경 후 `updates.md` 갱신**. 버전 + 날짜 + 변경 항목 한 줄씩.

---

## 1. 새 회차 추가하기

```
1) data/<id>.json 작성 (DATA-SCHEMA.md §2)
2) data/index.json에 항목 추가 (initially available: false)
3) 유니코드 수학 → LaTeX 변환 필요 시: tools/latexify.cjs 사용
4) images/<id>/ 생성 + 필요 이미지 + README.md
5) data/index.json available: true 로 플립
6) updates.md vN.NN 항목
7) 커밋 (feat: add <id>) + 푸시
```

LaTeX 변환은 `node tools/latexify.cjs`. 현재 스크립트는 경로가 하드코딩되어 있으니 새 회차마다 파일 상단 path 변수 수정 필요. (TODO: CLI 인자 받게 일반화.)

## 2. 문제 데이터 수정하기

- 직접 JSON 편집. 백슬래시는 `\\`로 이스케이프.
- 1문제 단위면 손편집, 일괄 변환이면 `tools/`에 일회성 .cjs 추가.

## 3. UI 변경하기

- HTML 마크업 변경 → `index.html` 직접
- 스타일 → `styles.css`. 색은 `:root` 토큰 우선 사용
- 동작 → `app.js` 해당 Part. 새 함수면 같은 Part 끝에 추가
- 새 화면 추가 시:
  1. `index.html`에 `<section class="screen hidden" id="...">`
  2. `app.js` `show()` 의 map에 추가
  3. `render*()` 함수 + `bindEvents()` 안에 핸들러

## 4. 새 모드 추가하기

1. `index.html` `#modes-view` 에 `.mode-card` 추가 (`data-mode="..."`)
2. `app.js` `enterMode(mode)` 에 분기 추가
3. 상태/UX는 `state.mode === '...'` 체크로 분기
4. 진행률/태그/메모 정책은 STORAGE.md §3 정책 따름

## 5. 새 LS 키 추가 / 스키마 변경

- 새 키: `LS` 객체에 추가, 헬퍼 작성
- 파괴적 변경: 키의 `vN` 부분을 올린다 (예: `_v1` → `_v2`). 옛 키는 무시.
- STORAGE.md 표 갱신.

## 6. AI 동작 조정

- 시스템 프롬프트: `api/ask.js` `SYSTEM_PROMPT`
- 모델 변경: `MODEL_PRIMARY` / `MODEL_FALLBACK`
- 추천 질문: `app.js` `renderAiSheet()` 안의 suggestions 배열
- 멀티모달 첨부 정책: `fetchQuestionImages()`

## 7. 자주 쓰는 명령

```bash
# 문법 체크
node --check app.js
node --check api/ask.js
node --check tools/latexify.cjs

# 회차 데이터에 has_image 통계 보기
node -e 'const d=JSON.parse(require("fs").readFileSync("data/<file>.json","utf8")); console.log(d.questions.filter(q=>q.has_image).map(q=>q.no))'

# 폴더 내 이미지 목록
ls images/<id>/

# 빠른 회차 요약
node -e 'const d=JSON.parse(require("fs").readFileSync("data/<file>.json","utf8")); console.log(d.meta.round, d.questions.length)'
```

## 8. 커밋 메시지 규칙

- prefix: `feat:`, `fix:`, `data:`, `docs:`, `chore:`, `refactor:`, `style:`
- 한 줄 요지 + (선택) 본문에 무엇을/왜
- HEREDOC으로 multi-line 작성 (Bash 도구 사용 가이드 참고)

## 9. 파괴적 작업 전 확인

- `git revert`, `git reset --hard`, `git checkout --`, `rm -rf` 등은 **사용자 명시 허락 후에만**
- 푸시 후 되돌리기는 `git revert` (history 보존). `git push --force`는 금지.

## 10. 트러블슈팅 메모

| 증상 | 점검 |
|---|---|
| 회차가 홈에서 비활성으로 보임 | `data/index.json`의 `available` 확인 |
| 문제는 보이는데 이미지 안 뜸 | 파일명/확장자(.png), 폴더 (`images/<examId>/`), 404 응답 확인 |
| LaTeX이 `$...$` 그대로 보임 | KaTeX CDN 로드 실패 또는 `renderMath()` 호출 누락 |
| AI가 401/403 | 환경변수 `VITE_GEMINI_API_KEY` 또는 `GEMINI_API_KEY` 미설정 |
| 진행률이 안 바뀜 | 모드/결과 화면 → 뒤로 갈 때 `renderHome()`/`renderModes()` 호출 누락 |
