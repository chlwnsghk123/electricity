// 전기기사 CBT 시뮬레이터 — app.js
// 구조: Part 1 상수/상태/유틸 → Part 2 스토리지/데이터 → Part 3 렌더 →
//       Part 4 모드/타이머/선택시트 → Part 5 AI·메모 → Part 6 설정/이벤트/부트스트랩

// ============================================================
// Part 1. 상수 · localStorage 키 · 상태 · 유틸
// ============================================================

const LS = {
  // 답(answers)은 localStorage에 저장하지 않는다. 메모리(state.answers)에만 유지.
  bookmarks: 'cbt_bookmarks_v1', // { [examId]: number[] }
  tags:      'cbt_tags_v2',      // { [examId]: { [no]: color } } — 6색으로 확장되어 v2
  notes:     'cbt_notes_v1',     // { [examId]: { [no]: [{id, content, savedAt}] } }
  lastExam:  'cbt_last_exam_v1', // string (examId)
  settings:  'cbt_settings_v1'
};

// 6색 태그 + 의미. 회색은 "지우기(미착수)" 역할도 겸함.
const TAG_COLORS = ['gray', 'green', 'red', 'orange', 'yellow', 'blue'];
const TAG_MEANING = {
  gray:   '미착수 / 지우기',
  green:  '맞춤',
  red:    '틀림',
  orange: '학습 필요',
  yellow: '다시 풀기',
  blue:   '중요'
};

// 과목당 20문제 기준 환산: 과락 40점 미만(=8문제), 평균 60점 이상(=12문제)
const PASS = { perSubjectMin: 8, averageMin: 12 };

// 모의고사 시간 & 문제 수
const EXAM_FULL_MS  = 150 * 60 * 1000;
const EXAM_HALF_MS  =  75 * 60 * 1000;
const PER_SUBJECT_FULL = 20;
const PER_SUBJECT_HALF = 10;
const TIMER_WARN_MS = 10 * 60 * 1000;

const CIRCLED = ['①', '②', '③', '④', '⑤'];

// ---------- 전역 상태 ----------
const state = {
  manifest: null,
  exam: null,
  examId: null,

  view: 'home',               // home | modes | list | detail | result
  mode: null,                 // study | exam | random
  examVariant: null,          // full | half (모의고사 유형)
  randomSubject: null,        // 랜덤 학습 과목 이름

  // 검색/필터 (학습 모드 리스트)
  subjectFilter: 'all',
  tagFilter: null,            // null | 'bookmark' | 색(TAG_COLORS 중 하나)
  search: '',

  // 상세 뷰
  currentNo: null,
  filteredNos: [],            // 상세 prev/next 기반 번호 배열

  // 모의고사
  examSet: [],                // 선택된 문제 번호 순서
  examAnswers: {},            // 모의고사 전용 메모리 답안 (제출 전까지 유지)

  // 학습/랜덤에서 세션 중 답 (문제 이탈 시 소멸)
  tempAnswer: null,           // { no, idx }

  // 랜덤 학습
  randomSeen: [],             // 이미 출제한 번호 (중복 회피용)

  timer: { startedAt: 0, limitMs: EXAM_FULL_MS, intervalId: null, running: false },

  ai: { messages: [] }
};

// ---------- DOM 헬퍼 ----------
const qs  = (sel, root) => (root || document).querySelector(sel);
const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        n.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(n.style, v);
      } else n.setAttribute(k, v);
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 얇은 인라인 Markdown — **굵게**, *기울임*, `코드`, '- ' 불릿
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

// KaTeX 자동 렌더 (CDN 로드 실패해도 노옵)
function renderMath(root) {
  if (!root || typeof window.renderMathInElement !== 'function') return;
  try {
    window.renderMathInElement(root, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false,
      strict: 'ignore'
    });
  } catch (e) { /* no-op */ }
}

// 뷰 전환
function show(view) {
  state.view = view;
  const map = {
    home:    '#home',
    modes:   '#modes-view',
    list:    '#list-view',
    detail:  '#detail-view',
    result:  '#result-view'
  };
  qsa('.screen').forEach(s => s.classList.add('hidden'));
  const target = map[view] && qs(map[view]);
  if (target) target.classList.remove('hidden');
  const loading = qs('#loading');
  if (loading) loading.classList.add('hidden');
  window.scrollTo(0, 0);
}

// 배열 셔플(Fisher-Yates)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 유니크 id (메모)
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ============================================================
// Part 2. localStorage · 데이터 로드
// ============================================================

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
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

// ---- per-exam 스코프 ----
function _scope(key, fallback) {
  const all = loadLS(key, {});
  const id = state.examId;
  if (!id) return fallback;
  if (all[id] == null) all[id] = fallback;
  return all[id];
}

// 북마크
function getBookmarks() { return new Set(_scope(LS.bookmarks, [])); }
function toggleBookmark(no) {
  patchLS(LS.bookmarks, {}, all => {
    const id = state.examId;
    const set = new Set(all[id] || []);
    if (set.has(no)) set.delete(no); else set.add(no);
    all[id] = Array.from(set).sort((a, b) => a - b);
    return all;
  });
}

// 태그 (6색)
function getTags() { return _scope(LS.tags, {}); }
function getTag(no) { return getTags()[no] || null; }
function setTag(no, color) {
  patchLS(LS.tags, {}, all => {
    const id = state.examId;
    const m = { ...(all[id] || {}) };
    // gray 또는 같은 색 재선택 → 해제(미착수)
    if (!color || color === 'gray' || m[no] === color) delete m[no];
    else m[no] = color;
    all[id] = m;
    return all;
  });
}

// 메모
function getNotes(no) {
  const all = _scope(LS.notes, {});
  return Array.isArray(all[no]) ? all[no] : [];
}
function addNote(no, content) {
  const note = { id: uid(), content: String(content || '').trim(), savedAt: Date.now() };
  if (!note.content) return null;
  patchLS(LS.notes, {}, all => {
    const id = state.examId;
    const m = { ...(all[id] || {}) };
    const arr = Array.isArray(m[no]) ? m[no].slice() : [];
    arr.push(note);
    m[no] = arr;
    all[id] = m;
    return all;
  });
  return note;
}
function deleteNote(no, noteId) {
  patchLS(LS.notes, {}, all => {
    const id = state.examId;
    const m = { ...(all[id] || {}) };
    const arr = (m[no] || []).filter(n => n.id !== noteId);
    m[no] = arr;
    all[id] = m;
    return all;
  });
}

