/* 기가 마스터 — 공부 앱(태블릿) + 퀴즈 앱(폰)
 * 자료: data/items.json, data/questions.json, data/units.json
 * 기록: 이 기기(localStorage)에 먼저 저장하고, claude.ai 아티팩트 저장소(db)가 있으면
 *       내 계정 전용 공간(data/users/<id>/)에 올려 다른 기기와 맞춘다.
 *       연동 부분(Remote)만 바꾸면 GitHub Pages + Firebase 등으로 옮길 수 있다.
 */
(() => {
'use strict';

const LS_KEY = 'gigamaster-v1';
const LS_UI = 'gigamaster-ui-v1';
const MIN = 60000, DAY = 86400000;
const INTERVALS = [10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]; // 상자 0~5
const DEFAULT_EXAM = '2026-12-09';
const MOCK_N = 20;
const TYPE_LABEL = {correct: '옳은 것', incorrect: '옳지 않은 것', combo: '보기 고르기', match: '짝짓기', calc: '계산'};
const NUMS = ['①', '②', '③', '④', '⑤'];
// claude.ai 아티팩트 안에서 열렸는지(연동 가능) — GitHub Pages에서는 false라 기기마다 따로 저장한다
const IN_ARTIFACT = !!(window.claude && typeof window.claude.use === 'function');
const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- DOM 도우미 ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') el.textContent = v; else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const icon = (d, label) => {
  const svg = s('svg', {viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'});
  for (const p of [].concat(d)) svg.append(s('path', {d: p}));
  return label ? [svg, h('span', {class: 'sr', text: label})] : svg;
};
const ICONS = {
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
};

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function todayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

/* ---------- 자료 ---------- */
const D = {items: [], qs: [], units: [], byId: new Map(), qById: new Map(), qByItem: new Map(), figs: []};
const unitRoman = u => (u || '').split('.')[0];
const unitTitle = u => (u || '').replace(/^[IVX]+\.\s*/, '');
const stripHand = t => t.replace(/^\(손글씨\)\s*/, '');

async function loadData() {
  const get = async (p, fallback) => {
    try { const r = await fetch(p, {cache: 'no-cache'}); if (!r.ok) throw new Error(p + ' ' + r.status); return await r.json(); }
    catch (e) { if (fallback !== undefined) return fallback; throw e; }
  };
  const [items, qs, units] = await Promise.all([get('data/items.json'), get('data/questions.json', []), get('data/units.json', {units: []})]);
  D.items = items; D.qs = qs;
  const present = new Set(items.map(i => i.unit));
  D.units = units.units.map(u => u.unit).filter(u => present.has(u));
  for (const i of items) D.byId.set(i.id, i);
  for (const q of qs) {
    D.qById.set(q.id, q);
    for (const e of q.evidence || []) { if (!D.qByItem.has(e)) D.qByItem.set(e, []); D.qByItem.get(e).push(q.id); }
  }
  // 전체 노트 정렬 키: 교과서는 쪽수 순서, 유인물은 연결된 교과서 쪽 뒤에(없으면 단원 끝)
  items.forEach((it, i) => {
    it._ord = it.source === 'textbook' ? it.page * 1000 + i % 1000 / 10
      : it.ref_page ? it.ref_page * 1000 + 900 + i % 1000 / 10 : 1e7 + i;
  });
  if (typeof window.GM_FIGURES === 'function') {
    try { D.figs = window.GM_FIGURES({h, s, item: id => D.byId.get(id)}) || []; } catch (e) { console.error(e); D.figs = []; }
  }
}

/* ---------- 기록(이 기기) ---------- */
const S = {q: {}, w: {}, meta: {includeBlue: false, examDate: DEFAULT_EXAM, mt: 0}};
let ui = {mode: '', unit: '', tab: 'red', weakOnly: false, query: '', size: 'm', theme: '', quizUnits: null};

function loadLocal() {
  try { const v = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (v) { S.q = v.q || {}; S.w = v.w || {}; S.meta = Object.assign(S.meta, v.meta || {}); } } catch (e) {}
  try { const v = JSON.parse(localStorage.getItem(LS_UI) || 'null'); if (v) ui = Object.assign(ui, v); } catch (e) {}
}
let saveTimer = 0;
function saveLocal() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({q: S.q, w: S.w, meta: S.meta})); } catch (e) {} }, 120);
}
function saveUi() { try { localStorage.setItem(LS_UI, JSON.stringify(Object.assign({}, ui, {query: ''}))); } catch (e) {} }
function applyLook() {
  const root = document.documentElement;
  if (ui.size && ui.size !== 'm') root.dataset.size = ui.size; else delete root.dataset.size;
  if (ui.theme) root.dataset.theme = ui.theme; else delete root.dataset.theme;
}

/* ---------- 연동(원격 저장) ----------
 * 문서: data/users/<id>/q-<문제id> {b,d,r,x,t,l}, w-<항목id> {c}, meta {includeBlue, examDate, mt}
 * 같은 문서는 시각(t/c/mt)이 더 새로운 쪽을 쓴다. */
