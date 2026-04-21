// 유니코드 수학 기호 → LaTeX 변환 스크립트 (일회성)
// 실행: node tools/latexify.cjs

const fs = require('fs');
const path = 'data/electricity-2022-r2.json';
const doc = JSON.parse(fs.readFileSync(path, 'utf8'));

// ---- 매핑 ----
const GREEK = {
  'α':'\\alpha','β':'\\beta','γ':'\\gamma','δ':'\\delta','ε':'\\varepsilon','ζ':'\\zeta',
  'η':'\\eta','θ':'\\theta','ι':'\\iota','κ':'\\kappa','λ':'\\lambda','μ':'\\mu',
  'ν':'\\nu','ξ':'\\xi','π':'\\pi','ρ':'\\rho','σ':'\\sigma','τ':'\\tau',
  'υ':'\\upsilon','φ':'\\varphi','χ':'\\chi','ψ':'\\psi','ω':'\\omega',
  'Γ':'\\Gamma','Δ':'\\Delta','Θ':'\\Theta','Λ':'\\Lambda','Ξ':'\\Xi','Π':'\\Pi',
  'Σ':'\\Sigma','Υ':'\\Upsilon','Φ':'\\Phi','Ψ':'\\Psi','Ω':'\\Omega'
};
const GREEK_CHARS = Object.keys(GREEK).join('');
const GREEK_MACROS = 'alpha|beta|gamma|delta|varepsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega';

const OPS = {
  '∂':'\\partial ','∇':'\\nabla ','∞':'\\infty ','·':'\\cdot ','⋅':'\\cdot ',
  '×':'\\times ','÷':'\\div ','≈':'\\approx ','≠':'\\neq ','≤':'\\le ','≥':'\\ge ',
  '∑':'\\sum ','∏':'\\prod ','∫':'\\int ','→':'\\to ','←':'\\leftarrow ',
  '↔':'\\leftrightarrow ','⊥':'\\perp ','∠':'\\angle ','°':'^{\\circ}',
  '′':"'",'″':"''"
};
const SUP = {
  '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9',
  '⁻':'-','⁺':'+','ⁿ':'n','ⁱ':'i','ᵃ':'a','ᵇ':'b','ᶜ':'c','ᵈ':'d','ᵉ':'e','ᶠ':'f',
  'ᵍ':'g','ʰ':'h','ʲ':'j','ᵏ':'k','ˡ':'l','ᵐ':'m','ᵒ':'o','ᵖ':'p','ʳ':'r','ˢ':'s',
  'ᵗ':'t','ᵘ':'u','ᵛ':'v','ʷ':'w','ˣ':'x','ʸ':'y','ᶻ':'z'
};
const SUB = {
  '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9',
  'ₙ':'n','ₓ':'x','ᵢ':'i','ⱼ':'j','ₖ':'k','ₗ':'l','ₘ':'m','ₚ':'p','ᵣ':'r','ₛ':'s','ₜ':'t'
};

// 기타 기호 (script font 등)
const EXTRA = {
  'ℒ':'\\mathcal{L}','ℱ':'\\mathcal{F}','ℋ':'\\mathcal{H}','ℳ':'\\mathcal{M}',
  '∝':'\\propto ','∈':'\\in ','∉':'\\notin ','∪':'\\cup ','∩':'\\cap ',
  '⇒':'\\Rightarrow ','⇔':'\\Leftrightarrow '
};
// 매크론 (not 논리): Ā → \bar{A}
const PRECOMPOSED_BAR = { 'Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y',
                          'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y' };

// 결합 모자/매크론: x̂ (x + U+0302) → \hat{x}, Ā → \bar{A} 등
const PRECOMPOSED_HAT = { 'â':'a','ê':'e','î':'i','ô':'o','û':'u','ŷ':'y',
                          'Â':'A','Ê':'E','Î':'I','Ô':'O','Û':'U','Ŷ':'Y' };
function handleDiacritics(s) {
  // 결합 circumflex
  let out = s.replace(/([A-Za-z])̂/g, '\\hat{$1}');
  // 결합 macron (U+0304)
  out = out.replace(/([A-Za-z])̄/g, '\\bar{$1}');
  // 미리 합성된 모자
  out = out.replace(/[âêîôûŷÂÊÎÔÛŶ]/g, ch => '\\hat{' + PRECOMPOSED_HAT[ch] + '}');
  // 미리 합성된 매크론 (Ā, Ē ...)
  out = out.replace(/[ĀĒĪŌŪȲāēīōūȳ]/g, ch => '\\bar{' + PRECOMPOSED_BAR[ch] + '}');
  return out;
}

const SUP_CHARS = Object.keys(SUP).join('');
const SUB_CHARS = Object.keys(SUB).join('');

function collapseSup(s) {
  const re = new RegExp('([' + SUP_CHARS + ']+)', 'g');
  return s.replace(re, m => {
    const c = m.split('').map(x => SUP[x] || '').join('');
    return c.length === 1 ? '^' + c : '^{' + c + '}';
  });
}
function collapseSub(s) {
  const re = new RegExp('([' + SUB_CHARS + ']+)', 'g');
  return s.replace(re, m => {
    const c = m.split('').map(x => SUB[x] || '').join('');
    return c.length === 1 ? '_' + c : '_{' + c + '}';
  });
}

