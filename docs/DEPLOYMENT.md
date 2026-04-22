# 배포 (DEPLOYMENT)

## 1. 호스팅

- **Vercel** 정적 호스팅 + Serverless. 빌드 단계 없음.
- `git push` → 자동 배포.
- `vercel.json` 없음. Vercel 기본 설정으로 동작.
- **주의**: `package.json`이 있어 Vercel이 Node 프로젝트로 인식하면 `npm run build` 시도 가능. `package.json`에 `build` 스크립트 없음. 빌드 실패 시:
  - Vercel 대시보드 → Settings → Build & Output → Framework Preset: **Other**, Build Command 비움, Output Directory `.`
  - 또는 `vercel.json` 추가 (이전에 한 번 시도했다가 되돌림)

## 2. 환경변수

| 키 | 어디서 사용 | 값 |
|---|---|---|
| `VITE_GEMINI_API_KEY` | `api/ask.js` | Gemini API 키 (사용자 기존 설정 호환) |
| `GEMINI_API_KEY` | `api/ask.js` (위 키 없을 때 fallback) | 동일 키 |

Vercel 대시보드 → Project → Settings → Environment Variables 에서 설정.

## 3. 의존성

- 프런트: 의존성 없음 (CDN으로 Pretendard, KaTeX만 로드).
- 서버리스: `@google/generative-ai` 1개 (`package.json`).

## 4. 도메인 / 라우팅

- 진입점: `index.html` (루트)
- API: `/api/ask` (Vercel이 `api/ask.js`를 자동으로 함수로 매핑)
- 정적: `data/*.json`, `images/**/*.png`, `styles.css`, `app.js`, `manifest.webmanifest`, `*.svg`

## 5. PWA

- `manifest.webmanifest` 등록 (홈 헤더 `<link rel="manifest">`)
- `theme-color` `#ffffff`
- 아이콘: `icon.svg` (any maskable), `favicon.svg`
- iOS Safari 홈스크린은 PNG `apple-touch-icon`이 필요. 현재는 SVG로만 제공 — 필요 시 추후 PNG 추가.

## 6. 로컬 개발

```bash
# 정적 파일만 (API 미작동)
python3 -m http.server 8000
# 또는
npx http-server -p 8000

# Vercel CLI로 API까지 (선택)
npx vercel dev
```

## 7. 배포 전 체크리스트

- [ ] `node --check app.js` (또는 브라우저 콘솔에서 에러 없음 확인)
- [ ] `node --check api/ask.js`
- [ ] `data/index.json`의 신규 `available: true` 항목들이 모두 실제 파일 존재
- [ ] `updates.md` 최신 버전 항목 작성됨
- [ ] 푸시는 작업 브랜치에. main 머지는 사용자 결정.
