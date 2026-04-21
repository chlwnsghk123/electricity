// 전기기사 CBT 시뮬레이터 — app.js
// 구성: 상수/스토리지 → 상태 → 유틸 → 초기화. 렌더/이벤트 섹션은 후속 블록에서 이어 붙인다.

// ============================================================
// 1. 상수 · localStorage 키 · 패스 기준
// ============================================================
const LS = {
  bookmarks: 'cbt_bookmarks_v1', // { [examId]: number[] }
  tags:      'cbt_tags_v1',      // { [examId]: { [no]: color } }
  answers:   'cbt_answers_v1',   // { [examId]: { [no]: selectedIdx(1-based) } }
  session:   'cbt_session_v1',   // { examId, mode, startedAt, elapsedMs, lastNo, subject? }
  lastExam:  'cbt_last_exam_v1', // string examId
  settings:  'cbt_settings_v1'   // { theme, fontSize }
};

const TAG_COLORS = ['red', 'orange', 'yellow', 'green', 'blue'];
const TAG_LABEL = {
  red: '빨강', orange: '주황', yellow: '노랑', green: '초록', blue: '파랑'
};

// 과목당 20문제 기준 환산 — 과락 40점 미만(=8문제), 평균 60점 이상(=12문제).
const PASS = { perSubjectMin: 8, averageMin: 12 };

const EXAM_TIME_LIMIT_MS = 150 * 60 * 1000; // 150분
const TIMER_WARN_MS = 10 * 60 * 1000;       // 남은 시간 10분 이하 → 경고색

const CIRCLED = ['①', '②', '③', '④', '⑤'];

// ============================================================
// 2. 전역 상태
// ============================================================
const state = {
  manifest: null,          // data/index.json
  exam: null,              // 현재 로드된 회차 JSON
  examId: null,            // 현재 회차 id

  view: 'home',            // 'home' | 'list' | 'detail' | 'result'
  mode: null,              // 'exam' | 'study' | 'subject'

  subjectFilter: 'all',    // 'all' | subject name
  tagFilter: null,         // null | 'bookmark' | color
  search: '',

  currentNo: null,         // 상세 뷰에서 보고 있는 문제 번호
  filteredNos: [],         // 상세 뷰 prev/next 순환에 사용

  timer: {
    startedAt: 0,
    limitMs: EXAM_TIME_LIMIT_MS,
    intervalId: null,
    running: false
  },

  ai: {
    open: false,
    messages: [],          // [{role:'user'|'ai', content, loading?, error?}]
    dragStartY: 0,
    dragY: 0,
    dragging: false
  },

  // 과목 이름 ↔ 번호 매핑(현재 회차 기준, loadExam 시 설정)
  subjectNames: [],        // ['전기자기학', ...]
  subjectBy: {}            // { [subject_no]: name }
};