const Remote = {
  state: 'local', col: null, seen: Object.create(null), queue: new Map(), running: false,
  set(st) {
    this.state = st;
    const el = $('#sync'); if (!el) return;
    const map = {local: ['', IN_ARTIFACT ? '이 기기에만 저장' : '이 기기에 저장'], wait: ['wait', '연동 중'], slow: ['wait', '연결이 느려요'], ok: ['ok', '연동됨'], bad: ['bad', '연동 안 됨']};
    const [k, t] = map[st] || map.local;
    el.dataset.s = k; $('.t', el).textContent = t;
    el.title = st === 'ok' ? '폰과 태블릿의 기록이 claude.ai 계정으로 맞춰지고 있어요'
      : st === 'local' ? (IN_ARTIFACT ? 'claude.ai에 로그인한 상태로 열면 기기끼리 기록이 맞춰져요' : '기록은 이 기기의 브라우저에 저장돼요. 기기끼리 연동되지는 않아요.') : '';
  },
  async start() {
    const c = window.claude;
    if (!c || typeof c.use !== 'function') return this.set('local');
    this.set('wait');
    let db = null, user = null;
    try { [db, user] = await Promise.all([c.use('db'), c.use('user')]); } catch (e) {}
    if (!db || !user) return this.set('local');
    let uid = null; try { uid = await user.id(); } catch (e) {}
    if (!uid) return this.set('local');
    try { this.col = db.collection('data/users/' + uid); } catch (e) { return this.set('local'); }
    const timer = setTimeout(() => { if (this.state === 'wait') this.set('slow'); }, 10000);
    let first = true;
    this.unsub = this.col.onSnapshot(snap => {
      let changed = false;
      for (const d of snap.docs) if (this.merge(d.id, d.data())) changed = true;
      if (!snap.metadata.fromCache) {
        clearTimeout(timer);
        if (this.state !== 'bad') this.set('ok');
        if (first) { first = false; this.pushNewer(); }
      }
      if (changed) { saveLocal(); scheduleRefresh(); }
    }, () => { clearTimeout(timer); this.set('bad'); });
  },
  merge(id, data) {
    if (!data) return false;
    if (id.startsWith('q-')) {
      const k = id.slice(2), t = +data.t || 0;
      this.seen[id] = Math.max(this.seen[id] || 0, t);
      const l = S.q[k];
      if (!l || t > (l.t || 0)) { S.q[k] = {b: +data.b || 0, d: +data.d || 0, r: +data.r || 0, x: +data.x || 0, t, l: data.l === 0 || data.l === 1 ? data.l : -1}; return true; }
    } else if (id.startsWith('w-')) {
      const k = id.slice(2), c = +data.c || 0;
      this.seen[id] = Math.max(this.seen[id] || 0, c);
      if (!S.w[k] || c > (S.w[k].c || 0)) { S.w[k] = {c}; return true; }
    } else if (id === 'meta') {
      const mt = +data.mt || 0;
      this.seen[id] = Math.max(this.seen[id] || 0, mt);
      if (mt > (S.meta.mt || 0)) { S.meta = {includeBlue: !!data.includeBlue, examDate: String(data.examDate || DEFAULT_EXAM), mt}; return true; }
    }
    return false;
  },
  pushNewer() {
    for (const [k, v] of Object.entries(S.q)) if ((v.t || 0) > (this.seen['q-' + k] || 0)) this.put('q-' + k, v);
    for (const [k, v] of Object.entries(S.w)) if ((v.c || 0) > (this.seen['w-' + k] || 0)) this.put('w-' + k, v);
    if ((S.meta.mt || 0) > (this.seen.meta || 0)) this.put('meta', S.meta);
  },
  put(id, data) {
    if (!this.col || this.state === 'bad') return;
    this.queue.set(id, Object.assign({}, data));
    this.flush();
  },
  async flush() {
    if (this.running) return;
    this.running = true;
    while (this.queue.size && this.state !== 'bad') {
      const [id, data] = this.queue.entries().next().value;
      this.queue.delete(id);
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try { await this.col.doc(id).set(data); ok = true; }
        catch (e) {
          const code = e && e.code;
          if (code === 'unavailable' && attempt === 0) { await sleep(600 + Math.random() * 900); continue; }
          if (code === 'quota_exceeded') toast('연동 저장 공간이 가득 찼어요. 이 기기에는 계속 저장돼요.');
          this.set('bad'); break;
        }
      }
      if (ok) this.seen[id] = Math.max(this.seen[id] || 0, data.t || data.c || data.mt || 0);
    }
    this.running = false;
  },
  async refetch() {
    if (!this.col) return false;
    try {
      const snap = await this.col.get();
      for (const d of snap.docs) this.merge(d.id, d.data());
      saveLocal(); return true;
    } catch (e) { return false; }
  },
  async wipe() {
    if (!this.col) return;
    const ids = Object.keys(this.seen);
    for (const id of ids) { try { await this.col.doc(id).delete(); } catch (e) {} delete this.seen[id]; }
  },
};

/* ---------- 학습 기록 계산 ---------- */
function record(qid, correct) {
  const now = Date.now();
  const p = Object.assign({b: 0, d: 0, r: 0, x: 0, t: 0, l: -1}, S.q[qid]);
  if (correct) { p.r++; p.b = Math.min(p.b + 1, INTERVALS.length - 1); p.l = 1; }
  else { p.x++; p.b = 0; p.l = 0; }
  p.d = now + INTERVALS[p.b]; p.t = now;
  S.q[qid] = p; saveLocal(); Remote.put('q-' + qid, p);
}
function wrongQsOf(itemId) {
  const c = (S.w[itemId] && S.w[itemId].c) || 0;
  return (D.qByItem.get(itemId) || []).filter(q => { const p = S.q[q]; return p && p.l === 0 && p.t > c; });
}
const isWeak = id => wrongQsOf(id).length > 0;
function clearWeak(id) {
  S.w[id] = {c: Date.now()}; saveLocal(); Remote.put('w-' + id, S.w[id]);
}
function setMeta(patch) {
  S.meta = Object.assign({}, S.meta, patch, {mt: Date.now()}); saveLocal(); Remote.put('meta', S.meta);
}
const levelOk = q => q.level === 'red' || S.meta.includeBlue;
function unitStats(unit) {
  const qs = D.qs.filter(q => (!unit || q.unit === unit) && levelOk(q));
  let r = 0, x = 0, known = 0, seen = 0;
  for (const q of qs) { const p = S.q[q.id]; if (!p) continue; seen++; r += p.r; x += p.x; if (p.l === 1) known++; }
  const weakItems = D.items.filter(i => (!unit || i.unit === unit) && isWeak(i.id)).length;
  return {total: qs.length, seen, r, x, acc: pct(r, r + x), mastery: pct(known, qs.length), weakItems};
}
function todayCount() { const t0 = todayStart(); return Object.values(S.q).filter(p => p.t >= t0).length; }
function dueWrong(units) {
  const now = Date.now();
  return D.qs.filter(q => (!units || units.includes(q.unit)) && levelOk(q)).filter(q => { const p = S.q[q.id]; return p && p.l === 0 && p.d <= now; });
}
function examDday() {
  const d = new Date((S.meta.examDate || DEFAULT_EXAM) + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.round((d - todayStart()) / DAY);
}
const ddayText = n => n === null ? 'D-?' : n > 0 ? 'D-' + n : n === 0 ? 'D-DAY' : 'D+' + (-n);

/* ---------- 화면 틀 ---------- */
let current = '';
function bar(view) {
  const modeLink = (hash, label) => h('a', {href: '#' + hash, 'aria-current': view === hash ? 'page' : null}, label);
  return h('header', {class: 'bar gutter'},
    h('div', {class: 'wrap'},
      h('a', {class: 'brand', href: '#home', 'aria-label': '처음 화면'}, h('span', {class: 'logo', 'aria-hidden': 'true'}, '기'), h('span', {class: 'name'}, '기가 마스터')),
      h('nav', {class: 'switch-mode', 'aria-label': '앱 고르기'}, modeLink('study', '공부'), modeLink('quiz', '문제')),
      h('button', {id: 'sync', class: 'sync', type: 'button', onclick: () => toast($('#sync').title || $('#sync .t').textContent)}, h('i'), h('span', {class: 't'}, '')),
      h('button', {class: 'iconbtn', type: 'button', onclick: openSettings, 'aria-label': '설정'}, icon(ICONS.gear))));
}
function mount(view, ...content) {
  current = view;
  const app = $('#app');
  app.textContent = '';
  app.append(bar(view), ...content);
  Remote.set(Remote.state);
}

let refreshTimer = 0;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (current === 'study') renderStudyBody(true);
    else if (current === 'home') renderHome();
    else if (current === 'quiz' && !Q.session) renderQuiz();
  }, 200);
}

function route() {
  stopTimer();
  const r = location.hash.replace('#', '');
  if (r === 'study') { ui.mode = 'study'; saveUi(); renderStudy(); }
  else if (r === 'quiz') { ui.mode = 'quiz'; saveUi(); renderQuiz(); }
  else { if (r === 'home') { ui.mode = ''; saveUi(); } renderHome(); }
  window.scrollTo(0, 0);
}

