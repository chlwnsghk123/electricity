// Vercel Serverless Function — Gemini API 프록시
// POST /api/ask
// body: {
//   card:    { no, subject, q, c[], a, has_image? },
//   question: string,
//   history: [{ role:'user'|'model', content }],
//   images:  [{ mime, dataBase64 }]   // 선택 — 문제 이미지(멀티모달)
// }
// response: { answer } | { error }

import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_PRIMARY  = 'models/gemini-3-flash-preview';
const MODEL_FALLBACK = 'gemini-1.5-flash';

const SYSTEM_PROMPT = `너는 전기기사/전기공사기사 필기시험 전문 강사다. 모바일 화면에서 빠르게 읽을 수 있도록 아주 간결하게 한국어로 답해라.

[응답 규칙]
- 기본 길이: 총 5~8줄 이내, 공백 포함 400자 이내를 목표로 한다. 사용자가 명시적으로 "자세히/길게/증명/유도"를 요구할 때만 더 길게 쓴다.
- 서두의 인사·요약 반복·메타 설명 금지. 바로 본론부터 시작한다.
- 구조: ① 결론 한 줄 → ② 핵심 공식/근거 1~2줄 → ③ (필요 시) 핵심 계산 1~2줄. 번호·불릿은 최소한으로.
- 자주 틀리는 함정은 한 줄로만 덧붙인다 (없으면 생략).
- 평이한 말투. 반복·수식어·감탄 없음. 마침표 최소화 허용.

[수식]
- KaTeX 렌더링용 LaTeX 구문 사용. 인라인은 $...$, 블록은 $$...$$ 로 감싼다. 예: $V = IR$, $$\\int_0^T v(t)\\,dt$$.
- 평문 수식 기호(μ, Ω, π 등)는 그대로 써도 된다.`;

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function buildContext(card) {
  const choices = (card.c || []).map((t, i) => `${i + 1}) ${t}`).join('\n');
  return [
    `[문제 번호] ${card.no}`,
    `[과목] ${card.subject}`,
    `[문제]`,
    card.q,
    `[선택지]`,
    choices,
    `[정답 번호] ${card.a}`,
    card.has_image ? `[참고] 아래 첨부 이미지가 이 문제의 그림이다.` : null
  ].filter(Boolean).join('\n');
}

async function generate(modelName, apiKey, card, question, history, images) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT
  });

  const mapped = (history || [])
    .filter(h => h && (h.role === 'user' || h.role === 'model') && h.content)
    .map(h => ({ role: h.role, parts: [{ text: String(h.content) }] }));
  while (mapped.length > 0 && mapped[0].role !== 'user') mapped.shift();

  const parts = [];
  parts.push({ text: [
    '다음 문제에 대한 질문에 답해 줘.',
    '',
    buildContext(card),
    '',
    '---',
    `질문: ${question}`
  ].join('\n') });

  // 이미지 parts 추가(있을 때만)
  (images || []).forEach(img => {
    if (!img || !img.mime || !img.dataBase64) return;
    parts.push({ inlineData: { mimeType: img.mime, data: img.dataBase64 } });
  });

  const chat = model.startChat({ history: mapped });
  const result = await chat.sendMessage(parts);
  const text = result?.response?.text?.();
  return text || '';
}

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 허용됩니다' });
    return;
  }

  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Gemini API 키가 설정되지 않았습니다 (VITE_GEMINI_API_KEY)' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const { card, question, history, images } = body;
  if (!card || !question) {
    res.status(400).json({ error: 'card와 question이 필요합니다' });
    return;
  }

  try {
    let answer = '';
    try {
      answer = await generate(MODEL_PRIMARY, apiKey, card, question, history, images);
    } catch (err) {
      console.warn('primary model failed, fallback:', err?.message || err);
      answer = await generate(MODEL_FALLBACK, apiKey, card, question, history, images);
    }
    if (!answer) {
      res.status(502).json({ error: '모델이 빈 응답을 반환했습니다' });
      return;
    }
    res.status(200).json({ answer });
  } catch (err) {
    console.error('ask handler error:', err);
    res.status(500).json({ error: 'AI 호출 실패: ' + (err?.message || '알 수 없는 오류') });
  }
}