// ============================================================
// 3. 유틸
// ============================================================
const qs  = (sel, root) => (root || document).querySelector(sel);
const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'dataset') Object.assign(n.dataset, attrs[k]);
      else if (k.startsWith('on') && typeof attrs[k] === 'function') {
        n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
  }
  if (children != null) {
    const arr = Array.isArray(children) ? children : [children];
    arr.forEach(c => {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
  }
  return n;
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function preview(text, n = 80) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function formatTime(ms) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// AI 메시지용 아주 얇은 인라인 Markdown 렌더러: **bold**, *italic*, `code`, 불릿 `- `
function renderMarkdownInline(src) {
  const lines = String(src ?? '').split('\n');
  const out = [];
  let inList = false;
  const inline = s => escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  for (const raw of lines) {
    const m = /^\s*[-•]\s+(.*)$/.exec(raw);
    if (m) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + inline(m[1]) + '</li>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(inline(raw));
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n').replace(/\n(?!<\/?(ul|li)>)/g, '<br>');
}

let _toastTimer = null;
function toast(msg, ms = 1800) {
  const t = qs('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 220);
  }, ms);
}

function show(view) {
  state.view = view;
  const map = { home: '#home', list: '#list-view', detail: '#detail-view', result: '#result-view' };
  qsa('.screen').forEach(s => s.classList.add('hidden'));
  const target = map[view] && qs(map[view]);
  if (target) target.classList.remove('hidden');
  const loading = qs('#loading');
  if (loading) loading.classList.add('hidden');
  window.scrollTo(0, 0);
}

// ============================================================
// 4. localStorage 헬퍼 (per-exam 스코프)
// ============================================================
function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function patchLS(key, fallback, patcher) {
  const cur = loadLS(key, fallback);
  const next = patcher(cur) ?? cur;
  saveLS(key, next);
  return next;
}

function _examScope(key, fallback) {
  const all = loadLS(key, {});
  const id = state.examId;
  if (!id) return fallback;
  if (all[id] == null) all[id] = fallback;
  return all[id];
}

function getBookmarks() {
  const arr = _examScope(LS.bookmarks, []);
  return new Set(arr);
}
function toggleBookmark(no) {
  patchLS(LS.bookmarks, {}, all => {
    const id = state.examId;
    const set = new Set(all[id] || []);
    if (set.has(no)) set.delete(no); else set.add(no);
    all[id] = Array.from(set).sort((a, b) => a - b);
    return all;
  });
}

function getTags() {
  return _examScope(LS.tags, {});
}
function getTag(no) {
  return getTags()[no] || null;
}
function setTag(no, color) {
  patchLS(LS.tags, {}, all => {
    const id = state.examId;
    const m = { ...(all[id] || {}) };
    if (!color || m[no] === color) delete m[no];
    else m[no] = color;
    all[id] = m;
    return all;
  });
}

function getAnswers() {
  return _examScope(LS.answers, {});
}
function getAnswer(no) {
  const v = getAnswers()[no];
  return typeof v === 'number' ? v : null;
}
function setAnswer(no, idx) {
  patchLS(LS.answers, {}, all => {
    const id = state.examId;
    const m = { ...(all[id] || {}) };
    m[no] = idx;
    all[id] = m;
    return all;
  });
}
function resetExamAnswers() {
  patchLS(LS.answers, {}, all => { all[state.examId] = {}; return all; });
}

function loadSession() {
  return loadLS(LS.session, null);
}
function saveSession(partial) {
  const cur = loadSession() || {};
  saveLS(LS.session, { ...cur, ...partial });
}
function clearSession() {
  localStorage.removeItem(LS.session);
}

// ============================================================
// 5. 데이터 로드 · 초기화
// ============================================================
async function loadManifest() {
  const res = await fetch('data/index.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
  state.manifest = await res.json();
  return state.manifest;
}

async function loadExam(examId) {
  const entry = state.manifest.exams.find(e => e.id === examId);
  if (!entry) throw new Error('unknown exam: ' + examId);
  const res = await fetch(entry.file, { cache: 'no-store' });
  if (!res.ok) throw new Error('exam fetch failed: ' + res.status);
  const exam = await res.json();
  state.exam = exam;
  state.examId = examId;

  // subject 번호/이름 매핑 구축
  const subs = (exam.meta && exam.meta.subjects) || [];
  state.subjectNames = subs.map(s => s.name);
  state.subjectBy = {};
  subs.forEach(s => { state.subjectBy[s.no] = s.name; });

  saveLS(LS.lastExam, examId);
  return exam;
}

function subjectNameOf(q) {
  // 데이터에서 subject는 번호(1~5). 이름으로 변환.
  if (typeof q.subject === 'string') return q.subject;
  return state.subjectBy[q.subject] || '기타';
}

function resolveLastExam() {
  const stored = loadLS(LS.lastExam, null);
  const list = (state.manifest && state.manifest.exams) || [];
  if (stored && list.some(e => e.id === stored)) return stored;
  return list[0] && list[0].id;
}

async function bootstrap() {
  try {
    await loadManifest();
    const id = resolveLastExam();
    if (!id) throw new Error('등록된 회차가 없습니다');
    await loadExam(id);
    // 렌더/이벤트 바인딩은 후속 블록에서 이어 붙인다.
    if (typeof renderHome === 'function') renderHome();
    if (typeof bindEvents === 'function') bindEvents();
    show('home');
  } catch (err) {
    console.error(err);
    const loading = qs('#loading');
    if (loading) loading.textContent = '데이터를 불러오지 못했습니다. 새로고침 해 주세요.';
    toast('초기화 실패: ' + (err.message || err));
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);

// ============================================================
// 6. 필터링 · 파생 데이터
// ============================================================
function filteredQuestions() {
  if (!state.exam) return [];
  const qs_ = state.exam.questions;
  const bookmarks = getBookmarks();
  const tags = getTags();
  const sf = state.subjectFilter;
  const tf = state.tagFilter;
  const search = state.search.trim().toLowerCase();

  return qs_.filter(q => {
    if (sf !== 'all' && subjectNameOf(q) !== sf) return false;
    if (tf === 'bookmark' && !bookmarks.has(q.no)) return false;
    if (tf && tf !== 'bookmark' && tags[q.no] !== tf) return false;
    if (search) {
      const hay = (q.q + ' ' + (q.c || []).join(' ')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

// ============================================================
// 7. 홈 렌더
// ============================================================
function renderHome() {
  const sub = qs('#home-sub');
  if (sub && state.exam) {
    sub.textContent = `${state.exam.meta.exam} · ${state.exam.meta.round} · ${state.exam.meta.total_questions}문제`;
  }

  const picker = qs('#exam-picker');
  if (picker) {
    picker.innerHTML = '';
    (state.manifest.exams || []).forEach(e => {
      const active = e.id === state.examId;
      picker.appendChild(el('button', {
        class: 'exam-chip' + (active ? ' active' : ''),
        dataset: { action: 'pick-exam', examId: e.id }
      }, [
        el('span', null, e.title),
        el('span', { class: 'count' }, `${e.count}문항`)
      ]));
    });
  }
}

// ============================================================
// 8. 리스트 뷰 렌더
// ============================================================
function renderList() {
  const title = qs('#list-title');
  if (title) {
    if (state.mode === 'exam') title.textContent = '모의고사';
    else if (state.mode === 'subject') title.textContent = `과목별 · ${state.subjectFilter === 'all' ? '선택' : state.subjectFilter}`;
    else if (state.mode === 'bookmarks') title.textContent = '북마크 · 태그';
    else title.textContent = '학습 모드';
  }

  // 타이머
  const timerEl = qs('#list-timer');
  if (timerEl) {
    if (state.mode === 'exam' && state.timer.running) {
      timerEl.classList.remove('hidden');
    } else {
      timerEl.textContent = '';
      timerEl.classList.remove('warn');
    }
  }

  // 과목 탭 (모의고사/학습 모드에서 노출)
  const tabs = qs('#subject-tabs');
  if (tabs) {
    tabs.innerHTML = '';
    if (state.mode === 'subject') {
      tabs.classList.add('hidden');
    } else {
      tabs.classList.remove('hidden');
      const names = ['all', ...state.subjectNames];
      names.forEach(n => {
        const label = n === 'all' ? '전체' : n;
        tabs.appendChild(el('button', {
          class: 'subject-tab' + (state.subjectFilter === n ? ' active' : ''),
          dataset: { action: 'subject-tab', name: n }
        }, label));
      });
    }
  }

  // 필터 칩 (북마크/5색)
  const chips = qs('#filter-chips');
  if (chips) {
    chips.innerHTML = '';
    const mk = (key, label, dotClass) => {
      const active = state.tagFilter === key;
      const children = [];
      if (dotClass) children.push(el('span', { class: 'dot ' + dotClass }));
      children.push(document.createTextNode(label));
      return el('button', {
        class: 'filter-chip' + (active ? ' active' : ''),
        dataset: { action: 'tag-filter', key }
      }, children);
    };
    chips.appendChild(mk('bookmark', '★ 북마크'));
    TAG_COLORS.forEach(c => chips.appendChild(mk(c, TAG_LABEL[c], c)));
  }

  // 검색 input 동기화
  const searchInput = qs('#search-input');
  if (searchInput && searchInput.value !== state.search) {
    searchInput.value = state.search;
  }

  // 카드 리스트
  const list = qs('#question-list');
  if (list) {
    list.innerHTML = '';
    const items = filteredQuestions();
    state.filteredNos = items.map(q => q.no);
    if (items.length === 0) {
      list.appendChild(el('div', { class: 'loading' }, '조건에 맞는 문제가 없습니다.'));
    } else {
      const bookmarks = getBookmarks();
      const tags = getTags();
      items.forEach(q => list.appendChild(renderQuestionCard(q, bookmarks, tags)));
    }
  }

  // 제출 버튼 (모의고사 전용)
  const submitBtn = qs('#btn-submit-exam');
  if (submitBtn) {
    if (state.mode === 'exam') {
      submitBtn.classList.remove('hidden');
      const answered = Object.keys(getAnswers()).length;
      submitBtn.disabled = answered === 0;
      submitBtn.textContent = answered === 0 ? '시험 제출하기 (답변 없음)' : `시험 제출하기 (${answered}/${state.exam.questions.length})`;
    } else {
      submitBtn.classList.add('hidden');
    }
  }
}

function renderQuestionCard(q, bookmarks, tags) {
  const answer = getAnswer(q.no);
  let cls = 'q-card';
  if (answer != null) {
    if (state.mode === 'exam') cls += ' answered';
    else cls += answer === q.a ? ' answered-correct' : ' answered-wrong';
  }
  const rightChildren = [];
  if (bookmarks.has(q.no)) rightChildren.push(el('span', { class: 'bookmark-on', title: '북마크' }, '★'));
  if (tags[q.no]) rightChildren.push(el('span', { class: 'tag-dot dot ' + tags[q.no] }));

  const subName = subjectNameOf(q);
  const sub = el('div', { class: 'q-sub' }, [
    el('span', { class: 'subject-badge' }, subName),
    (q.has_image ? el('span', null, '📷') : null),
    (q.has_formula ? el('span', null, '∑') : null)
  ]);

  return el('button', {
    class: cls,
    dataset: { action: 'open-detail', no: String(q.no) }
  }, [
    el('div', { class: 'q-left' }, String(q.no)),
    el('div', { class: 'q-main' }, [
      el('div', { class: 'q-preview' }, preview(q.q, 80)),
      sub
    ]),
    el('div', { class: 'q-right' }, rightChildren)
  ]);
}

// ============================================================
// 9. 상세 뷰 렌더
// ============================================================
function renderDetail(no) {
  if (!state.exam) return;
  const q = state.exam.questions.find(x => x.no === no);
  if (!q) return;
  state.currentNo = no;
  saveSession({ examId: state.examId, mode: state.mode, lastNo: no });

  qs('#detail-title').textContent = `문제 ${q.no}`;

  const subjectBadge = qs('#detail-subject');
  subjectBadge.textContent = subjectNameOf(q);

  qs('#detail-no').textContent = `No. ${q.no}`;
  qs('#detail-question').textContent = q.q;

  const note = qs('#detail-image-note');
  if (q.has_image && q.image_note) {
    note.textContent = '📷 ' + q.image_note;
    note.classList.remove('hidden');
  } else {
    note.textContent = '';
  }

  // 북마크 버튼
  const bm = qs('#btn-bookmark');
  const bookmarks = getBookmarks();
  if (bookmarks.has(q.no)) {
    bm.textContent = '★';
    bm.classList.add('on');
  } else {
    bm.textContent = '☆';
    bm.classList.remove('on');
  }

  // 선택지
  const choices = qs('#detail-choices');
  choices.innerHTML = '';
  const selected = getAnswer(q.no);
  (q.c || []).forEach((text, i) => {
    const idx = i + 1;
    let cls = 'choice-btn';
    if (selected === idx) cls += ' selected';
    // 학습/과목 모드: 답을 한 번이라도 찍었으면 정오답 색 노출
    if (state.mode !== 'exam' && selected != null) {
      if (idx === q.a) cls += ' correct';
      else if (idx === selected) cls += ' wrong';
    }
    choices.appendChild(el('button', {
      class: cls,
      dataset: { action: 'choose', idx: String(idx) }
    }, [
      el('span', { class: 'num' }, CIRCLED[i] || String(idx)),
      el('span', { class: 'choice-text' }, text)
    ]));
  });

  // 정답 노출 (학습/과목 모드 + 답 선택 상태)
  const answerBox = qs('#detail-answer');
  if (state.mode !== 'exam' && selected != null) {
    const isOk = selected === q.a;
    answerBox.innerHTML = `<strong>정답: ${CIRCLED[q.a - 1]}</strong> · 내 답: ${CIRCLED[selected - 1]} ${isOk ? '(정답)' : '(오답)'}`;
    answerBox.classList.remove('hidden');
  } else {
    answerBox.classList.add('hidden');
    answerBox.innerHTML = '';
  }

  // 태그 피커
  const picker = qs('#tag-picker');
  picker.innerHTML = '';
  const curTag = getTag(q.no);
  TAG_COLORS.forEach(c => {
    picker.appendChild(el('button', {
      class: 'tag-btn ' + c + (curTag === c ? ' active' : ''),
      dataset: { action: 'tag', color: c },
      'aria-label': TAG_LABEL[c]
    }, [el('span', { class: 'circle' })]));
  });

  // prev/next — 필터된 리스트 안에서 순환
  const list = state.filteredNos.length ? state.filteredNos : state.exam.questions.map(x => x.no);
  const pos = list.indexOf(no);
  const prevBtn = qs('#btn-prev');
  const nextBtn = qs('#btn-next');
  prevBtn.disabled = pos <= 0;
  nextBtn.disabled = pos === -1 || pos >= list.length - 1;
}

// ============================================================
// 10. 결과 뷰 렌더 · 채점
// ============================================================
function grade() {
  const byS = {}; // subject name → {correct,total}
  state.exam.questions.forEach(q => {
    const s = subjectNameOf(q);
    byS[s] ??= { correct: 0, total: 0 };
    byS[s].total++;
    if (getAnswer(q.no) === q.a) byS[s].correct++;
  });
  const scores = state.subjectNames.map(s => {
    const v = byS[s] || { correct: 0, total: 0 };
    const score20 = v.total > 0 ? Math.round(v.correct / v.total * 20) : 0;
    return { subject: s, correct: v.correct, total: v.total, score20 };
  });
  const fail = scores.some(s => s.score20 < PASS.perSubjectMin);
  const avg = scores.reduce((a, s) => a + s.score20, 0) / (scores.length || 1);
  const score100 = scores.reduce((a, s) => a + s.correct, 0); // 100문제 → 100점
  return { scores, avg, score100, pass: !fail && avg >= PASS.averageMin };
}

function renderResult() {
  const wrap = qs('#result-content');
  if (!wrap) return;
  const r = grade();
  wrap.innerHTML = '';

  const summary = el('div', { class: 'result-score ' + (r.pass ? 'pass' : 'fail') }, [
    el('div', { class: 'big' }, (r.pass ? '합격' : '불합격')),
    el('div', { class: 'small' }, `평균 ${r.avg.toFixed(1)}점 · 총 ${r.score100}점 / 100점`)
  ]);
  wrap.appendChild(summary);

  r.scores.forEach(s => {
    const isFail = s.score20 < PASS.perSubjectMin;
    const right = el('span', { class: isFail ? 'fail' : '' },
      `${s.score20}점 (${s.correct}/${s.total})${isFail ? ' · 과락' : ''}`);
    wrap.appendChild(el('div', { class: 'subject-score-row' }, [
      el('span', null, s.subject),
      right
    ]));
  });

  // 오답 다시 풀기
  wrap.appendChild(el('button', {
    class: 'primary-btn',
    style: 'margin-top:24px',
    dataset: { action: 'review-wrong' }
  }, '오답 다시 풀기'));
  wrap.appendChild(el('button', {
    class: 'ghost-btn',
    style: 'margin-top:8px',
    dataset: { action: 'back-home' }
  }, '홈으로'));
}

// ============================================================
// 11. 모드 진입
// ============================================================
function enterMode(mode) {
  if (!state.exam) return;
  state.mode = mode;
  state.search = '';
  state.tagFilter = null;
  state.currentNo = null;

  if (mode === 'exam') {
    // 기존 답안/타이머 리셋 확인
    const answered = Object.keys(getAnswers()).length;
    if (answered > 0 && !confirm(`기존 답안(${answered}개)을 모두 지우고 모의고사를 시작할까요?`)) {
      state.mode = null;
      return;
    }
    resetExamAnswers();
    state.subjectFilter = 'all';
    startTimer();
    saveSession({ examId: state.examId, mode, startedAt: state.timer.startedAt, lastNo: null });
    renderList();
    show('list');
  } else if (mode === 'study') {
    state.subjectFilter = 'all';
    stopTimer();
    saveSession({ examId: state.examId, mode, startedAt: 0, lastNo: null });
    renderList();
    show('list');
  } else if (mode === 'subject') {
    stopTimer();
    // 과목 선택 (간단한 prompt 대체로 1번 과목부터 리스트로)
    const choices = state.subjectNames.map((n, i) => `${i + 1}. ${n}`).join('\n');
    const picked = prompt('과목 번호를 입력하세요:\n' + choices, '1');
    const idx = parseInt(picked, 10);
    if (!idx || idx < 1 || idx > state.subjectNames.length) {
      state.mode = null;
      return;
    }
    state.subjectFilter = state.subjectNames[idx - 1];
    saveSession({ examId: state.examId, mode, startedAt: 0, lastNo: null, subject: state.subjectFilter });
    renderList();
    show('list');
  } else if (mode === 'bookmarks') {
    stopTimer();
    state.subjectFilter = 'all';
    state.tagFilter = 'bookmark';
    saveSession({ examId: state.examId, mode, startedAt: 0, lastNo: null });
    renderList();
    show('list');
  }
}

function openDetail(no) {
  if (!state.filteredNos.length) {
    // list를 렌더한 적이 없으면 전체 번호로 초기화
    state.filteredNos = state.exam.questions.map(q => q.no);
  }
  renderDetail(no);
  show('detail');
}

function submitExam() {
  const answered = Object.keys(getAnswers()).length;
  const total = state.exam.questions.length;
  if (answered < total && !confirm(`진행한 문제 ${answered} / ${total}. 제출할까요?`)) return;
  stopTimer();
  renderResult();
  show('result');
}

// ============================================================
// 12. 모의고사 타이머
// ============================================================
function startTimer() {
  const now = Date.now();
  state.timer.startedAt = now;
  state.timer.limitMs = EXAM_TIME_LIMIT_MS;
  state.timer.running = true;
  if (state.timer.intervalId) clearInterval(state.timer.intervalId);
  state.timer.intervalId = setInterval(tickTimer, 1000);
  tickTimer();
}

function stopTimer() {
  if (state.timer.intervalId) clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
  state.timer.running = false;
}

function tickTimer() {
  const elapsed = Date.now() - state.timer.startedAt;
  const remain = state.timer.limitMs - elapsed;
  const timerEl = qs('#list-timer');
  if (timerEl) {
    timerEl.textContent = '⏱ ' + formatTime(Math.max(0, remain));
    if (remain <= TIMER_WARN_MS) timerEl.classList.add('warn');
    else timerEl.classList.remove('warn');
  }
  if (remain <= 0) {
    stopTimer();
    toast('시간이 종료되어 자동 제출됩니다');
    renderResult();
    show('result');
  }
}

// ============================================================
// 13. AI 바텀시트
// ============================================================
function openAiSheet() {
  state.ai.open = true;
  state.ai.messages = [];
  renderAiSheet();
  qs('#ai-overlay').classList.remove('hidden');
  qs('#ai-sheet').classList.remove('hidden');
  requestAnimationFrame(() => {
    qs('#ai-overlay').classList.add('show');
    qs('#ai-sheet').classList.add('show');
  });
  document.body.style.overflow = 'hidden';
}

function closeAiSheet() {
  state.ai.open = false;
  const sheet = qs('#ai-sheet');
  const overlay = qs('#ai-overlay');
  sheet.classList.remove('show');
  overlay.classList.remove('show');
  sheet.style.transform = '';
  setTimeout(() => {
    sheet.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 250);
  document.body.style.overflow = '';
}

function currentCard() {
  if (!state.exam || state.currentNo == null) return null;
  const q = state.exam.questions.find(x => x.no === state.currentNo);
  if (!q) return null;
  return {
    no: q.no,
    subject: subjectNameOf(q),
    q: q.q,
    c: q.c,
    a: q.a
  };
}

function renderAiSheet() {
  const card = currentCard();
  const ctx = qs('#sheet-context');
  if (card) {
    ctx.innerHTML = '';
    ctx.appendChild(el('strong', null, `문제 ${card.no} · ${card.subject}`));
    ctx.appendChild(el('div', null, preview(card.q, 160)));
  }

  const body = qs('#sheet-messages');
  body.innerHTML = '';

  if (state.ai.messages.length === 0) {
    const sugWrap = el('div', { class: 'suggestions', id: 'sheet-suggestions' });
    [
      '이 문제의 핵심 개념을 설명해줘',
      card ? `왜 정답이 ${card.a}번인지 자세히 알려줘` : '정답 이유를 알려줘',
      '이 주제에서 자주 틀리는 함정은 뭐야?'
    ].forEach(s => {
      sugWrap.appendChild(el('button', {
        class: 'suggestion-btn',
        dataset: { action: 'suggest' }
      }, s));
    });
    body.appendChild(sugWrap);
  } else {
    state.ai.messages.forEach(m => {
      const cls = 'msg ' + m.role + (m.loading ? ' loading' : '') + (m.error ? ' error' : '');
      const node = el('div', { class: cls });
      if (m.role === 'ai' && !m.loading && !m.error) {
        node.innerHTML = renderMarkdownInline(m.content);
      } else {
        node.textContent = m.content;
      }
      body.appendChild(node);
    });
    body.scrollTop = body.scrollHeight;
  }
}

async function sendAiMessage(text) {
  const card = currentCard();
  if (!card) { toast('문제 문맥이 없습니다'); return; }
  const userMsg = { role: 'user', content: text };
  const loadingMsg = { role: 'ai', content: '생각하는 중…', loading: true };
  state.ai.messages.push(userMsg, loadingMsg);
  renderAiSheet();

  const history = state.ai.messages
    .filter(m => !m.loading && !m.error)
    .slice(0, -1) // exclude just-pushed user msg? actually include; drop last user to avoid dup in server
    .map(m => ({ role: m.role === 'user' ? 'user' : 'model', content: m.content }));

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card, question: text, history })
    });
    const data = await res.json().catch(() => ({}));
    // 로딩 메시지 교체
    const li = state.ai.messages.indexOf(loadingMsg);
    if (li !== -1) state.ai.messages.splice(li, 1);
    if (!res.ok || data.error) {
      state.ai.messages.push({ role: 'ai', content: data.error || ('요청 실패 (' + res.status + ')'), error: true });
    } else {
      state.ai.messages.push({ role: 'ai', content: data.answer || '(빈 응답)' });
    }
  } catch (err) {
    const li = state.ai.messages.indexOf(loadingMsg);
    if (li !== -1) state.ai.messages.splice(li, 1);
    state.ai.messages.push({ role: 'ai', content: '네트워크 오류: ' + (err.message || err), error: true });
  }
  renderAiSheet();
}

// 드래그 닫기
function bindSheetDrag() {
  const handle = qs('#sheet-handle');
  const sheet = qs('#ai-sheet');
  if (!handle || !sheet) return;
  let startY = 0, curY = 0, dragging = false;

  const start = (y) => { startY = y; curY = y; dragging = true; sheet.style.transition = 'none'; };
  const move = (y) => {
    if (!dragging) return;
    curY = y;
    const dy = Math.max(0, curY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    const dy = Math.max(0, curY - startY);
    if (dy > 80) closeAiSheet();
    else sheet.style.transform = '';
  };

  handle.addEventListener('touchstart', e => start(e.touches[0].clientY), { passive: true });
  handle.addEventListener('touchmove',  e => move(e.touches[0].clientY),  { passive: true });
  handle.addEventListener('touchend', end);
  handle.addEventListener('mousedown', e => { start(e.clientY); e.preventDefault(); });
  document.addEventListener('mousemove', e => move(e.clientY));
  document.addEventListener('mouseup', end);
}

// ============================================================
// 14. 이벤트 바인딩
// ============================================================
function bindEvents() {
  // 홈: 모드 카드
  qsa('.mode-card').forEach(card => {
    card.addEventListener('click', () => enterMode(card.dataset.mode));
  });

  // 홈: 북마크만 보기 / 진행도 초기화
  const bmBtn = qs('#btn-bookmarks');
  if (bmBtn) bmBtn.addEventListener('click', () => enterMode('bookmarks'));
  const resetBtn = qs('#btn-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (!confirm('이 회차의 답안/북마크/태그를 모두 지울까요?')) return;
    patchLS(LS.answers, {}, all => { all[state.examId] = {}; return all; });
    patchLS(LS.bookmarks, {}, all => { all[state.examId] = []; return all; });
    patchLS(LS.tags, {}, all => { all[state.examId] = {}; return all; });
    toast('초기화 완료');
  });

  // 홈: 회차 선택
  document.addEventListener('click', async e => {
    const chip = e.target.closest('[data-action="pick-exam"]');
    if (!chip) return;
    const id = chip.dataset.examId;
    if (id === state.examId) return;
    await loadExam(id);
    renderHome();
  });

  // 리스트: 뒤로
  const listBack = qs('#list-back');
  if (listBack) listBack.addEventListener('click', () => { stopTimer(); show('home'); });

  // 리스트: 과목 탭 / 필터 칩 / 카드 / 제출
  const listView = qs('#list-view');
  if (listView) {
    listView.addEventListener('click', e => {
      const tab = e.target.closest('[data-action="subject-tab"]');
      if (tab) {
        state.subjectFilter = tab.dataset.name;
        renderList();
        return;
      }
      const chip = e.target.closest('[data-action="tag-filter"]');
      if (chip) {
        const key = chip.dataset.key;
        state.tagFilter = (state.tagFilter === key) ? null : key;
        renderList();
        return;
      }
      const card = e.target.closest('[data-action="open-detail"]');
      if (card) {
        openDetail(parseInt(card.dataset.no, 10));
        return;
      }
    });
  }

  const submitBtn = qs('#btn-submit-exam');
  if (submitBtn) submitBtn.addEventListener('click', submitExam);

  // 리스트: 검색
  const searchInput = qs('#search-input');
  if (searchInput) {
    const onSearch = debounce(() => { state.search = searchInput.value; renderList(); }, 150);
    searchInput.addEventListener('input', onSearch);
  }

  // 상세: 뒤로 / 이전 / 다음 / 북마크 / 선택지 / 태그 / AI
  const detailBack = qs('#detail-back');
  if (detailBack) detailBack.addEventListener('click', () => { show('list'); renderList(); });

  const prev = qs('#btn-prev');
  if (prev) prev.addEventListener('click', () => {
    const list = state.filteredNos;
    const i = list.indexOf(state.currentNo);
    if (i > 0) openDetail(list[i - 1]);
  });
  const next = qs('#btn-next');
  if (next) next.addEventListener('click', () => {
    const list = state.filteredNos;
    const i = list.indexOf(state.currentNo);
    if (i !== -1 && i < list.length - 1) openDetail(list[i + 1]);
  });

  const bm = qs('#btn-bookmark');
  if (bm) bm.addEventListener('click', () => {
    toggleBookmark(state.currentNo);
    renderDetail(state.currentNo);
  });

  const detailView = qs('#detail-view');
  if (detailView) {
    detailView.addEventListener('click', e => {
      const choose = e.target.closest('[data-action="choose"]');
      if (choose) {
        const idx = parseInt(choose.dataset.idx, 10);
        setAnswer(state.currentNo, idx);
        renderDetail(state.currentNo);
        return;
      }
      const tagBtn = e.target.closest('[data-action="tag"]');
      if (tagBtn) {
        const color = tagBtn.dataset.color;
        setTag(state.currentNo, color);
        renderDetail(state.currentNo);
        return;
      }
    });
  }

  const aiBtn = qs('#btn-ai-ask');
  if (aiBtn) aiBtn.addEventListener('click', openAiSheet);

  // 결과: 뒤로 / 오답 다시 풀기 / 홈
  const resultBack = qs('#result-back');
  if (resultBack) resultBack.addEventListener('click', () => show('home'));
  const resultView = qs('#result-view');
  if (resultView) {
    resultView.addEventListener('click', e => {
      const review = e.target.closest('[data-action="review-wrong"]');
      if (review) {
        const wrong = state.exam.questions.filter(q => {
          const a = getAnswer(q.no);
          return a != null && a !== q.a;
        }).map(q => q.no);
        if (!wrong.length) { toast('오답이 없습니다'); return; }
        state.mode = 'study';
        state.subjectFilter = 'all';
        state.tagFilter = null;
        state.search = '';
        state.filteredNos = wrong;
        // 오답만 보이도록 간단히: 첫 오답 상세로 이동
        openDetail(wrong[0]);
        return;
      }
      if (e.target.closest('[data-action="back-home"]')) {
        show('home');
      }
    });
  }

  // AI 바텀시트
  const overlay = qs('#ai-overlay');
  if (overlay) overlay.addEventListener('click', closeAiSheet);
  const sheetClose = qs('#sheet-close');
  if (sheetClose) sheetClose.addEventListener('click', closeAiSheet);

  const sheetBody = qs('#sheet-messages');
  if (sheetBody) {
    sheetBody.addEventListener('click', e => {
      const sug = e.target.closest('[data-action="suggest"]');
      if (sug) {
        const ta = qs('#sheet-textarea');
        ta.value = sug.textContent;
        ta.focus();
        autoResizeTextarea(ta);
      }
    });
  }

  const form = qs('#sheet-form');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const ta = qs('#sheet-textarea');
      const text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      autoResizeTextarea(ta);
      sendAiMessage(text);
    });
  }

  const ta = qs('#sheet-textarea');
  if (ta) {
    ta.addEventListener('input', () => autoResizeTextarea(ta));
    // Enter는 줄바꿈만. 전송은 버튼으로.
  }

  bindSheetDrag();
}

function autoResizeTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
}
