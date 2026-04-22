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
  ai:        'cbt_ai_v1',        // { [examId]: { [no]: [{role, content, saved?}] } } — 문제별 AI 대화 보존
  lastExam:  'cbt_last_exam_v1', // string (examId)
  settings:  'cbt_settings_v1'   // { theme?: 'light'|'dark' }
};

// 6색 태그 + 의미. 회색은 "지우기(미완료)" 역할도 겸함.
// green/red는 학습·랜덤 모드 답 선택 / 모의고사 제출 시 자동으로 부여됨.
const TAG_COLORS = ['gray', 'green', 'red', 'orange', 'yellow', 'blue'];
const TAG_MEANING = {
  gray:   '미완료',
  green:  '맞춤',
  red:    '틀림',
  orange: '복습 필요',
  yellow: '개념 복습 필요',
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

// 뷰 전환. 기본은 history에 푸시하여 Android/브라우저 뒤로가기가 이전 뷰로 복귀하게 한다.
// popstate로 돌아온 호출은 pushState를 건너뛰기 위해 options.fromPop=true.
function show(view, options) {
  const prev = state.view;
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
  const fromPop = options && options.fromPop;
  if (!fromPop && prev !== view) {
    try { history.pushState({ view, no: state.currentNo || null }, ''); } catch {}
  }
}

// popstate → 각 뷰에 맞게 렌더 복구. back 버튼 클릭도 history.back()을 통해 이 경로로 온다.
function handlePopState(e) {
  // 오버레이/시트가 열려 있으면 뷰 전환 대신 시트를 먼저 닫는다
  const aiSheet = qs('#ai-sheet');
  const choiceSheet = qs('#choice-sheet');
  const settingsSheet = qs('#settings-sheet');
  const aiOpen = aiSheet && !aiSheet.classList.contains('hidden');
  const choiceOpen = choiceSheet && !choiceSheet.classList.contains('hidden');
  const settingsOpen = settingsSheet && !settingsSheet.classList.contains('hidden');
  if (aiOpen || choiceOpen || settingsOpen) {
    if (aiOpen) closeAiSheet();
    if (choiceOpen) closeChoiceSheet();
    if (settingsOpen) closeSettingsSheet();
    try { history.forward(); } catch {}
    return;
  }

  const s = e && e.state;
  const target = (s && s.view) || 'home';
  if (target === state.view) return;

  // 모의고사 중 detail → 다른 화면으로 나가려 할 때 확인
  if (state.view === 'detail' && state.mode === 'exam' && target !== 'detail') {
    if (!confirm('시험을 중단할까요? 답안이 사라집니다.')) {
      // 취소 → 다시 detail 유지하도록 history를 앞으로 밀어 복구
      try { history.pushState({ view: 'detail', no: state.currentNo }, ''); } catch {}
      return;
    }
    stopTimer();
    state.examAnswers = {};
    state.examSet = [];
  }

  switch (target) {
    case 'home':   renderHome(); show('home', { fromPop: true }); break;
    case 'modes':  renderModes(); show('modes', { fromPop: true }); break;
    case 'list':   renderList(); show('list', { fromPop: true }); break;
    case 'detail':
      if (state.currentNo != null) renderDetail(state.currentNo);
      show('detail', { fromPop: true });
      break;
    case 'result': show('result', { fromPop: true }); break;
    default:       renderHome(); show('home', { fromPop: true });
  }
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

// 진행도 초기화: 현재 회차의 북마크·태그·메모·AI 대화 삭제 (답은 메모리에만 있음)
function resetCurrentExam() {
  patchLS(LS.bookmarks, {}, all => { all[state.examId] = []; return all; });
  patchLS(LS.tags,      {}, all => { all[state.examId] = {}; return all; });
  patchLS(LS.notes,     {}, all => { all[state.examId] = {}; return all; });
  patchLS(LS.ai,        {}, all => { all[state.examId] = {}; return all; });
  state.examAnswers = {};
  state.tempAnswer = null;
  state.ai.messages = [];
}

// ---- AI 대화 per-문제 영속화 ----
// 시트를 닫아도 대화가 남고, 다시 열면 복구된다.
function getAiMessages(no) {
  const all = _scope(LS.ai, {});
  return Array.isArray(all[no]) ? all[no] : [];
}
function saveAiMessages(no, messages) {
  patchLS(LS.ai, {}, all => {
    const id = state.examId;
    const m = { ...(all[id] || {}) };
    const clean = (messages || [])
      .filter(x => x && !x.loading && !x.error)
      .map(x => ({ role: x.role, content: x.content, saved: !!x.saved }));
    if (clean.length === 0) delete m[no];
    else m[no] = clean;
    all[id] = m;
    return all;
  });
}

// ---- 설정(테마) ----
function getSettings() { return loadLS(LS.settings, {}) || {}; }
function setSetting(key, value) {
  patchLS(LS.settings, {}, cur => { cur[key] = value; return cur; });
}
function applyTheme(theme) {
  const t = (theme === 'dark') ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#17191c' : '#ffffff');
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
  if (color) {
    kids.push(el('span', {
      class: 'q-tag-label ' + color,
      title: TAG_MEANING[color]
    }, TAG_MEANING[color]));
  }

  return el('button', {
    class: 'q-card',
    dataset: { action: 'open-detail', no: String(q.no) }
  }, [
    el('div', { class: 'q-left' }, String(q.no)),
    el('div', { class: 'q-main' }, [
      el('div', { class: 'q-preview' }, preview(q.q, 80)),
      el('div', { class: 'q-sub' }, [
        el('span', { class: 'subject-badge' }, subjectNameOf(q))
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

  // 상세 메타줄 인라인 태그 버튼 갱신
  const trigger = qs('#tag-trigger-dot');
  const labelEl = qs('#tag-trigger-label');
  const btnTag  = qs('#btn-tag');
  const curTag = getTag(q.no);
  if (trigger) trigger.className = 'tag-inline-dot ' + (curTag || 'gray');
  if (labelEl) labelEl.textContent = curTag ? TAG_MEANING[curTag] : '미완료';
  if (btnTag) {
    btnTag.classList.toggle('has-tag', !!curTag);
    ['green','red','orange','yellow','blue','gray'].forEach(c => btnTag.classList.remove(c));
    if (curTag) btnTag.classList.add(curTag);
  }

  // 메모 섹션
  renderNotesList(q.no);

  // prev/next 기준 번호 목록 결정
  let navList = state.filteredNos;
  if (state.mode === 'exam') navList = state.examSet;
  if (state.mode === 'random') navList = state.randomSeen; // 이력 기반 prev/next
  if (!navList.length) navList = state.exam.questions.map(x => x.no);
  state.filteredNos = navList;

  const pos = navList.indexOf(no);
  const prevBtn = qs('#btn-prev');
  const nextBtn = qs('#btn-next');

  // 랜덤 학습: prev는 이력상 이전 문제로, next는 이력 끝이면 새 랜덤 픽
  if (state.mode === 'random') {
    prevBtn.disabled = pos <= 0;
    nextBtn.disabled = false;
    const atEnd = pos === navList.length - 1;
    nextBtn.textContent = atEnd ? '다음 랜덤 →' : '다음 →';
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

  // 모의고사 진행도 바 (답한 문제/미답)
  renderExamProgressBar();
}

// 모의고사 진행바: 상세 상단 sticky. 모의고사 모드에서만 표시.
function renderExamProgressBar() {
  const scroll = qs('.detail-scroll');
  if (!scroll) return;
  let bar = qs('#exam-progress-bar');
  if (state.mode !== 'exam' || !state.examSet.length) {
    if (bar) bar.remove();
    return;
  }
  const total = state.examSet.length;
  const answered = state.examSet.filter(n => state.examAnswers[n] != null).length;
  const remain = total - answered;
  if (!bar) {
    bar = el('div', { id: 'exam-progress-bar', class: 'exam-progress-bar' });
    scroll.prepend(bar);
  }
  bar.innerHTML = '';
  bar.appendChild(el('span', null, `답한 문제 ${answered} / ${total}`));
  bar.appendChild(el('span', { class: remain ? 'unanswered' : '' }, `미답 ${remain}`));
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
  // 위치(버튼 기준 아래 정렬, 화면 우측 밖으로 벗어나지 않게 좌표 보정)
  const r = btn.getBoundingClientRect();
  const pw = 200; // 근사 폭
  pop.style.top = (r.bottom + 8) + 'px';
  pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left)) + 'px';
  pop.style.right = '';
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
  const remain = total - answered;
  const msg = remain > 0
    ? `아직 풀지 않은 문제가 ${remain}개 있어요.\n답한 문제 ${answered} / ${total}\n지금 제출할까요?`
    : `모든 문제에 답했습니다 (${answered} / ${total}).\n제출할까요?`;
  if (!confirm(msg)) return;
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
  // 이력 중간에서 next를 누르면 이력상 다음 문제로, 끝에 있으면 새 랜덤 픽
  const i = state.randomSeen.indexOf(state.currentNo);
  state.tempAnswer = null;
  if (i !== -1 && i < state.randomSeen.length - 1) {
    renderDetail(state.randomSeen[i + 1]);
    return;
  }
  const n = pickRandomFromSubject();
  if (n == null) return;
  renderDetail(n);
}

function prevRandom() {
  const i = state.randomSeen.indexOf(state.currentNo);
  if (i > 0) {
    state.tempAnswer = null;
    renderDetail(state.randomSeen[i - 1]);
  }
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

// detail에서 뒤로 가는 공통 동작. 이제는 history.back()에 위임한다 (popstate 핸들러가 처리).
// 학습 모드의 tempAnswer 정리만 여기서 수행.
function leaveDetailBack() {
  clearTempAnswerIfLeaving(state.currentNo);
  history.back();
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
  // 문제별로 대화를 보존한다. 현재 문제의 저장된 대화 로드.
  const no = state.currentNo;
  state.ai.messages = no != null ? getAiMessages(no).map(m => ({ ...m })) : [];
  state.ai.contextExpanded = true;
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
  // 대화 내용을 닫기 직전에 저장
  if (state.currentNo != null) saveAiMessages(state.currentNo, state.ai.messages);
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
  ctx.classList.remove('collapsed');
  if (card) {
    const expanded = state.ai.contextExpanded !== false;
    if (!expanded) ctx.classList.add('collapsed');

    const head = el('div', { class: 'sheet-context-title' }, [
      el('span', null, `문제 ${card.no} · ${card.subject}`),
      el('button', { class: 'sheet-context-toggle', dataset: { action: 'toggle-ctx' } },
         expanded ? '접기' : '펼치기')
    ]);
    ctx.appendChild(head);

    const bodyText = el('div', { class: 'sheet-context-body' }, card.q);
    ctx.appendChild(bodyText);
    renderMath(bodyText);

    // 본문 이미지 (있을 때만 표시)
    const img = new Image();
    img.className = 'sheet-context-img';
    img.alt = '문제 이미지';
    img.style.display = 'none';
    img.onload = () => { img.style.display = ''; };
    img.onerror = () => { img.remove(); };
    img.src = `images/${state.examId}/${card.no}.png`;
    ctx.appendChild(img);
  }

  const body = qs('#sheet-messages');
  body.innerHTML = '';

  if (state.ai.messages.length === 0) {
    const sugWrap = el('div', { class: 'suggestions' });
    const suggestions = [
      '이 문제의 핵심 개념을 한 문단으로 알려줘',
      card ? `왜 정답이 ${card.a}번인지 간단히 알려줘` : '정답 이유를 간단히 알려줘',
      '자주 틀리는 함정을 한 줄로 알려줘'
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
      // 저장 버튼 — 아웃라인 primary 로 가시성 강화
      const saveBtn = el('button', {
        class: 'msg-save-btn' + (m.saved ? ' saved' : ''),
        dataset: { action: 'save-note', idx: String(idx) }
      }, m.saved ? '✓ 메모에 저장됨' : '📝 메모에 저장');
      const actions = el('div', { class: 'msg-actions' }, [saveBtn]);
      msgEl.appendChild(actions);
      body.appendChild(msgEl);
      renderMath(msgEl);
    } else {
      msgEl.textContent = m.content;
      body.appendChild(msgEl);
    }
  });
}

// 마지막 AI 답변의 시작 지점으로 스크롤한다. (끝으로 내려버리지 않도록)
function scrollToLatestAiAnswer() {
  const body = qs('#sheet-messages');
  if (!body) return;
  const aiMsgs = body.querySelectorAll('.msg.ai');
  const last = aiMsgs[aiMsgs.length - 1];
  if (!last) return;
  const top = last.offsetTop - 8;
  body.scrollTo({ top, behavior: 'smooth' });
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
  // 답변을 끝까지 내리지 않고, 답변의 시작이 보이게 스크롤
  requestAnimationFrame(() => scrollToLatestAiAnswer());
  // 즉시 저장 — 시트를 닫지 않아도 대화 유실 없음
  if (state.currentNo != null) saveAiMessages(state.currentNo, state.ai.messages);
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

  // 야간 모드 토글
  const themeBtn = qs('#btn-toggle-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = cur ? 'light' : 'dark';
      applyTheme(next);
      setSetting('theme', next);
      const sw = qs('#theme-toggle');
      if (sw) sw.setAttribute('aria-checked', next === 'dark' ? 'true' : 'false');
    });
  }

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
  qs('#modes-back').addEventListener('click', () => history.back());
  qs('#modes-view').addEventListener('click', e => {
    const card = e.target.closest('.mode-card');
    if (!card) return;
    enterMode(card.dataset.mode);
  });

  // 리스트 뷰
  qs('#list-back').addEventListener('click', () => history.back());
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
    if (state.mode === 'random') { prevRandom(); return; }
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
  qs('#result-back').addEventListener('click', () => history.back());
  qs('#result-view').addEventListener('click', e => {
    if (e.target.closest('[data-action="back-home"]')) { renderHome(); show('home'); }
  });

  // AI 바텀시트
  qs('#ai-overlay').addEventListener('click', closeAiSheet);
  qs('#sheet-close').addEventListener('click', closeAiSheet);
  qs('#sheet-messages').addEventListener('click', e => {
    const sug = e.target.closest('[data-action="suggest"]');
    if (sug) {
      // 추천 질문은 클릭 즉시 전송
      const text = sug.textContent;
      sendAiMessage(text);
      return;
    }
    const save = e.target.closest('[data-action="save-note"]');
    if (save) {
      saveAiMessageAsNote(parseInt(save.dataset.idx, 10));
      return;
    }
  });
  // 컨텍스트(문제) 펼치기/접기
  qs('#sheet-context').addEventListener('click', e => {
    const t = e.target.closest('[data-action="toggle-ctx"]');
    if (!t) return;
    state.ai.contextExpanded = !(state.ai.contextExpanded !== false);
    renderAiSheet();
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
  // 저장된 테마(야간 모드) 적용 + 토글 초기 상태
  try {
    const s = getSettings();
    const theme = s.theme === 'dark' ? 'dark' : 'light';
    applyTheme(theme);
    const sw = qs('#theme-toggle');
    if (sw) sw.setAttribute('aria-checked', theme === 'dark' ? 'true' : 'false');
  } catch {}

  try {
    await loadManifest();
    bindEvents();
    renderHome();
    show('home');
    // history 초기화: 첫 엔트리를 home으로 교체 + popstate 리스너
    try { history.replaceState({ view: 'home' }, ''); } catch {}
    window.addEventListener('popstate', handlePopState);
  } catch (err) {
    console.error(err);
    const loading = qs('#loading');
    if (loading) loading.textContent = '데이터를 불러오지 못했습니다. 새로고침 해 주세요.';
    toast('초기화 실패: ' + (err.message || err));
  }
}
document.addEventListener('DOMContentLoaded', bootstrap);