/* ---------- 처음 화면 ---------- */
function ring(p, label, color) {
  return h('span', {class: 'ring', style: {'--p': p, '--c': color || 'var(--accent)'}, role: 'img', 'aria-label': label}, h('span', {text: p + '%'}));
}
function renderHome() {
  const all = unitStats(null);
  const dd = examDday();
  const hero = h('section', {class: 'hero gutter'}, h('div', {class: 'wrap'},
    h('div', {class: 'eyebrow', text: '기술·가정 시험까지'}),
    h('h1', null, h('span', {class: 'dday', text: ddayText(dd)}), ' 표시한 것만 확실하게'),
    h('p', {text: `교과서와 유인물에 빨강·파랑으로 표시한 ${D.items.length}개 항목과 ${D.qs.length}개 문제로 공부해요.`}),
    h('div', {class: 'stats'},
      h('div', {class: 'stat'}, h('b', {text: todayCount()}), h('span', {text: '오늘 푼 문제'})),
      h('div', {class: 'stat'}, h('b', {text: all.r + all.x ? all.acc + '%' : '–'}), h('span', {text: '정답률'})),
      h('div', {class: 'stat'}, h('b', {text: all.mastery + '%'}), h('span', {text: '맞힌 상태인 문제'})),
      h('div', {class: 'stat'}, h('b', {text: all.weakItems}), h('span', {text: '약점 항목'})))));
  const art = (cols) => h('div', {class: 'art', 'aria-hidden': 'true'}, cols.map(([w, hh, bg]) => h('span', {style: {width: w + 'px', height: hh + 'px', background: bg}})));
  const modes = h('div', {class: 'modes'},
    h('a', {class: 'mode', href: '#study'},
      art([[64, 70, 'var(--red-soft)'], [44, 50, 'var(--blue-soft)'], [80, 84, 'var(--surface-2)']]),
      h('h2', {text: '공부하기'}),
      h('p', {text: '태블릿에 맞춘 화면. 빨강만 모은 암기 시트, 전체 노트, 가리고 외우기, 표·그림.'}),
      h('span', {class: 'go', text: '공부 앱 열기 →'})),
    h('a', {class: 'mode', href: '#quiz'},
      h('div', {class: 'art', 'aria-hidden': 'true', style: {flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-end', width: '160px'}},
        h('span', {style: {height: '20px', background: 'var(--key)'}}), h('span', {style: {height: '20px', background: 'var(--ok-soft)'}}), h('span', {style: {height: '20px', background: 'var(--key)'}})),
      h('h2', {text: '문제 풀기'}),
      h('p', {text: '폰 세로 화면에 맞춘 오지선다. 틀린 문제는 간격을 두고 다시 나오고, 모의고사 20문항도 있어요.'}),
      h('span', {class: 'go', text: '퀴즈 앱 열기 →'})));
  const units = h('section', null, h('h2', {class: 'section-title', text: '단원별 진도'}),
    h('div', {class: 'unitgrid'}, D.units.map(u => {
      const st = unitStats(u);
      return h('a', {class: 'ucard', href: '#study', onclick: () => { ui.unit = u; ui.tab = 'red'; saveUi(); }, style: {textDecoration: 'none', color: 'inherit'}},
        ring(st.mastery, `맞힌 상태 ${st.mastery}%`),
        h('div', null, h('b', {text: unitTitle(u)}), h('small', {text: `${unitRoman(u)}단원 · 문제 ${st.total}개` + (st.weakItems ? ` · 약점 ${st.weakItems}` : '')})));
    })),
    h('p', {class: 'note-quiet', text: '원은 그 단원 문제 중 마지막에 맞힌 문제의 비율이에요. II단원은 아직 사진이 없어요.'}));
  mount('home', hero, h('main', {class: 'home-main gutter'}, h('div', {class: 'wrap'}, modes, units)));
}

/* ---------- 공부 앱 ---------- */
function sourceChip(it) {
  if (it.source === 'textbook') return h('span', {class: 'chip', text: `교과서 ${it.page}쪽`});
  return h('span', {class: 'chip', text: '유인물 · ' + String(it.handout || '').split(' · ')[0]});
}
function markText(text, keywords, mode) {
  // mode: 'bold' (핵심어 굵게) | 'mask' (핵심어 가리기)
  const frag = document.createDocumentFragment();
  const ranges = [];
  const kws = [...new Set(keywords || [])].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const kw of kws) {
    let from = 0, at;
    while ((at = text.indexOf(kw, from)) !== -1) {
      const end = at + kw.length;
      if (!ranges.some(r => at < r[1] && end > r[0])) ranges.push([at, end]);
      from = end;
      if (mode === 'mask') break; // 같은 말은 처음 한 번만 가린다
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) frag.append(text.slice(pos, a));
    const word = text.slice(a, b);
    if (mode === 'mask') {
      const btn = h('button', {type: 'button', 'aria-label': '가린 말 보기'}, h('span', {class: 'face', text: word}), h('span', {class: 'back', text: word}));
      const wrap = h('span', {class: 'mk'}, btn);
      btn.addEventListener('click', () => {
        wrap.classList.toggle('open');
        btn.setAttribute('aria-label', wrap.classList.contains('open') ? word : '가린 말 보기');
        updateMaskCount();
      });
      frag.append(wrap);
    } else frag.append(h('b', {text: word}));
    pos = b;
  }
  if (pos < text.length) frag.append(text.slice(pos));
  return frag;
}
function itemCard(it, mode) {
  const weakQs = wrongQsOf(it.id);
  const hand = /^\(손글씨\)/.test(it.text);
  const text = stripHand(it.text);
  const qids = D.qByItem.get(it.id) || [];
  const cls = ['item', it.level, it.star ? 'is-star' : '', weakQs.length ? 'is-weak' : ''].join(' ');
  const meta = h('div', {class: 'meta'},
    sourceChip(it),
    it.star ? h('span', {class: 'chip star', text: '☆ 특히 중요'}) : null,
    hand ? h('span', {class: 'chip', text: '손글씨 메모'}) : null,
    it.kind === 'problem' ? h('span', {class: 'chip', text: '단원 마무리 문제'}) : null,
    it.figure ? h('button', {class: 'chip', type: 'button', onclick: () => { ui.tab = 'figs'; saveUi(); renderStudyBody(); }, text: '표·그림 보기'}) : null,
    it.confidence === 'low' ? h('span', {class: 'chip pending', title: '사진 판독을 아직 확인하지 않은 항목이에요', text: '판독 확인 전'}) : null,
    (it.links || []).length ? h('button', {class: 'chip blue', type: 'button', onclick: () => jumpTo(it.links[0]),
      text: it.source === 'textbook' ? `유인물에도 있음 ${it.links.length}` : `교과서 ${it.ref_page}쪽 보기`}) : null,
    h('span', {class: 'sp'}),
    weakQs.length ? h('span', {class: 'chip weak', text: `약점 · 틀린 문제 ${weakQs.length}`}) : null,
    weakQs.length ? h('button', {class: 'chip ok', type: 'button', onclick: () => { clearWeak(it.id); toast('약점 표시를 뗐어요'); renderStudyBody(true); }, text: '외웠어요'}) : null,
    qids.length ? h('button', {class: 'chip', type: 'button', onclick: () => startSession({mode: 'practice', qids: shuffle(qids.slice()), title: '이 항목 문제'}), text: `문제 ${qids.length}개 풀기`}) : null);
  return h('article', {class: cls, id: 'it-' + it.id, 'data-id': it.id},
    h('p', {class: 'txt'}, markText(text, it.keywords, mode)), meta);
}
function inUnit(it) { return !ui.unit || it.unit === ui.unit; }
function matchQuery(it) {
  const q = (ui.query || '').trim().toLowerCase();
  return !q || it.text.toLowerCase().includes(q) || (it.section || '').toLowerCase().includes(q);
}

function renderStudy() {
  if (ui.unit && !D.units.includes(ui.unit)) ui.unit = '';
  const side = h('aside', {class: 'side', 'aria-label': '단원'},
    h('h2', {text: '단원'}),
    [''].concat(D.units).map(u => {
      const st = unitStats(u || null);
      const items = D.items.filter(i => !u || i.unit === u);
      return h('button', {class: 'unitbtn', type: 'button', 'aria-current': String(ui.unit === u), onclick: () => { ui.unit = u; saveUi(); renderStudy(); window.scrollTo(0, 0); }},
        ring(st.mastery, `맞힌 상태 ${st.mastery}%`, st.weakItems ? 'var(--weak)' : null),
        h('span', null,
          h('b', {text: u ? `${unitRoman(u)}. ${unitTitle(u)}` : '전체 단원'}),
          h('small', null, `빨강 ${items.filter(i => i.level === 'red').length} · 파랑 ${items.filter(i => i.level === 'blue').length}`,
            st.weakItems ? h('span', {class: 'wk', text: ` · 약점 ${st.weakItems}`}) : null)));
    }));
  const tabs = [['red', '빨강만'], ['notes', '전체 노트'], ['mask', '가리고 외우기'], ['figs', '표·그림']];
  const tablist = h('div', {class: 'tabs', role: 'tablist', 'aria-label': '보기'},
    tabs.map(([k, label]) => h('button', {type: 'button', role: 'tab', 'aria-selected': String(ui.tab === k), onclick: () => { ui.tab = k; saveUi(); renderStudy(); }}, label)));
  const searchInput = h('input', {id: 'q', type: 'search', placeholder: '내용 찾기', 'aria-label': '내용 찾기', value: ui.query || ''});
  searchInput.addEventListener('input', () => { ui.query = searchInput.value; renderStudyBody(); });
  const head = h('div', {class: 'mainhead'},
    h('h1', {text: ui.unit ? unitTitle(ui.unit) : '전체 단원'}),
    tablist,
    h('div', {class: 'tools'},
      h('button', {class: 'toggle', type: 'button', 'aria-pressed': String(!!ui.weakOnly), onclick: e => { ui.weakOnly = !ui.weakOnly; e.currentTarget.setAttribute('aria-pressed', String(ui.weakOnly)); saveUi(); renderStudyBody(); }},
        h('span', {class: 'sw', 'aria-hidden': 'true'}), '약점만'),
      ui.tab !== 'figs' ? h('label', {class: 'search'}, icon(ICONS.search), searchInput) : null),
    ui.tab === 'notes' ? h('div', {class: 'legend'},
      h('span', null, h('i', {style: {background: 'var(--red)'}}), '빨강 · 시험에 나옴'),
      h('span', null, h('i', {style: {background: 'var(--blue)'}}), '파랑 · 알면 좋음'),
      h('span', null, h('i', {style: {background: 'var(--weak)'}}), '약점(퀴즈에서 틀림)')) : null);
  const main = h('section', {class: 'main'}, head, h('div', {id: 'sbody', class: 'main'}));
  mount('study', h('main', {class: 'gutter'}, h('div', {class: 'wrap study'}, side, main)));
  renderStudyBody();
}

function groupBy(list, keyFn) {
  const out = [];
  for (const it of list) { const k = keyFn(it); const last = out[out.length - 1]; if (last && last.key === k) last.items.push(it); else out.push({key: k, items: [it]}); }
  return out;
}
function emptyState(title, body) { return h('div', {class: 'empty'}, h('b', {text: title}), h('span', {text: body})); }

function renderStudyBody(keepScroll) {
  const box = $('#sbody'); if (!box) return;
  const y = window.scrollY;
  box.textContent = '';
  let list = D.items.filter(inUnit).filter(matchQuery);
  if (ui.weakOnly) list = list.filter(i => isWeak(i.id));
  if (ui.tab === 'red' || ui.tab === 'notes') {
    if (ui.tab === 'red') list = list.filter(i => i.level === 'red');
    list = list.slice().sort((a, b) => (D.units.indexOf(a.unit) - D.units.indexOf(b.unit)) || (a._ord - b._ord));
    if (!list.length) box.append(ui.weakOnly ? emptyState('약점이 없어요', '퀴즈에서 틀린 문제가 생기면 그 근거 항목이 여기에 모여요.') : emptyState('찾는 내용이 없어요', '찾기 칸의 말을 바꾸거나 다른 단원을 골라 보세요.'));
    const groups = groupBy(list, it => it.unit + '|' + (it.source === 'textbook' ? it.page : 'h' + (it.handout || '')) + '|' + it.section);
    for (const g of groups) {
      const it0 = g.items[0];
      const pg = it0.source === 'textbook' ? `${it0.page}쪽` : (it0.handout || '유인물');
      const sec = it0.section || '';
      box.append(h('section', {class: 'group'},
        h('h3', null, h('span', {class: 'pg', text: pg}), h('span', {text: sec}), !ui.unit ? h('span', {text: '· ' + unitRoman(it0.unit) + '단원'}) : null,
          it0.source === 'handout' && it0.ref_page ? h('span', {text: `· 교과서 ${it0.ref_page}쪽과 연결`}) : null),
        g.items.map(it => itemCard(it, 'bold'))));
    }
  } else if (ui.tab === 'mask') {
    list = list.filter(i => i.level === 'red' && (i.keywords || []).length && i.kind !== 'problem');
    if (ui.maskShuffle) shuffle(list); else list.sort((a, b) => (D.units.indexOf(a.unit) - D.units.indexOf(b.unit)) || (a._ord - b._ord));
    const tools = h('div', {class: 'mask-tools'},
      h('button', {class: 'btn quiet', type: 'button', onclick: () => { box.querySelectorAll('.mk').forEach(m => m.classList.add('open')); updateMaskCount(); }}, '모두 보기'),
      h('button', {class: 'btn quiet', type: 'button', onclick: () => { box.querySelectorAll('.mk').forEach(m => m.classList.remove('open')); updateMaskCount(); }}, '다시 가리기'),
      h('button', {class: 'btn ghost', type: 'button', onclick: () => { ui.maskShuffle = !ui.maskShuffle; saveUi(); renderStudyBody(); }}, ui.maskShuffle ? '원래 순서로' : '순서 섞기'),
      h('span', {class: 'count', id: 'maskCount'}));
    box.append(tools);
    if (!list.length) box.append(emptyState(ui.weakOnly ? '가릴 약점이 없어요' : '가릴 내용이 없어요', '빨강 항목의 핵심어를 가려서 보여 줘요.'));
    box.append(...list.map(it => itemCard(it, 'mask')));
    updateMaskCount();
  } else {
    let figs = D.figs.filter(f => !ui.unit || f.unit === ui.unit);
    const weakFig = f => (f.ev || []).some(isWeak);
    if (ui.weakOnly) figs = figs.filter(weakFig);
    if (!figs.length) box.append(emptyState(ui.weakOnly ? '약점이 들어 있는 표·그림이 없어요' : '이 단원에는 표·그림이 없어요', '다른 단원을 골라 보세요.'));
    const grid = h('div', {class: 'figs'});
    for (const f of figs) {
      let body;
      try { body = f.render(); } catch (e) { console.error(e); body = h('p', {class: 'note-quiet', text: '그림을 그리지 못했어요.'}); }
      const weak = weakFig(f);
      grid.append(h('article', {class: 'fig' + (f.wide ? ' wide' : '') + (weak ? ' is-weak' : '')},
        h('div', {class: 'meta', style: {display: 'flex', gap: '6px', flexWrap: 'wrap'}},
          h('span', {class: 'chip ' + (f.level === 'blue' ? 'blue' : 'red'), text: f.level === 'blue' ? '파랑' : '빨강'}),
          !ui.unit ? h('span', {class: 'chip', text: unitRoman(f.unit) + '단원'}) : null,
          weak ? h('span', {class: 'chip weak', text: '약점 포함'}) : null),
        h('h3', {text: f.title}), body,
        f.src ? h('p', {class: 'src', text: '출처: ' + f.src}) : null));
    }
    box.append(grid);
  }
  if (keepScroll) window.scrollTo(0, y);
}
function updateMaskCount() {
  const el = $('#maskCount'); if (!el) return;
  const all = document.querySelectorAll('#sbody .mk').length, open = document.querySelectorAll('#sbody .mk.open').length;
  el.textContent = all ? `가린 말 ${all}개 중 ${open}개 확인` : '';
}
function jumpTo(id) {
  const it = D.byId.get(id); if (!it) return;
  if (location.hash !== '#study') { ui.unit = it.unit; ui.tab = it.level === 'red' ? 'red' : 'notes'; ui.weakOnly = false; ui.query = ''; saveUi(); location.hash = 'study'; setTimeout(() => flashItem(id), 120); return; }
  let need = false;
  if (ui.unit && ui.unit !== it.unit) { ui.unit = it.unit; need = true; }
  if (ui.tab === 'figs' || ui.tab === 'mask' || (ui.tab === 'red' && it.level !== 'red')) { ui.tab = 'notes'; need = true; }
  if (ui.weakOnly && !isWeak(id)) { ui.weakOnly = false; need = true; }
  if (ui.query) { ui.query = ''; need = true; }
  if (need) { saveUi(); renderStudy(); }
  flashItem(id);
}
function flashItem(id) {
  const el = document.getElementById('it-' + id); if (!el) return;
  el.scrollIntoView({behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center'});
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

/* ---------- 퀴즈 앱 ---------- */
const Q = {session: null, timer: 0};
function stopTimer() { clearInterval(Q.timer); Q.timer = 0; }
function quizUnits() {
  const avail = D.units.filter(u => D.qs.some(q => q.unit === u));
  if (!Array.isArray(ui.quizUnits) || !ui.quizUnits.length) return avail;
  const sel = ui.quizUnits.filter(u => avail.includes(u));
  return sel.length ? sel : avail;
}
function pickPractice(n, units) {
  const now = Date.now();
  const pool = D.qs.filter(q => units.includes(q.unit) && levelOk(q));
  const scored = pool.map(q => {
    const p = S.q[q.id];
    let pr;
    if (p && p.l === 0 && p.d <= now) pr = 0;
    else if (!p) pr = 1;
    else if (p.d <= now) pr = 2;
    else if (p.l === 0) pr = 3;
    else pr = 4;
    return {q, pr, k: Math.random() / (q.star ? 2.2 : 1) + (pr === 4 ? (p.d - now) / DAY : 0)};
  });
  scored.sort((a, b) => a.pr - b.pr || a.k - b.k);
  return shuffle(scored.slice(0, n).map(x => x.q.id));
}
function pickMock(units) {
  const pool = D.qs.filter(q => units.includes(q.unit) && levelOk(q));
  const byUnit = units.map(u => shuffle(pool.filter(q => q.unit === u)));
  const total = pool.length, n = Math.min(MOCK_N, total);
  // 단원별 문제 수 비율대로 나누고(최대 잉여법), 단원마다 별표 문제를 조금 앞세운다
  const raw = byUnit.map(l => total ? l.length / total * n : 0);
  const take = raw.map(Math.floor);
  let left = n - take.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0 && take[i] < byUnit[i].length) { take[i]++; left--; } });
  const out = [];
  byUnit.forEach((l, i) => { l.sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) + (Math.random() - .5) * 1.2); out.push(...l.slice(0, take[i]).map(q => q.id)); });
  return shuffle(out);
}
/* 한 판(session): list는 [{id, again}] — 틀려서 다시 넣은 문제는 again:true.
 * 답·결과·보기 순서는 list의 위치(번호)로 기억한다. */