// 진행도 초기화: 현재 회차의 북마크·태그·메모 삭제 (답은 메모리에만 있음)
function resetCurrentExam() {
  patchLS(LS.bookmarks, {}, all => { all[state.examId] = []; return all; });
  patchLS(LS.tags,      {}, all => { all[state.examId] = {}; return all; });
  patchLS(LS.notes,     {}, all => { all[state.examId] = {}; return all; });
  state.examAnswers = {};
  state.tempAnswer = null;
}

// ---- 답(메모리) ----
// 모드에 따라 답을 저장할 대상이 다르다.
// exam 모드: state.examAnswers (제출까지 유지)
// study/random: state.tempAnswer (해당 문제 이탈 시 소멸)
function getCurrentAnswer(no) {
  if (state.mode === 'exam') return state.examAnswers[no] ?? null;
  return state.tempAnswer && state.tempAnswer.no === no ? state.tempAnswer.idx : null;
}
function setCurrentAnswer(no, idx) {
  if (state.mode === 'exam') state.examAnswers[no] = idx;
  else state.tempAnswer = { no, idx };
}
function clearTempAnswerIfLeaving(no) {
  if (state.mode === 'exam') return;
  if (state.tempAnswer && state.tempAnswer.no === no) state.tempAnswer = null;
}