// unicode 수학 → LaTeX 본문
function uni2tex(s) {
  if (!s) return s;
  let out = s;
  out = handleDiacritics(out);
  out = collapseSup(out);
  out = collapseSub(out);
  // Extra (script letters etc.)
  out = out.replace(/[ℒℱℋℳ∝∈∉∪∩⇒⇔]/g, ch => EXTRA[ch] || ch);
  // Greek
  const greekRe = new RegExp('[' + GREEK_CHARS + ']', 'g');
  out = out.replace(greekRe, ch => GREEK[ch] || ch);
  // Ops
  out = out.replace(/[∂∇∞·⋅×÷≈≠≤≥∑∏∫→←↔⊥∠°′″]/g, ch => OPS[ch] || ch);
  // 루트: √(...) → \sqrt{...}
  out = out.replace(/√\s*\(([^()]*)\)/g, '\\sqrt{$1}');
  out = out.replace(/√\s*([A-Za-z0-9]+)/g, '\\sqrt{$1}');
  out = out.replace(/√/g, '\\sqrt{}');
  // \greek 뒤 단일 소문자 경계(단일 lowercase + non-letter)는 subscript 규약: \mur → \mu_r
  const subRe = new RegExp('(\\\\(?:' + GREEK_MACROS + '))([a-z])(?![a-zA-Z])', 'g');
  out = out.replace(subRe, '$1_$2');
  // 그 외 영문자 붙어있으면 공백: \muS → \mu S
  const spaceRe = new RegExp('(\\\\(?:' + GREEK_MACROS + '))([A-Za-z])', 'g');
  out = out.replace(spaceRe, '$1 $2');
  return out;
}

// 이 문자열에 수학 기호가 있는가
function hasMath(s) {
  return /[α-ωΑ-Ω∂∇∞⋅·×÷≈≠≤≥∑∏∫√→↔⊥∠°′″ℒℱℋℳ∝∈∉∪∩⇒⇔]/.test(s)
    || /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿⁱᵃᵇᶜᵈᵉᶠᵍʰʲᵏˡᵐᵒᵖʳˢᵗᵘᵛʷˣʸᶻ]/.test(s)
    || /[₀₁₂₃₄₅₆₇₈₉ₙₓᵢⱼₖₗₘₚᵣₛₜ]/.test(s)
    || /̂|̄|[âêîôûŷÂÊÎÔÛŶĀĒĪŌŪȲāēīōūȳ]/.test(s);
}

// 선택지: 한글 포함이면 토큰 단위 변환(convertQuestion 위임), 순수 수식이면 통째 감싸기
function convertChoice(s) {
  if (!s || !hasMath(s)) return s;
  if (/[가-힣]/.test(s)) return convertQuestion(s);
  return '$' + uni2tex(s) + '$';
}

// 문제 본문: 수학 토큰만 $...$로 감쌈.
// 주의: 마침표 '.' 는 소수점으로, middot '·' 는 \cdot 으로 두어야 하므로 구분자에서 제외.
// 단 한글 사이의 middot(정·역전)은 그대로 둔다 → 전처리로 placeholder.
function convertQuestion(s) {
  if (!s || !hasMath(s)) return s;
  // (pre) 한글 사이의 middot 보존
  const KODOT = '';
  let src = s.replace(/([가-힣])·([가-힣])/g, '$1' + KODOT + '$2');
  // (a) 본문 수준에서 "√(...)" 를 선처리 — 토크나이즈로 쪼개지지 않도록.
  let out = src.replace(/√\s*\(([^()]*)\)/g, (m, inner) => '$\\sqrt{' + uni2tex(inner).replace(/\$/g, '') + '}$');
  // (b) 토큰 단위 변환
  out = out.replace(/[^\s가-힣,?!()\[\]{}「」“”"'，。？！]+/g, tok => {
    if (!hasMath(tok)) return tok;
    return '$' + uni2tex(tok) + '$';
  });
  // (c) 연속된 "$a$ $b$" (공백만 사이) → "$a b$"
  out = out.replace(/\$([^$]*)\$\s*\$([^$]*)\$/g, (m, a, b) => '$' + a + ' ' + b + '$');
  // (post) placeholder 복원
  out = out.replace(new RegExp(KODOT, 'g'), '·');
  return out;
}

let changedChoices = 0, changedQ = 0;
doc.questions.forEach(q => {
  const origQ = q.q;
  const newQ = convertQuestion(q.q);
  if (newQ !== origQ) { q.q = newQ; changedQ++; }
  if (Array.isArray(q.c)) {
    q.c = q.c.map(c => {
      const nc = convertChoice(c);
      if (nc !== c) changedChoices++;
      return nc;
    });
  }
});

fs.writeFileSync(path, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log('changed question bodies:', changedQ);
console.log('changed choices:', changedChoices);