function startSession(opt) {
  const qids = (opt.qids || []).filter(id => D.qById.has(id));
  if (!qids.length) { toast('풀 문제가 없어요'); return; }
  Q.session = {mode: opt.mode, title: opt.title || '', list: qids.map(id => ({id, again: false})), idx: 0, answers: {}, results: {}, perms: {},
    combo: 0, best: 0, started: Date.now(), done: false, confirmQuit: false, confirmSubmit: false, showPalette: false};
  if (location.hash !== '#quiz') { location.hash = 'quiz'; } else { renderQuiz(); window.scrollTo(0, 0); }
}
function permOf(s, idx, q) {
  if (!s.perms[idx]) s.perms[idx] = q.shuffle === false || q.type === 'combo' ? [0, 1, 2, 3, 4] : shuffle([0, 1, 2, 3, 4]);
  return s.perms[idx];
}
function renderQuiz() {
  stopTimer();
  if (Q.session) return Q.session.done ? renderResults() : renderQuestion();
  const units = quizUnits();
  const avail = D.units.filter(u => D.qs.some(q => q.unit === u));
  const due = dueWrong(units);
  const all = unitStats(null);
  const dd = examDday();
  const pick = h('div', {class: 'unitpick', role: 'group', 'aria-label': '출제 단원'},
    avail.map(u => h('button', {type: 'button', 'aria-pressed': String(units.includes(u)), onclick: () => {
      let sel = quizUnits().slice();
      if (sel.includes(u)) { if (sel.length > 1) sel = sel.filter(x => x !== u); else return toast('단원을 하나는 골라야 해요'); } else sel.push(u);
      ui.quizUnits = sel.length === avail.length ? null : sel; saveUi(); renderQuiz();
    }}, `${unitRoman(u)}. ${unitTitle(u)}`)));
  const blueBtn = h('button', {class: 'toggle', type: 'button', 'aria-pressed': String(!!S.meta.includeBlue), onclick: () => { setMeta({includeBlue: !S.meta.includeBlue}); renderQuiz(); }},
    h('span', {class: 'sw', 'aria-hidden': 'true', style: {background: S.meta.includeBlue ? 'var(--blue)' : null}}), '파랑 항목 문제도 내기');
  const nPool = D.qs.filter(q => units.includes(q.unit) && levelOk(q)).length;
  const start = n => startSession({mode: 'practice', qids: pickPractice(n, units), title: `${n}문제 연습`});
  const body = h('div', {class: 'quiz'},
    h('section', {class: 'qhome-hero'},
      h('h1', null, ddayText(dd), ' · 오늘 ', String(todayCount()), '문제 풀었어요'),
      h('p', {text: due.length ? `다시 볼 때가 된 틀린 문제가 ${due.length}개 있어요.` : '틀린 문제는 10분 뒤, 다음 날처럼 간격을 두고 다시 나와요.'}),
      h('div', {class: 'stats'},
        h('div', {class: 'stat'}, h('b', {text: all.r + all.x ? all.acc + '%' : '–'}), h('span', {text: '정답률'})),
        h('div', {class: 'stat'}, h('b', {text: all.seen + '/' + all.total}), h('span', {text: '풀어 본 문제'})),
        h('div', {class: 'stat'}, h('b', {text: all.weakItems}), h('span', {text: '약점 항목'})))),
    h('section', {class: 'panel'},
      h('h2', {text: '시작하기'}),
      h('div', {class: 'startgrid'},
        h('button', {class: 'btn big', type: 'button', onclick: () => start(10)}, '10문제'),
        h('button', {class: 'btn big', type: 'button', onclick: () => start(20)}, '20문제'),
        h('button', {class: 'btn big quiet full', type: 'button', disabled: !due.length || null, onclick: () => startSession({mode: 'practice', qids: shuffle(due.map(q => q.id)).slice(0, 20), title: '틀린 문제 다시'})}, `틀린 문제 다시 풀기 (${due.length})`),
        h('button', {class: 'btn big ghost full', type: 'button', onclick: () => startSession({mode: 'mock', qids: pickMock(units), title: '모의고사'})}, `모의고사 ${MOCK_N}문항 · 시간 제한 없음`))),
    h('section', {class: 'panel'},
      h('h2', {text: '풀 범위'}), pick, blueBtn,
      h('p', {class: 'note-quiet', text: `지금 범위의 문제 ${nPool}개`})),
    h('section', {class: 'panel'},
      h('h2', {text: '단원별 정답률'}),
      h('div', {class: 'accbars'}, avail.map(u => {
        const st = unitStats(u);
        return h('div', {class: 'accrow'},
          h('span', {class: 'nm', text: `${unitRoman(u)}. ${unitTitle(u)}`}),
          h('span', {class: 'track', role: 'img', 'aria-label': `정답률 ${st.acc}%`}, h('i', {style: {width: (st.r + st.x ? st.acc : 0) + '%'}})),
          h('span', {class: 'v', text: st.r + st.x ? st.acc + '%' : '–'}));
      }))));
  mount('quiz', h('main', {class: 'gutter'}, body));
}