// ---- 데이터 로드 ----
async function loadManifest() {
  const res = await fetch('data/index.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
  state.manifest = await res.json();
  return state.manifest;
}
async function loadExam(examId) {
  const entry = (state.manifest.exams || []).find(e => e.id === examId);
  if (!entry) throw new Error('unknown exam: ' + examId);
  if (!entry.available) throw new Error('준비 중인 회차입니다');
  const res = await fetch(entry.file, { cache: 'no-store' });
  if (!res.ok) throw new Error('exam fetch failed: ' + res.status);
  const exam = await res.json();
  state.exam = exam;
  state.examId = examId;
  const subs = (exam.meta && exam.meta.subjects) || [];
  state.subjectNames = subs.map(s => s.name);
  state.subjectBy = {};
  subs.forEach(s => { state.subjectBy[s.no] = s.name; });
  saveLS(LS.lastExam, examId);
  // 회차 전환 시 세션 메모리 초기화
  state.examAnswers = {};
  state.tempAnswer  = null;
  return exam;
}
function subjectNameOf(q) {
  if (typeof q.subject === 'string') return q.subject;
  return (state.subjectBy && state.subjectBy[q.subject]) || '기타';
}

// ============================================================
// Part 3. 렌더 — 홈 · 모드 선택 · 학습 리스트 · 상세 · 결과
// ============================================================

// 특정 회차에 대해 "맞춘 문제 수" = green 태그 개수
function correctCountOfExam(examId) {
  const all = loadLS(LS.tags, {});
  const m = all && all[examId] || {};
  let c = 0;
  for (const k in m) if (m[k] === 'green') c++;
  return c;
}

// ---------- 홈(회차 선택) ----------
function renderHome() {
  const list = qs('#exam-list');
  if (!list) return;
  list.innerHTML = '';
  (state.manifest.exams || []).forEach(e => {
    const main = el('div', null, [
      el('div', { class: 'title' }, e.title)
    ]);
    const rightKids = [];
    if (e.available && e.count) {
      const correct = correctCountOfExam(e.id);
      rightKids.push(el('span', { class: 'progress' }, `${correct} / ${e.count}`));
    }
    rightKids.push(e.available
      ? el('span', { class: 'chev' }, '›')
      : el('span', { class: 'badge-soon' }, '준비 중'));
    const right = el('span', { class: 'exam-item-right' }, rightKids);
    const item = el('button', {
      class: 'exam-item',
      disabled: e.available ? null : true,
      dataset: { action: 'pick-exam', examId: e.id, available: String(!!e.available) }
    }, [main, right]);
    list.appendChild(item);
  });
}

// ---------- 모드 선택 ----------
function renderModes() {
  const title = qs('#modes-title');
  if (title && state.exam) {
    title.textContent = state.exam.meta?.exam
      ? `${state.exam.meta.exam} · ${state.exam.meta.round}`
      : '모드 선택';
  }
  const meta = qs('#modes-meta');
  if (meta && state.exam) {
    const total = state.exam.meta.total_questions || state.exam.questions.length;
    const correct = correctCountOfExam(state.examId);
    meta.textContent = `진행률 ${correct} / ${total} · 맞춘 문제 수 기준`;
  }
}

// ---------- 리스트(학습 모드) ----------
function filteredQuestionsForStudy() {
  if (!state.exam) return [];
  const bookmarks = getBookmarks();
  const tags = getTags();
  const sf = state.subjectFilter;
  const tf = state.tagFilter;
  const search = state.search.trim().toLowerCase();
  return state.exam.questions.filter(q => {
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

function renderList() {
  const title = qs('#list-title');
  if (title) title.textContent = '학습 모드';

  // 과목 탭
  const tabs = qs('#subject-tabs');
  if (tabs) {
    tabs.innerHTML = '';
    const names = ['all', ...(state.subjectNames || [])];
    names.forEach(n => {
      const label = n === 'all' ? '전체' : n;
      tabs.appendChild(el('button', {
        class: 'subject-tab' + (state.subjectFilter === n ? ' active' : ''),
        dataset: { action: 'subject-tab', name: n }
      }, label));
    });
  }

  // 필터 칩 (북마크 + 6색 태그, 의미 라벨 포함)
  const chips = qs('#filter-chips');
  if (chips) {
    chips.innerHTML = '';
    const mk = (key, label, dotClass) => {
      const active = state.tagFilter === key;
      const kids = [];
      if (dotClass) kids.push(el('span', { class: 'dot ' + dotClass }));
      kids.push(document.createTextNode(label));
      return el('button', {
        class: 'filter-chip' + (active ? ' active' : ''),
        dataset: { action: 'tag-filter', key }
      }, kids);
    };
    chips.appendChild(mk('bookmark', '★ 북마크'));
    TAG_COLORS.filter(c => c !== 'gray').forEach(c => {
      chips.appendChild(mk(c, TAG_MEANING[c], c));
    });
  }

  // 검색 input 동기화
  const searchInput = qs('#search-input');
  if (searchInput && searchInput.value !== state.search) searchInput.value = state.search;

  // 카드 리스트
  const listBox = qs('#question-list');
  if (listBox) {
    listBox.innerHTML = '';
    const items = filteredQuestionsForStudy();
    state.filteredNos = items.map(q => q.no);
    if (items.length === 0) {
      listBox.appendChild(el('div', { class: 'loading' }, '조건에 맞는 문제가 없습니다.'));
    } else {
      const bookmarks = getBookmarks();
      const tags = getTags();
      items.forEach(q => listBox.appendChild(renderQuestionCard(q, bookmarks, tags)));
    }
  }
}

function renderQuestionCard(q, bookmarks, tags) {
  const kids = [];
  if (bookmarks.has(q.no)) kids.push(el('span', { class: 'bookmark-on', title: '북마크' }, '★'));
  const color = tags[q.no];
  if (color) kids.push(el('span', { class: 'tag-dot dot ' + color }));

  return el('button', {
    class: 'q-card',
    dataset: { action: 'open-detail', no: String(q.no) }
  }, [
    el('div', { class: 'q-left' }, String(q.no)),
    el('div', { class: 'q-main' }, [
      el('div', { class: 'q-preview' }, preview(q.q, 80)),
      el('div', { class: 'q-sub' }, [
        el('span', { class: 'subject-badge' }, subjectNameOf(q)),
        q.has_image ? el('span', null, '📷') : null,
        q.has_formula ? el('span', null, '∑') : null
      ])
    ]),
    el('div', { class: 'q-right' }, kids)
  ]);
}

// ---------- 상세 ----------
function renderDetail(no) {
  if (!state.exam) return;
  const q = state.exam.questions.find(x => x.no === no);
  if (!q) return;
  state.currentNo = no;

  // 타이틀
  qs('#detail-title').textContent = `문제 ${q.no}`;
  qs('#detail-subject').textContent = subjectNameOf(q);
  qs('#detail-no').textContent = `No. ${q.no}`;

  // 진행도 표시 (모의고사/랜덤 모드에서 i/N)
  const progress = qs('#detail-progress');
  if (progress) {
    if (state.mode === 'exam' && state.examSet.length) {
      const i = state.examSet.indexOf(no) + 1;
      progress.textContent = `${i} / ${state.examSet.length}`;
    } else if (state.mode === 'random') {
      progress.textContent = `${state.randomSeen.length} / ${state.exam.questions.filter(x => subjectNameOf(x) === state.randomSubject).length}`;
    } else {
      progress.textContent = '';
    }
  }

  // 타이머 (모의고사에서만)
  const timerEl = qs('#detail-timer');
  if (timerEl) {
    if (state.mode === 'exam' && state.timer.running) {
      timerEl.classList.remove('hidden');
    } else {
      timerEl.textContent = '';
      timerEl.classList.add('hidden');
      timerEl.classList.remove('warn');
    }
  }

  // 본문 (+ KaTeX 렌더)
  const qBody = qs('#detail-question');
  qBody.textContent = q.q;
  renderMath(qBody);

  // 이미지 (본문 + 선택지별)
  // 파일 규칙:
  //   images/<examId>/<no>.png      → 문제 본문 이미지
  //   images/<examId>/<no>-<k>.png  → 선택지 k(1~N)의 이미지
  // 두 종류 모두 파일 존재 여부로 자동 표시. has_image가 false여도 파일이 있으면 표시한다.
  const imgWrap = qs('#detail-image-wrap');
  const note = qs('#detail-image-note');
  imgWrap.innerHTML = '';
  {
    const bodyImg = new Image();
    bodyImg.alt = q.image_note || `문제 ${q.no} 그림`;
    bodyImg.style.display = 'none';
    bodyImg.onload = () => { bodyImg.style.display = ''; };
    bodyImg.onerror = () => { bodyImg.remove(); };
    bodyImg.src = `images/${state.examId}/${q.no}.png`;
    imgWrap.appendChild(bodyImg);
    note.textContent = (q.has_image && q.image_note) ? '📷 ' + q.image_note : '';
  }

  // 북마크 버튼
  const bm = qs('#btn-bookmark');
  const bookmarks = getBookmarks();
  if (bookmarks.has(q.no)) { bm.textContent = '★'; bm.classList.add('on'); }
  else                     { bm.textContent = '☆'; bm.classList.remove('on'); }

  // 선택지
  const choices = qs('#detail-choices');
  choices.innerHTML = '';
  const selected = getCurrentAnswer(q.no);
  (q.c || []).forEach((text, i) => {
    const idx = i + 1;
    let cls = 'choice-btn';
    if (selected === idx) cls += ' selected';
    // 학습/랜덤 모드: 답 선택 후 정·오 색 표시
    if (state.mode !== 'exam' && selected != null) {
      if (idx === q.a) cls += ' correct';
      else if (idx === selected) cls += ' wrong';
    }
    // 선택지 이미지(있으면 텍스트 아래에 표시)
    const content = el('div', { class: 'choice-content' }, [
      el('span', { class: 'choice-text' }, text)
    ]);
    const ci = new Image();
    ci.className = 'choice-img';
    ci.alt = `선택지 ${idx} 그림`;
    ci.style.display = 'none';
    ci.onload = () => { ci.style.display = ''; };
    ci.onerror = () => { ci.remove(); };
    ci.src = `images/${state.examId}/${q.no}-${idx}.png`;
    content.appendChild(ci);

    choices.appendChild(el('button', {
      class: cls,
      dataset: { action: 'choose', idx: String(idx) }
    }, [
      el('span', { class: 'num' }, CIRCLED[i] || String(idx)),
      content
    ]));
  });
  renderMath(choices);

  // 정답 공개 (학습/랜덤 + 답 선택 상태)
  const answerBox = qs('#detail-answer');
  if (state.mode !== 'exam' && selected != null) {
    const ok = selected === q.a;
    answerBox.textContent = `정답: ${CIRCLED[q.a - 1]} · 내 답: ${CIRCLED[selected - 1]} ${ok ? '(정답)' : '(오답)'}`;
    answerBox.classList.remove('hidden');
    renderMath(answerBox);
  } else {
    answerBox.classList.add('hidden');
    answerBox.textContent = '';
  }

  // 헤더 태그 트리거(현재 색 인디케이터)
  const trigger = qs('#tag-trigger-dot');
  if (trigger) {
    const curTag = getTag(q.no);
    trigger.className = 'tag-trigger-dot ' + (curTag || 'gray');
  }

  // 메모 섹션
  renderNotesList(q.no);

  // prev/next 기준 번호 목록 결정
  let navList = state.filteredNos;
  if (state.mode === 'exam') navList = state.examSet;
  if (state.mode === 'random') navList = [no]; // 랜덤은 "다음"이 새 랜덤 → prev 비활성
  if (!navList.length) navList = state.exam.questions.map(x => x.no);
  state.filteredNos = navList;

  const pos = navList.indexOf(no);
  const prevBtn = qs('#btn-prev');
  const nextBtn = qs('#btn-next');

  // 랜덤 학습: prev 비활성, next는 "다음 랜덤"
  if (state.mode === 'random') {
    prevBtn.disabled = true;
    nextBtn.disabled = false;
    nextBtn.textContent = '다음 랜덤 →';
    nextBtn.classList.remove('submit');
  } else if (state.mode === 'exam') {
    prevBtn.disabled = pos <= 0;
    const isLast = pos === navList.length - 1;
    nextBtn.disabled = false;
    nextBtn.textContent = isLast ? '시험 제출하기' : '다음 →';
    nextBtn.classList.toggle('submit', isLast);
  } else {
    prevBtn.disabled = pos <= 0;
    nextBtn.disabled = pos === -1 || pos >= navList.length - 1;
    nextBtn.textContent = '다음 →';
    nextBtn.classList.remove('submit');
  }
}

function renderNotesList(no) {
  const listBox = qs('#notes-list');
  const countEl = qs('#notes-count');
  if (!listBox) return;
  const notes = getNotes(no);
  countEl.textContent = notes.length ? `${notes.length}개` : '';
  listBox.innerHTML = '';
  if (!notes.length) {
    listBox.appendChild(el('div', { class: 'notes-empty' }, 'AI 답변이나 메모가 아직 없어요'));
    return;
  }
  notes.forEach(n => {
    const body = el('div', { class: 'note-body', html: renderMarkdownInline(n.content) });
    const meta = el('div', { class: 'note-meta' },
      new Date(n.savedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
    );
    const item = el('div', { class: 'note-item', dataset: { noteId: n.id } }, [meta, body]);
    attachNoteDeleteHandlers(item, no, n.id);
    listBox.appendChild(item);
    renderMath(body);
  });
}

// ---------- 메모 삭제 (long-press · 우클릭) ----------
const LONG_PRESS_MS = 600;
function attachNoteDeleteHandlers(item, no, id) {
  let timer = null;
  const start = () => {
    item.classList.add('pressing');
    timer = setTimeout(() => {
      item.classList.remove('pressing');
      confirmDeleteNote(no, id);
      timer = null;
    }, LONG_PRESS_MS);
  };
  const cancel = () => {
    item.classList.remove('pressing');
    if (timer) { clearTimeout(timer); timer = null; }
  };
  item.addEventListener('touchstart', start, { passive: true });
  item.addEventListener('touchend', cancel);
  item.addEventListener('touchmove', cancel);
  item.addEventListener('touchcancel', cancel);
  item.addEventListener('mousedown', e => { if (e.button === 0) start(); });
  item.addEventListener('mouseup', cancel);
  item.addEventListener('mouseleave', cancel);
  item.addEventListener('contextmenu', e => {
    e.preventDefault();
    cancel();
    confirmDeleteNote(no, id);
  });
}
function confirmDeleteNote(no, id) {
  if (!confirm('이 메모를 삭제할까요?')) return;
  deleteNote(no, id);
  renderNotesList(no);
  toast('메모를 삭제했어요');
}

// ---------- 태그 팝오버 (헤더 드롭다운) ----------
function openTagPopover() {
  const pop = qs('#tag-popover');
  const btn = qs('#btn-tag');
  if (!pop || !btn) return;
  const no = state.currentNo;
  if (no == null) return;
  const curTag = getTag(no);
  pop.innerHTML = '';
  TAG_COLORS.forEach(c => {
    pop.appendChild(el('button', {
      class: 'tag-btn ' + c + (curTag === c ? ' active' : ''),
      dataset: { action: 'tag', color: c }
    }, [
      el('span', { class: 'circle' }),
      el('span', { class: 'meaning' }, TAG_MEANING[c])
    ]));
  });
  // 위치(버튼 아래 정렬)
  const r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom + 8) + 'px';
  pop.style.right = (window.innerWidth - r.right) + 'px';
  pop.style.left = '';
  pop.classList.remove('hidden');
  // 외부 클릭 닫기
  setTimeout(() => document.addEventListener('click', closeTagPopoverOnOutside, { once: true, capture: true }), 0);
}
function closeTagPopover() {
  const pop = qs('#tag-popover');
  if (pop) pop.classList.add('hidden');
}
function closeTagPopoverOnOutside(e) {
  const pop = qs('#tag-popover');
  const btn = qs('#btn-tag');
  if (!pop) return;
  if (pop.contains(e.target) || (btn && btn.contains(e.target))) {
    // 팝오버 내부 클릭은 별도 처리 후 유지될 수 있도록 그대로 패스
    document.addEventListener('click', closeTagPopoverOnOutside, { once: true, capture: true });
    return;
  }
  closeTagPopover();
}

// ---------- 메모 추가 폼 ----------
function openNoteForm() {
  qs('#note-form').classList.remove('hidden');
  const ta = qs('#note-input');
  ta.value = '';
  setTimeout(() => ta.focus(), 0);
}
function closeNoteForm() {
  qs('#note-form').classList.add('hidden');
}
function submitNoteForm() {
  const ta = qs('#note-input');
  const text = (ta.value || '').trim();
  if (!text) { toast('내용을 입력해주세요'); return; }
  if (state.currentNo == null) return;
  addNote(state.currentNo, text);
  ta.value = '';
  closeNoteForm();
  renderNotesList(state.currentNo);
  toast('메모를 저장했어요');
}

// ---------- 결과 (채점) ----------
function grade() {
  const byS = {};
  const pool = state.mode === 'exam'
    ? state.examSet.map(no => state.exam.questions.find(q => q.no === no)).filter(Boolean)
    : state.exam.questions;
  const getA = no => state.examAnswers[no];
  pool.forEach(q => {
    const s = subjectNameOf(q);
    byS[s] ??= { correct: 0, total: 0 };
    byS[s].total++;
    if (getA(q.no) === q.a) byS[s].correct++;
  });
  const names = (state.subjectNames || []).filter(n => byS[n]);
  const scores = names.map(n => {
    const v = byS[n];
    const score20 = v.total > 0 ? Math.round(v.correct / v.total * 20) : 0;
    return { subject: n, correct: v.correct, total: v.total, score20 };
  });
  const fail = scores.some(s => s.score20 < PASS.perSubjectMin);
  const avg = scores.length ? scores.reduce((a, s) => a + s.score20, 0) / scores.length : 0;
  const score100 = scores.reduce((a, s) => a + s.correct, 0) * (100 / Math.max(1, scores.reduce((a, s) => a + s.total, 0)));
  return { scores, avg, score100: Math.round(score100), pass: !fail && avg >= PASS.averageMin };
}

function renderResult() {
  const wrap = qs('#result-content');
  if (!wrap) return;
  const r = grade();
  wrap.innerHTML = '';
  const summary = el('div', { class: 'result-score ' + (r.pass ? 'pass' : 'fail') }, [
    el('div', { class: 'big' }, r.pass ? '합격' : '불합격'),
    el('div', { class: 'small' }, `평균 ${r.avg.toFixed(1)}점 · 환산 ${r.score100}점`)
  ]);
  wrap.appendChild(summary);

  r.scores.forEach(s => {
    const isFail = s.score20 < PASS.perSubjectMin;
    wrap.appendChild(el('div', { class: 'subject-score-row' }, [
      el('span', null, s.subject),
      el('span', { class: isFail ? 'fail' : '' },
        `${s.score20}점 (${s.correct}/${s.total})${isFail ? ' · 과락' : ''}`)
    ]));
  });

  wrap.appendChild(el('button', {
    class: 'ghost-btn', style: 'margin-top:24px;width:100%',
    dataset: { action: 'back-home' }
  }, '홈으로'));
}

// ============================================================
// Part 4. 모드 진입 · 타이머 · 선택 바텀시트 · 자동 태그
// ============================================================

// 답 선택 시 학습/랜덤 모드에서 자동 태그(green/red)
function applyAutoTagIfNeeded(no, correct) {
  if (state.mode === 'exam') return;
  setTag(no, correct ? 'green' : 'red');
}

function onChooseAnswer(idx) {
  const no = state.currentNo;
  if (no == null) return;
  const q = state.exam.questions.find(x => x.no === no);
  if (!q) return;
  setCurrentAnswer(no, idx);
  // 학습/랜덤: 답 선택 즉시 자동 태그
  if (state.mode !== 'exam') applyAutoTagIfNeeded(no, idx === q.a);
  renderDetail(no);
}

// 모드 진입
function enterMode(mode) {
  if (!state.exam) return;
  state.mode = mode;
  state.search = '';
  state.tagFilter = null;
  state.currentNo = null;
  state.tempAnswer = null;
  stopTimer();

  if (mode === 'study') {
    state.subjectFilter = 'all';
    renderList();
    show('list');
  } else if (mode === 'random') {
    openRandomSubjectSheet();
  } else if (mode === 'exam') {
    openExamVariantSheet();
  }
}

// ---- 모의고사 유형 선택 (정식 / 하프) ----
function openExamVariantSheet() {
  openChoiceSheet('모의고사 유형 선택', [
    {
      title: '정식 모의고사',
      desc: `과목당 ${PER_SUBJECT_FULL}문제 · 총 ${state.subjectNames.length * PER_SUBJECT_FULL}문제 · 150분`,
      onClick: () => { closeChoiceSheet(); startExam('full'); }
    },
    {
      title: '하프 모의고사',
      desc: `과목당 ${PER_SUBJECT_HALF}문제 · 총 ${state.subjectNames.length * PER_SUBJECT_HALF}문제 · 75분`,
      onClick: () => { closeChoiceSheet(); startExam('half'); }
    }
  ]);
}

function startExam(variant) {
  state.examVariant = variant;
  state.mode = 'exam';
  state.examAnswers = {};
  state.tempAnswer = null;

  const perSub = variant === 'full' ? PER_SUBJECT_FULL : PER_SUBJECT_HALF;
  const limitMs = variant === 'full' ? EXAM_FULL_MS : EXAM_HALF_MS;

  // 과목별로 그룹 → 각 과목 내에서 셔플 → 상위 perSub개
  const bySubject = {};
  state.exam.questions.forEach(q => {
    const s = subjectNameOf(q);
    (bySubject[s] ||= []).push(q.no);
  });
  const picked = [];
  state.subjectNames.forEach(name => {
    const pool = bySubject[name] || [];
    const arr = shuffle(pool).slice(0, perSub);
    picked.push(...arr);
  });
  state.examSet = picked;
  if (!picked.length) { toast('문제가 없습니다'); return; }

  startTimer(limitMs);
  state.currentNo = picked[0];
  renderDetail(picked[0]);
  show('detail');
}

function submitExam() {
  const total = state.examSet.length;
  const answered = state.examSet.filter(no => state.examAnswers[no] != null).length;
  if (answered < total && !confirm(`진행한 문제 ${answered} / ${total}. 제출할까요?`)) return;
  stopTimer();
  // 제출 시점에 정답/오답 자동 태그 일괄 적용
  state.examSet.forEach(no => {
    const q = state.exam.questions.find(x => x.no === no);
    if (!q) return;
    const sel = state.examAnswers[no];
    if (sel == null) return; // 미응답은 태그 생략
    setTag(no, sel === q.a ? 'green' : 'red');
  });
  renderResult();
  show('result');
}

// ---- 랜덤 학습: 과목 선택 → 첫 문제 ----
function openRandomSubjectSheet() {
  const items = state.subjectNames.map(name => ({
    title: name,
    desc: `${state.exam.questions.filter(q => subjectNameOf(q) === name).length}문제에서 랜덤`,
    onClick: () => { closeChoiceSheet(); startRandom(name); }
  }));
  openChoiceSheet('과목 선택', items);
}

function startRandom(subjectName) {
  state.mode = 'random';
  state.randomSubject = subjectName;
  state.randomSeen = [];
  state.tempAnswer = null;
  const next = pickRandomFromSubject();
  if (next == null) { toast('문제가 없습니다'); return; }
  renderDetail(next);
  show('detail');
}

function pickRandomFromSubject() {
  if (!state.exam || !state.randomSubject) return null;
  const pool = state.exam.questions
    .filter(q => subjectNameOf(q) === state.randomSubject)
    .map(q => q.no);
  if (!pool.length) return null;
  const unseen = pool.filter(n => !state.randomSeen.includes(n));
  if (unseen.length === 0) {
    // 한 바퀴 다 돌았으면 초기화
    state.randomSeen = [];
    toast('한 바퀴 완료 — 다시 처음부터');
  }
  const candidate = (unseen.length ? unseen : pool);
  const pick = candidate[Math.floor(Math.random() * candidate.length)];
  state.randomSeen.push(pick);
  return pick;
}

function nextRandom() {
  state.tempAnswer = null; // 이전 문제 답 소멸
  const n = pickRandomFromSubject();
  if (n == null) return;
  renderDetail(n);
}

// ---- 학습 모드 상세 진입/이탈 ----
function openDetail(no) {
  if (!state.filteredNos.length) {
    state.filteredNos = state.exam.questions.map(q => q.no);
  }
  state.tempAnswer = null; // 새 문제 들어올 때 이전 답 소멸
  renderDetail(no);
  show('detail');
}

function leaveDetailBack() {
  // 학습/랜덤: 답 흔적 소멸
  clearTempAnswerIfLeaving(state.currentNo);
  if (state.mode === 'random' || state.mode === 'exam') {
    // 모의고사/랜덤에서 "뒤로"는 시험 중단 경고
    if (state.mode === 'exam') {
      if (!confirm('시험을 중단할까요? 답안이 사라집니다.')) return;
      stopTimer();
      state.examAnswers = {};
      state.examSet = [];
    }
    show('modes');
    return;
  }
  show('list');
  renderList();
}

// ---- 타이머 ----
function startTimer(limitMs) {
  const now = Date.now();
  state.timer.startedAt = now;
  state.timer.limitMs = limitMs;
  state.timer.running = true;
  if (state.timer.intervalId) clearInterval(state.timer.intervalId);
  state.timer.intervalId = setInterval(tickTimer, 1000);
  tickTimer();
}
function stopTimer() {
  if (state.timer.intervalId) clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
  state.timer.running = false;
  const t = qs('#detail-timer');
  if (t) { t.textContent = ''; t.classList.add('hidden'); t.classList.remove('warn'); }
}
function tickTimer() {
  const elapsed = Date.now() - state.timer.startedAt;
  const remain = state.timer.limitMs - elapsed;
  const t = qs('#detail-timer');
  if (t) {
    t.classList.remove('hidden');
    t.textContent = '⏱ ' + formatTime(Math.max(0, remain));
    t.classList.toggle('warn', remain <= TIMER_WARN_MS);
  }
  if (remain <= 0) {
    stopTimer();
    toast('시간이 종료되어 자동 제출됩니다');
    // 자동 제출
    state.examSet.forEach(no => {
      const q = state.exam.questions.find(x => x.no === no);
      if (!q) return;
      const sel = state.examAnswers[no];
      if (sel == null) return;
      setTag(no, sel === q.a ? 'green' : 'red');
    });
    renderResult();
    show('result');
  }
}

// ---- 선택 바텀시트 ----
function openChoiceSheet(title, items) {
  qs('#choice-title').textContent = title;
  const list = qs('#choice-list');
  list.innerHTML = '';
  items.forEach(it => {
    const btn = el('button', { class: 'settings-item' }, [
      el('div', { class: 'settings-item-title' }, it.title),
      it.desc ? el('div', { class: 'settings-item-desc' }, it.desc) : null
    ]);
    btn.addEventListener('click', () => it.onClick && it.onClick());
    list.appendChild(btn);
  });
  qs('#choice-overlay').classList.remove('hidden');
  qs('#choice-sheet').classList.remove('hidden');
  requestAnimationFrame(() => {
    qs('#choice-overlay').classList.add('show');
    qs('#choice-sheet').classList.add('show');
  });
}
function closeChoiceSheet() {
  const sheet = qs('#choice-sheet');
  const overlay = qs('#choice-overlay');
  sheet.classList.remove('show');
  overlay.classList.remove('show');
  setTimeout(() => {
    sheet.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 250);
}

// ============================================================
// Part 5. AI 바텀시트 (이미지 첨부) · 메모 저장
// ============================================================

function currentCard() {
  if (!state.exam || state.currentNo == null) return null;
  const q = state.exam.questions.find(x => x.no === state.currentNo);
  if (!q) return null;
  return {
    no: q.no,
    subject: subjectNameOf(q),
    q: q.q,
    c: q.c,
    a: q.a,
    has_image: !!q.has_image
  };
}

function openAiSheet() {
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

function renderAiSheet() {
  const card = currentCard();
  const ctx = qs('#sheet-context');
  ctx.innerHTML = '';
  if (card) {
    ctx.appendChild(el('strong', null, `문제 ${card.no} · ${card.subject}${card.has_image ? ' · 🖼 이미지 포함' : ''}`));
    ctx.appendChild(el('div', null, preview(card.q, 160)));
  }

  const body = qs('#sheet-messages');
  body.innerHTML = '';

  if (state.ai.messages.length === 0) {
    const sugWrap = el('div', { class: 'suggestions' });
    const suggestions = [
      '이 문제의 핵심 개념을 설명해줘',
      card ? `왜 정답이 ${card.a}번인지 간단히 알려줘` : '정답 이유를 간단히 알려줘',
      '이 주제에서 자주 틀리는 함정은 뭐야?'
    ];
    suggestions.forEach(s => {
      sugWrap.appendChild(el('button', {
        class: 'suggestion-btn',
        dataset: { action: 'suggest' }
      }, s));
    });
    body.appendChild(sugWrap);
    return;
  }

  state.ai.messages.forEach((m, idx) => {
    const cls = 'msg ' + m.role + (m.loading ? ' loading' : '') + (m.error ? ' error' : '');
    const msgEl = el('div', { class: cls });
    if (m.role === 'ai' && !m.loading && !m.error) {
      msgEl.innerHTML = renderMarkdownInline(m.content);
      // 저장 버튼
      const actions = el('div', { class: 'msg-actions' }, [
        el('button', {
          class: 'msg-save-btn',
          dataset: { action: 'save-note', idx: String(idx) }
        }, m.saved ? '✓ 저장됨' : '📝 메모에 저장')
      ]);
      msgEl.appendChild(actions);
      body.appendChild(msgEl);
      renderMath(msgEl);
    } else {
      msgEl.textContent = m.content;
      body.appendChild(msgEl);
    }
  });
  body.scrollTop = body.scrollHeight;
}

// 이미지 한 장을 base64로 읽어온다. 404/에러면 null.
async function fetchOneImage(examId, name) {
  try {
    const res = await fetch(`images/${examId}/${name}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(resolve => {
      const fr = new FileReader();
      fr.onload = () => {
        const m = /^data:([^;]+);base64,(.*)$/.exec(fr.result || '');
        if (!m) return resolve(null);
        resolve({ mime: m[1], dataBase64: m[2] });
      };
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

// 한 문제에 속한 이미지 모두 수집: 본문 <no>.png + 선택지 <no>-1.png ~ <no>-N.png
async function fetchQuestionImages(examId, no, choiceCount) {
  const out = [];
  const body = await fetchOneImage(examId, `${no}.png`);
  if (body) out.push(body);
  const n = Math.max(4, choiceCount || 0);
  for (let i = 1; i <= n; i++) {
    const ci = await fetchOneImage(examId, `${no}-${i}.png`);
    if (ci) out.push(ci);
  }
  return out;
}

async function sendAiMessage(text) {
  const card = currentCard();
  if (!card) { toast('문제 문맥이 없습니다'); return; }

  const userMsg = { role: 'user', content: text };
  const loadingMsg = { role: 'ai', content: '생각하는 중…', loading: true };
  state.ai.messages.push(userMsg, loadingMsg);
  renderAiSheet();

  // 히스토리 (Gemini 포맷): loading/error 제외, 마지막으로 푸시된 user 메시지 제외
  const history = state.ai.messages
    .slice(0, -2)
    .filter(m => !m.loading && !m.error)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'model', content: m.content }));

  // 이미지 첨부: 본문(<no>.png) + 선택지(<no>-k.png). has_image 플래그와 무관하게
  // 파일 존재 기반으로 수집(없으면 무시). 실제 문제와 시각 자료를 최대한 함께 전달.
  const images = await fetchQuestionImages(state.examId, card.no, (card.c || []).length);

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card, question: text, history, images })
    });
    const data = await res.json().catch(() => ({}));
    const i = state.ai.messages.indexOf(loadingMsg);
    if (i !== -1) state.ai.messages.splice(i, 1);
    if (!res.ok || data.error) {
      state.ai.messages.push({ role: 'ai', content: data.error || ('요청 실패 (' + res.status + ')'), error: true });
    } else {
      state.ai.messages.push({ role: 'ai', content: data.answer || '(빈 응답)' });
    }
  } catch (err) {
    const i = state.ai.messages.indexOf(loadingMsg);
    if (i !== -1) state.ai.messages.splice(i, 1);
    state.ai.messages.push({ role: 'ai', content: '네트워크 오류: ' + (err.message || err), error: true });
  }
  renderAiSheet();
}

// AI 답변을 현재 문제의 메모에 저장
function saveAiMessageAsNote(msgIndex) {
  const m = state.ai.messages[msgIndex];
  if (!m || m.role !== 'ai' || m.loading || m.error) return;
  if (state.currentNo == null) return;
  const saved = addNote(state.currentNo, m.content);
  if (saved) {
    m.saved = true;
    renderAiSheet();
    renderNotesList(state.currentNo);
    toast('메모에 저장했어요');
  }
}

// 바텀시트 드래그-다운 닫기
function bindSheetDrag() {
  const handle = qs('#sheet-handle');
  const sheet = qs('#ai-sheet');
  if (!handle || !sheet) return;
  let startY = 0, curY = 0, dragging = false;
  const start = y => { startY = y; curY = y; dragging = true; sheet.style.transition = 'none'; };
  const move = y => {
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

function autoResizeTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
}

// ============================================================
// Part 6. 설정 시트 · 이벤트 바인딩 · 부트스트랩
// ============================================================

function openSettingsSheet() {
  qs('#settings-overlay').classList.remove('hidden');
  qs('#settings-sheet').classList.remove('hidden');
  requestAnimationFrame(() => {
    qs('#settings-overlay').classList.add('show');
    qs('#settings-sheet').classList.add('show');
  });
}
function closeSettingsSheet() {
  const sheet = qs('#settings-sheet');
  const overlay = qs('#settings-overlay');
  sheet.classList.remove('show');
  overlay.classList.remove('show');
  setTimeout(() => {
    sheet.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 250);
}

function bindEvents() {
  // 설정 아이콘
  qsa('#btn-settings, #btn-settings-2').forEach(b => b.addEventListener('click', openSettingsSheet));
  qs('#settings-close').addEventListener('click', closeSettingsSheet);
  qs('#settings-overlay').addEventListener('click', closeSettingsSheet);
  qs('#btn-reset').addEventListener('click', () => {
    if (!confirm('정말로 초기화 하겠습니까? 이 회차의 북마크·태그·메모가 모두 삭제됩니다.')) return;
    resetCurrentExam();
    toast('초기화 완료');
    closeSettingsSheet();
    if (state.view === 'detail') renderDetail(state.currentNo);
    if (state.view === 'list') renderList();
  });

  // 홈: 회차 선택
  qs('#home').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action="pick-exam"]');
    if (!btn) return;
    if (btn.dataset.available !== 'true') { toast('아직 준비 중입니다'); return; }
    const id = btn.dataset.examId;
    try {
      await loadExam(id);
      renderModes();
      show('modes');
    } catch (err) {
      toast('불러오기 실패: ' + (err.message || err));
    }
  });

  // 모드 뷰
  qs('#modes-back').addEventListener('click', () => { renderHome(); show('home'); });
  qs('#modes-view').addEventListener('click', e => {
    const card = e.target.closest('.mode-card');
    if (!card) return;
    enterMode(card.dataset.mode);
  });

  // 리스트 뷰
  qs('#list-back').addEventListener('click', () => { renderModes(); show('modes'); });
  qs('#list-view').addEventListener('click', e => {
    const tab = e.target.closest('[data-action="subject-tab"]');
    if (tab) { state.subjectFilter = tab.dataset.name; renderList(); return; }
    const chip = e.target.closest('[data-action="tag-filter"]');
    if (chip) {
      const key = chip.dataset.key;
      state.tagFilter = (state.tagFilter === key) ? null : key;
      renderList();
      return;
    }
    const card = e.target.closest('[data-action="open-detail"]');
    if (card) { openDetail(parseInt(card.dataset.no, 10)); return; }
  });
  const searchInput = qs('#search-input');
  if (searchInput) {
    const onSearch = debounce(() => { state.search = searchInput.value; renderList(); }, 150);
    searchInput.addEventListener('input', onSearch);
  }

  // 상세 뷰
  qs('#detail-back').addEventListener('click', leaveDetailBack);
  qs('#btn-prev').addEventListener('click', () => {
    if (state.mode === 'random') return;
    const list = state.filteredNos;
    const i = list.indexOf(state.currentNo);
    if (i > 0) {
      state.tempAnswer = null;
      renderDetail(list[i - 1]);
    }
  });
  qs('#btn-next').addEventListener('click', () => {
    if (state.mode === 'random') { nextRandom(); return; }
    if (state.mode === 'exam') {
      const list = state.examSet;
      const i = list.indexOf(state.currentNo);
      const isLast = i === list.length - 1;
      if (isLast) { submitExam(); return; }
      renderDetail(list[i + 1]);
      return;
    }
    const list = state.filteredNos;
    const i = list.indexOf(state.currentNo);
    if (i !== -1 && i < list.length - 1) {
      state.tempAnswer = null;
      renderDetail(list[i + 1]);
    }
  });
  qs('#btn-bookmark').addEventListener('click', () => {
    toggleBookmark(state.currentNo);
    renderDetail(state.currentNo);
  });

  // 헤더 태그 트리거
  qs('#btn-tag').addEventListener('click', e => {
    e.stopPropagation();
    const pop = qs('#tag-popover');
    if (pop && !pop.classList.contains('hidden')) closeTagPopover();
    else openTagPopover();
  });
  // 팝오버 내 태그 선택
  qs('#tag-popover').addEventListener('click', e => {
    const tg = e.target.closest('[data-action="tag"]');
    if (!tg) return;
    setTag(state.currentNo, tg.dataset.color);
    closeTagPopover();
    renderDetail(state.currentNo);
  });

  qs('#detail-view').addEventListener('click', e => {
    const ch = e.target.closest('[data-action="choose"]');
    if (ch) { onChooseAnswer(parseInt(ch.dataset.idx, 10)); return; }
  });
  qs('#btn-ai-ask').addEventListener('click', openAiSheet);

  // 메모 + 버튼 / 폼
  qs('#btn-note-add').addEventListener('click', openNoteForm);
  qs('#note-cancel').addEventListener('click', closeNoteForm);
  qs('#note-form').addEventListener('submit', e => { e.preventDefault(); submitNoteForm(); });
  qs('#note-input').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submitNoteForm();
    }
  });

  // 결과 뷰
  qs('#result-back').addEventListener('click', () => { renderModes(); show('modes'); });
  qs('#result-view').addEventListener('click', e => {
    if (e.target.closest('[data-action="back-home"]')) { renderHome(); show('home'); }
  });

  // AI 바텀시트
  qs('#ai-overlay').addEventListener('click', closeAiSheet);
  qs('#sheet-close').addEventListener('click', closeAiSheet);
  qs('#sheet-messages').addEventListener('click', e => {
    const sug = e.target.closest('[data-action="suggest"]');
    if (sug) {
      const ta = qs('#sheet-textarea');
      ta.value = sug.textContent;
      ta.focus();
      autoResizeTextarea(ta);
      return;
    }
    const save = e.target.closest('[data-action="save-note"]');
    if (save) {
      saveAiMessageAsNote(parseInt(save.dataset.idx, 10));
      return;
    }
  });
  qs('#sheet-form').addEventListener('submit', e => {
    e.preventDefault();
    const ta = qs('#sheet-textarea');
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    autoResizeTextarea(ta);
    sendAiMessage(text);
  });
  const ta = qs('#sheet-textarea');
  if (ta) ta.addEventListener('input', () => autoResizeTextarea(ta));
  bindSheetDrag();

  // 선택 시트
  qs('#choice-overlay').addEventListener('click', closeChoiceSheet);
  qs('#choice-close').addEventListener('click', closeChoiceSheet);
}

// ---------- 부트스트랩 ----------
async function bootstrap() {
  try {
    await loadManifest();
    bindEvents();
    renderHome();
    show('home');
  } catch (err) {
    console.error(err);
    const loading = qs('#loading');
    if (loading) loading.textContent = '데이터를 불러오지 못했습니다. 새로고침 해 주세요.';
    toast('초기화 실패: ' + (err.message || err));
  }
}
document.addEventListener('DOMContentLoaded', bootstrap);
