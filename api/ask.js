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

const SYSTEM_PROMPT = `너는 전기기사/전기공사기사 필기시험 전문 강사다. 주어진 문제를 학습자가 이해하도록 한국어로 설명하라.
- 개념, 공식, 풀이 과정을 단계별로 짚어준다.
- 자주 틀리는 함정이나 헷갈리는 유사 개념을 덧붙인다.
- 수식은 KaTeX로 렌더링될 수 있도록 LaTeX 구문을 사용한다. 인라인은 $...$, 블록은 $$...$$ 로 감싼다. 예: $V = IR$, $$\\int_0^T v(t)\\,dt$$. 평문 수식 문자(μ, Ω, π 등)는 그대로 써도 된다.
- 사족 없이 핵심 위주로 간결하게 답한다.`;

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