function choiceButton(q, pos, origIndex, s) {
  const chosen = s.answers[s.idx];
  const answered = s.mode === 'practice' && chosen !== undefined;
  let cls = 'choice';
  if (answered) {
    if (origIndex + 1 === q.answer) cls += ' right';
    else if (origIndex === chosen) cls += ' wrong';
    else cls += ' dim';
  }
  return h('li', null, h('button', {class: cls, type: 'button', 'aria-pressed': s.mode === 'mock' ? String(chosen === origIndex) : null,
    onclick: () => choose(q, origIndex)},
    h('span', {class: 'n', 'aria-hidden': 'true', text: pos + 1}), h('span', {text: q.choices[origIndex]})));
}
function renderQuestion() {
  stopTimer();
  const s = Q.session;
  const entry = s.list[s.idx];
  const qid = entry.id;
  const q = D.qById.get(qid);
  const perm = permOf(s, s.idx, q);
  const answered = s.mode === 'practice' && s.answers[s.idx] !== undefined;
  const nDone = s.mode === 'mock' ? Object.keys(s.answers).length : s.idx + (answered ? 1 : 0);
  const top = h('div', {class: 'qtop'},
    h('div', {class: 'row'},
      h('button', {class: 'iconbtn', type: 'button', 'aria-label': '그만 풀기', onclick: () => { s.confirmQuit = true; renderQuestion(); }}, icon(ICONS.close)),
      h('div', {class: 'prog', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': s.list.length, 'aria-valuenow': nDone, 'aria-label': '진행'}, h('i', {style: {width: pct(nDone, s.list.length) + '%'}})),
      h('span', {class: 'num', text: `${s.idx + 1} / ${s.list.length}`}),
      s.mode === 'mock' ? h('span', {class: 'timer', id: 'timer'}) : null,
      s.mode === 'practice' && s.combo >= 2 ? h('span', {class: 'combo pop', text: `${s.combo}연속 정답`}) : null,
      s.mode === 'mock' ? h('button', {class: 'iconbtn', type: 'button', 'aria-label': '문항 번호 보기', 'aria-expanded': String(s.showPalette), onclick: () => { s.showPalette = !s.showPalette; renderQuestion(); }}, icon(ICONS.grid)) : null),
    s.confirmQuit ? h('div', {class: 'confirm'},
      h('b', {text: s.mode === 'mock' ? '모의고사를 그만둘까요? 아직 제출하지 않은 답은 기록되지 않아요.' : '그만 풀까요? 지금까지 푼 기록은 저장돼 있어요.'}),
      h('div', {class: 'row-end'},
        h('button', {class: 'btn quiet', type: 'button', onclick: () => { s.confirmQuit = false; renderQuestion(); }}, '계속 풀기'),
        h('button', {class: 'btn', type: 'button', onclick: () => { Q.session = null; renderQuiz(); }}, '그만하기'))) : null,
    s.mode === 'mock' && s.showPalette ? h('div', {class: 'palette', role: 'group', 'aria-label': '문항 이동'},
      s.list.map((e, i) => h('button', {type: 'button', class: s.answers[i] !== undefined ? 'done' : '', 'aria-current': String(i === s.idx), 'aria-label': `${i + 1}번` + (s.answers[i] !== undefined ? ' (답함)' : ''), onclick: () => { s.idx = i; s.showPalette = false; renderQuestion(); }}, String(i + 1)))) : null);
  const ev = (q.evidence || []).map(id => D.byId.get(id)).filter(Boolean);
  const card = h('article', {class: 'qcard'},
    h('div', {class: 'kind'},
      h('span', {class: 'chip', text: unitRoman(q.unit) + '단원'}),
      h('span', {class: 'chip', text: TYPE_LABEL[q.type] || q.type}),
      q.level === 'blue' ? h('span', {class: 'chip blue', text: '파랑'}) : null,
      q.star ? h('span', {class: 'chip star', text: '☆ 중요'}) : null,
      entry.again ? h('span', {class: 'chip weak', text: '다시 나온 문제'}) : null),
    h('p', {class: 'stem', id: 'stem', text: q.stem}),
    q.boxes && q.boxes.length ? h('ul', {class: 'boxes', 'aria-label': '보기'}, q.boxes.map(b => { const m = b.match(/^([ㄱ-ㅎ])\.\s*(.*)$/); return h('li', null, h('b', {text: m ? m[1] + '.' : ''}), h('span', {text: m ? m[2] : b})); })) : null,
    h('ol', {class: 'choices' + (answered ? ' locked' : ''), 'aria-labelledby': 'stem'}, perm.map((orig, pos) => choiceButton(q, pos, orig, s))));
  let feedback = null;
  if (answered) {
    const ok = s.results[s.idx];
    const rightPos = perm.indexOf(q.answer - 1);
    feedback = h('section', {class: 'feedback ' + (ok ? 'ok' : 'no'), 'aria-live': 'polite'},
      h('h3', {text: ok ? '정답이에요' : `틀렸어요 · 정답은 ${NUMS[rightPos]}`}),
      h('p', {text: q.explanation}),
      h('p', {class: 'src', text: '출처: ' + (q.source || '')}),
      ev.length ? h('div', {style: {display: 'flex', flexWrap: 'wrap', gap: '6px'}}, ev.slice(0, 4).map(it => h('button', {class: 'chip', type: 'button', onclick: () => { Q.session = s; jumpTo(it.id); }, text: '근거: ' + (it.source === 'textbook' ? it.page + '쪽' : '유인물') + ' ' + stripHand(it.text).slice(0, 14) + '…'}))) : null);
  }
  let nav;
  if (s.mode === 'practice') {
    nav = h('div', {class: 'qnav'}, answered
      ? h('button', {class: 'btn big', type: 'button', id: 'next', onclick: nextQuestion}, s.idx + 1 < s.list.length ? '다음 문제' : '결과 보기')
      : h('button', {class: 'btn big quiet', type: 'button', disabled: true}, '답을 고르세요'));
  } else {
    const last = s.idx === s.list.length - 1;
    nav = h('div', {class: 'qnav'},
      h('button', {class: 'btn big quiet', type: 'button', disabled: s.idx === 0 || null, onclick: () => { s.idx--; renderQuestion(); }}, '이전'),
      last ? h('button', {class: 'btn big', type: 'button', onclick: () => { s.confirmSubmit = true; renderQuestion(); }}, '제출하기')
        : h('button', {class: 'btn big', type: 'button', onclick: () => { s.idx++; renderQuestion(); }}, '다음'));
  }
  const submitBox = s.mode === 'mock' && s.confirmSubmit ? (() => {
    const left = s.list.filter((e, i) => s.answers[i] === undefined).length;
    return h('div', {class: 'confirm'},
      h('b', {text: left ? `아직 안 푼 문제가 ${left}개 있어요. 그래도 제출할까요?` : '모두 풀었어요. 제출할까요?'}),
      h('div', {class: 'row-end'},
        h('button', {class: 'btn quiet', type: 'button', onclick: () => { s.confirmSubmit = false; renderQuestion(); }}, '더 볼게요'),
        h('button', {class: 'btn', type: 'button', onclick: submitMock}, '제출')));
  })() : null;
  mount('quiz', h('main', {class: 'gutter'}, h('div', {class: 'quiz'}, top, card, feedback, submitBox, nav)));
  if (s.mode === 'mock') { tickTimer(); Q.timer = setInterval(tickTimer, 1000); }
  const focusEl = answered ? $('#next') : null;
  if (focusEl) {
    focusEl.focus({preventScroll: true});
    const fb = $('.feedback');
    if (fb) requestAnimationFrame(() => fb.scrollIntoView({behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest'}));
  }
}
function tickTimer() {
  const el = $('#timer'); if (!el || !Q.session) return;
  const sec = Math.floor((Date.now() - Q.session.started) / 1000);
  el.textContent = `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초`;
}
function choose(q, origIndex) {
  const s = Q.session; if (!s) return;
  const i = s.idx;
  if (s.mode === 'mock') {
    if (s.answers[i] === origIndex) delete s.answers[i]; else s.answers[i] = origIndex;
    s.confirmSubmit = false;
    renderQuestion(); return;
  }
  if (s.answers[i] !== undefined) return;
  const ok = origIndex + 1 === q.answer;
  s.answers[i] = origIndex; s.results[i] = ok;
  record(q.id, ok);
  if (ok) {
    s.combo++; s.best = Math.max(s.best, s.combo);
    if (s.combo === 3 || s.combo === 5 || s.combo % 10 === 0) celebrate(s.combo >= 5 ? 90 : 50);
    try { navigator.vibrate && navigator.vibrate(20); } catch (e) {}
  } else {
    s.combo = 0;
    try { navigator.vibrate && navigator.vibrate([40, 40, 40]); } catch (e) {}
    // 틀린 문제는 세 문제 뒤에 한 번 더 나온다(이번 판에서 한 번만)
    if (!s.list.some(e => e.id === q.id && e.again)) s.list.splice(Math.min(i + 4, s.list.length), 0, {id: q.id, again: true});
  }
  renderQuestion();
}
function nextQuestion() {
  const s = Q.session;
  if (s.idx + 1 >= s.list.length) { s.done = true; s.finished = Date.now(); renderResults(); return; }
  s.idx++;
  renderQuestion();
  window.scrollTo(0, 0);
}
function submitMock() {
  const s = Q.session;
  s.list.forEach((e, i) => {
    const q = D.qById.get(e.id);
    const a = s.answers[i];
    const ok = a !== undefined && a + 1 === q.answer;
    s.results[i] = ok;
    record(e.id, ok);
  });
  s.done = true; s.finished = Date.now();
  renderResults();
}
function renderResults() {
  stopTimer();
  const s = Q.session;
  // 문제마다 처음 나온 자리의 결과로 센다(다시 나온 문제는 연습용)
  const firstIdx = {};
  s.list.forEach((e, i) => { if (firstIdx[e.id] === undefined && !e.again) firstIdx[e.id] = i; });
  const uniq = Object.keys(firstIdx).filter(id => s.mode === 'mock' || s.answers[firstIdx[id]] !== undefined);
  const firstTry = {};
  for (const id of uniq) firstTry[id] = !!s.results[firstIdx[id]];
  const right = uniq.filter(id => firstTry[id]).length;
  const wrongIds = uniq.filter(id => !firstTry[id]);
  const score = s.mode === 'mock' ? (uniq.length ? Math.round(right / uniq.length * 100) : 0) : null;
  const sec = Math.floor(((s.finished || Date.now()) - s.started) / 1000);
  const byUnit = {};
  for (const id of uniq) { const u = D.qById.get(id).unit; byUnit[u] = byUnit[u] || [0, 0]; byUnit[u][1]++; if (firstTry[id]) byUnit[u][0]++; }
  if ((score !== null && score >= 80) || (score === null && right === uniq.length && uniq.length >= 5)) setTimeout(() => celebrate(120), 150);
  const body = h('div', {class: 'quiz'},
    h('section', {class: 'qcard'},
      h('div', {class: 'score'},
        h('b', {text: score !== null ? score + '점' : `${right}/${uniq.length}`}),
        h('span', {text: (s.mode === 'mock' ? `모의고사 ${uniq.length}문항 · ${right}개 맞힘` : `${s.title} · 처음에 맞힌 문제`) + ` · ${Math.floor(sec / 60)}분 ${sec % 60}초`}),
        s.best >= 3 ? h('span', {class: 'combo', text: `최고 ${s.best}연속 정답`}) : null),
      h('div', {class: 'accbars'}, Object.entries(byUnit).sort((a, b) => D.units.indexOf(a[0]) - D.units.indexOf(b[0])).map(([u, [r, n]]) =>
        h('div', {class: 'accrow'}, h('span', {class: 'nm', text: `${unitRoman(u)}. ${unitTitle(u)}`}),
          h('span', {class: 'track'}, h('i', {style: {width: pct(r, n) + '%'}})), h('span', {class: 'v', text: `${r}/${n}`}))))),
    wrongIds.length ? h('section', {class: 'panel'},
      h('h2', {text: `틀린 문제 ${wrongIds.length}개`}),
      h('p', {class: 'note-quiet', text: '근거 항목에는 공부 앱에서 약점 표시가 붙어요.'}),
      h('div', {class: 'wronglist'}, wrongIds.map(id => {
        const q = D.qById.get(id); const a = s.answers[firstIdx[id]];
        return h('article', {class: 'wrongitem'},
          h('p', {style: {fontWeight: 600}, text: q.stem.split('\n')[0]}),
          h('p', {class: 'ans'}, a !== undefined ? h('span', {class: 'bad', text: '내 답: ' + q.choices[a]}) : h('span', {class: 'bad', text: '안 풀었음'}), h('br'), h('span', {class: 'good', text: '정답: ' + q.choices[q.answer - 1]})),
          h('p', {class: 'note-quiet', text: q.explanation + ' (' + (q.source || '') + ')'}),
          (q.evidence || []).length ? h('div', null, h('button', {class: 'link', type: 'button', onclick: () => { Q.session = null; jumpTo(q.evidence[0]); }}, '공부 앱에서 근거 보기')) : null);
      }))) : null,
    h('div', {class: 'startgrid'},
      wrongIds.length ? h('button', {class: 'btn big full', type: 'button', onclick: () => startSession({mode: 'practice', qids: shuffle(wrongIds.slice()), title: '틀린 문제 다시'})}, '틀린 문제만 다시 풀기') : null,
      h('button', {class: 'btn big quiet full', type: 'button', onclick: () => { Q.session = null; renderQuiz(); window.scrollTo(0, 0); }}, '문제 풀기 처음으로')));
  mount('quiz', h('main', {class: 'gutter'}, body));
  window.scrollTo(0, 0);
}

/* ---------- 설정 ---------- */
function openSettings() {
  const dlg = h('dialog', {class: 'sheet', 'aria-labelledby': 'setTitle'});
  const seg = (label, key, opts, onPick) => h('div', {class: 'field'}, h('span', {text: label}),
    h('div', {class: 'seg', role: 'group', 'aria-label': label}, opts.map(([v, t]) => h('button', {type: 'button', 'aria-pressed': String((key() || '') === v), onclick: () => { onPick(v); draw(); }}, t))));
  let confirmWipe = false;
  const date = h('input', {id: 'examDate', type: 'date', value: S.meta.examDate || DEFAULT_EXAM});
  date.addEventListener('change', () => { if (date.value) { setMeta({examDate: date.value}); toast('시험 날짜를 바꿨어요'); scheduleRefresh(); } });
  function draw() {
    const inner = h('div', {class: 'in'},
      h('h2', {id: 'setTitle', text: '설정'}),
      seg('글자 크기', () => ui.size, [['m', '보통'], ['l', '크게'], ['xl', '아주 크게']], v => { ui.size = v; saveUi(); applyLook(); }),
      seg('화면', () => ui.theme, [['', '기기 설정 따라가기'], ['light', '밝게'], ['dark', '어둡게']], v => { ui.theme = v; saveUi(); applyLook(); }),
      h('div', {class: 'field'}, h('span', {text: '문제 범위'}),
        h('button', {class: 'toggle', type: 'button', 'aria-pressed': String(!!S.meta.includeBlue), onclick: () => { setMeta({includeBlue: !S.meta.includeBlue}); draw(); scheduleRefresh(); }},
          h('span', {class: 'sw', 'aria-hidden': 'true', style: {background: S.meta.includeBlue ? 'var(--blue)' : null}}), '파랑 항목 문제도 내기')),
      h('label', {class: 'field'}, h('span', {text: '시험 날짜'}), date),
      h('div', {class: 'field'}, h('span', {text: IN_ARTIFACT ? '기록 연동' : '기록 저장'}),
        h('p', {class: 'note-quiet', style: {margin: 0}, text: !IN_ARTIFACT ? '푼 문제와 약점 기록은 이 기기의 브라우저에 저장돼요. 폰과 태블릿은 기록이 따로 쌓여요. 브라우저의 사이트 데이터를 지우면 기록도 지워져요.'
          : Remote.state === 'ok' ? '폰과 태블릿이 claude.ai 계정으로 기록을 맞추고 있어요.' : Remote.state === 'local' ? '지금은 이 기기에만 저장돼요. claude.ai에 로그인한 상태로 이 링크를 열면 기기끼리 맞춰져요.' : '연동이 잠시 안 되고 있어요. 이 기기에는 계속 저장돼요.'}),
        Remote.col ? h('div', {class: 'row-end', style: {justifyContent: 'flex-start'}}, h('button', {class: 'btn quiet', type: 'button', onclick: async () => {
          S.q = {}; S.w = {}; saveLocal();
          const ok = await Remote.refetch(); toast(ok ? '연동된 기록을 다시 받았어요' : '기록을 받지 못했어요'); scheduleRefresh(); draw();
        }}, '이 기기 기록을 연동된 기록으로 다시 받기')) : null),
      h('div', {class: 'field'}, h('span', {text: '기록 지우기'}),
        confirmWipe ? h('div', {class: 'confirm'},
          h('b', {text: '푼 문제 기록과 약점 표시를 모두 지울까요? 되돌릴 수 없어요.'}),
          h('div', {class: 'row-end'},
            h('button', {class: 'btn quiet', type: 'button', onclick: () => { confirmWipe = false; draw(); }}, '그대로 두기'),
            h('button', {class: 'btn', type: 'button', style: {background: 'var(--bad)'}, onclick: async () => {
              S.q = {}; S.w = {}; saveLocal(); await Remote.wipe(); confirmWipe = false; toast('기록을 모두 지웠어요'); scheduleRefresh(); draw();
            }}, '모두 지우기')))
          : h('button', {class: 'link danger', type: 'button', onclick: () => { confirmWipe = true; draw(); }}, '푼 문제 기록 모두 지우기…')),
      h('div', {class: 'row-end'}, h('button', {class: 'btn', type: 'button', onclick: () => dlg.close()}, '닫기')));
    dlg.textContent = ''; dlg.append(inner);
  }
  draw();
  dlg.addEventListener('close', () => { dlg.remove(); if (current === 'study') renderStudy(); else if (current === 'home') renderHome(); else if (!Q.session) renderQuiz(); });
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

/* ---------- 축하 효과 ---------- */
function celebrate(n) {
  if (reduceMotion()) return;
  const cv = $('#fx'); if (!cv || !cv.getContext) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
  const ctx = cv.getContext('2d');
  const cs = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--red', '--ok', '--star', '--blue'].map(v => cs.getPropertyValue(v).trim() || '#0066cc');
  const parts = Array.from({length: n}, () => ({x: W / 2 + (Math.random() - .5) * W * .3, y: H * .62, vx: (Math.random() - .5) * 14 * dpr, vy: -(8 + Math.random() * 12) * dpr,
    w: (5 + Math.random() * 6) * dpr, h: (8 + Math.random() * 8) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[Math.floor(Math.random() * colors.length)]}));
  const t0 = performance.now();
  (function frame(t) {
    const dt = t - t0;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += .45 * dpr; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= .99;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - dt / 1600);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (dt < 1600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(t0);
}

/* ---------- 키보드 ---------- */
document.addEventListener('keydown', e => {
  if (current !== 'quiz' || !Q.session || Q.session.done) return;
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const s = Q.session, q = D.qById.get(s.list[s.idx].id);
  if (/^[1-5]$/.test(e.key)) { const perm = permOf(s, s.idx, q); choose(q, perm[+e.key - 1]); e.preventDefault(); }
  else if (e.key === 'Enter' && s.mode === 'practice' && s.answers[s.idx] !== undefined && document.activeElement && document.activeElement.id !== 'next') { nextQuestion(); e.preventDefault(); }
  else if (s.mode === 'mock' && e.key === 'ArrowRight' && s.idx < s.list.length - 1) { s.idx++; renderQuestion(); }
  else if (s.mode === 'mock' && e.key === 'ArrowLeft' && s.idx > 0) { s.idx--; renderQuestion(); }
});

/* ---------- 시작 ---------- */
(async function boot() {
  loadLocal(); applyLook();
  try { await loadData(); }
  catch (e) {
    console.error(e);
    $('#app').textContent = '';
    $('#app').append(h('div', {class: 'loading'}, h('b', {text: '공부 자료를 불러오지 못했어요.'}), h('p', {text: '잠시 뒤 새로 고침해 주세요.'})));
    return;
  }
  window.addEventListener('hashchange', route);
  if (!location.hash && ui.mode) location.hash = ui.mode; else route();
  Remote.start();
})();
})();
