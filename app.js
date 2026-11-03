'use strict';

// ===== 상수 =====
const CATEGORIES = [
  { name: '안전', icon: '🦺' },
  { name: '보건', icon: '🩺' },
  { name: '환경', icon: '🌿' },
  { name: '소방', icon: '🔥' },
  { name: '위험물', icon: '⚠️' },
  { name: '시험실화학물질', icon: '🧪' },
];
const ALL_CATEGORY = '전체';
const ALL_ICON = '🏆';
const SCREENS = ['start', 'category', 'quiz', 'result', 'ranking'];
const POINTS_PER_QUESTION = 10;
const TIME_LIMIT_SEC = 20;
const NAME_MAX = 10;
const RANKING_KEY = 'goldenbell_rankings';
const RANKING_LIMIT = 10;   // 순위표에 보여줄 인원
const RANKING_KEEP = 100;   // 카테고리별로 보관할 최대 기록 수
const OPTION_MARKS = ['①', '②', '③', '④', '⑤'];

// ===== 게임 상태 =====
const state = {
  playerName: '',
  category: null,     // 선택한 카테고리 이름 또는 ALL_CATEGORY
  questions: [],      // 이번 게임에 출제할 문제 목록 (섞인 순서)
  currentIndex: 0,    // 현재 문제 번호(0부터)
  score: 0,
  answers: [],        // { question, selected(null=시간 초과), correct }
  startTime: null,    // 게임 시작 시각(ms)
  locked: false,      // 현재 문제의 답이 확정되었는지
  timerId: null,
  deadline: 0,
  lastRecord: null,   // 방금 끝낸 게임의 기록 (순위 강조 표시용)
};

let allQuestions = [];
let currentScreen = 'start';

const $ = (id) => document.getElementById(id);

// ===== 유틸 =====
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'className') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  });
  [].concat(children).forEach((child) => {
    if (child == null) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

// Fisher-Yates 셔플 (원본은 바꾸지 않음)
function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function categoryIcon(name) {
  if (name === ALL_CATEGORY) return ALL_ICON;
  const found = CATEGORIES.find((c) => c.name === name);
  return found ? found.icon : '';
}

function getGrade(rate) {
  if (rate === 100) return '🔔 골든벨 달성!';
  if (rate >= 80) return '안전 전문가';
  if (rate >= 60) return '안전 실천가';
  return '조금 더 공부해요';
}

// ===== 문제 데이터 불러오기 =====
// file:// 에서는 fetch가 막히므로 questions.js가 넣어준 window.QUESTIONS를 우선 사용합니다.
async function loadQuestions() {
  if (Array.isArray(window.QUESTIONS)) return window.QUESTIONS;
  const res = await fetch('questions.json');
  if (!res.ok) throw new Error(`questions.json 불러오기 실패 (${res.status})`);
  return res.json();
}

// ===== 화면 전환 =====
function showScreen(name) {
  currentScreen = name;
  if (name !== 'result') $('confetti').textContent = ''; // 결과 화면을 벗어나면 색종이 정리
  SCREENS.forEach((s) => {
    $(`screen-${s}`).hidden = s !== name;
  });
  window.scrollTo(0, 0);
}

// ===== FR-01 시작 화면 =====
function validateName() {
  const name = $('player-name').value.trim();
  const valid = name.length >= 1 && name.length <= NAME_MAX;
  $('btn-start').disabled = !valid;
  $('name-hint').textContent = valid
    ? `${name}님, 준비되셨나요?`
    : name.length > NAME_MAX
      ? `이름은 ${NAME_MAX}자 이하로 입력해 주세요.`
      : '이름을 입력하면 시작할 수 있습니다.';
  return valid ? name : null;
}

function handleStart() {
  const name = validateName();
  if (!name) {
    $('player-name').focus();
    return;
  }
  state.playerName = name;
  showScreen('category');
}

// ===== FR-02 카테고리 선택 =====
function renderCategoryList() {
  const list = $('category-list');
  list.textContent = '';
  CATEGORIES.forEach(({ name, icon }) => {
    const count = allQuestions.filter((q) => q.category === name).length;
    list.appendChild(
      el('button', { type: 'button', className: 'category-card', dataset: { category: name } }, [
        el('span', { className: 'category-icon', 'aria-hidden': 'true' }, icon),
        el('span', { className: 'category-name' }, name),
        el('span', { className: 'category-count' }, `${count}문제`),
      ])
    );
  });
}

// ===== FR-03 문제 풀이 =====
function startGame(category) {
  const pool = category === ALL_CATEGORY
    ? allQuestions
    : allQuestions.filter((q) => q.category === category);
  if (pool.length === 0) return;

  clearTimer();
  Object.assign(state, {
    category,
    questions: shuffle(pool),
    currentIndex: 0,
    score: 0,
    answers: [],
    startTime: Date.now(),
    locked: false,
    lastRecord: null,
  });
  showScreen('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.currentIndex];
  state.locked = false;

  $('screen-quiz').dataset.category = state.category; // 카테고리 색상 적용
  $('quiz-category').textContent = `${categoryIcon(state.category)} ${state.category}`;
  $('quiz-progress').textContent = `${state.currentIndex + 1} / ${state.questions.length}`;
  $('quiz-progress-bar').style.width = `${((state.currentIndex + 1) / state.questions.length) * 100}%`;
  $('quiz-score').textContent = `${state.score}점`;
  $('quiz-question').textContent = q.question;

  const options = $('quiz-options');
  options.textContent = '';
  q.options.forEach((text, i) => {
    const btn = el('button', { type: 'button', className: 'option', dataset: { index: i } }, [
      el('span', { className: 'option-mark' }, OPTION_MARKS[i]),
      el('span', { className: 'option-text' }, text),
      el('span', { className: 'option-result', 'aria-hidden': 'true' }),
    ]);
    options.appendChild(el('li', {}, btn));
  });

  $('quiz-feedback').hidden = true;
  $('quiz-feedback').textContent = '';
  $('btn-next').hidden = true;

  // 다음 문제로 넘어오면 화면 맨 위로 올리고, 포커스를 문제로 옮깁니다.
  // ([다음 문제] 버튼이 숨겨지면서 포커스가 사라지는 것을 막고, 화면 낭독기가 새 문제를 읽게 합니다.)
  window.scrollTo(0, 0);
  $('quiz-question').focus({ preventScroll: true });

  startTimer();
}

// ----- 타이머 -----
function startTimer() {
  clearTimer();
  state.deadline = Date.now() + TIME_LIMIT_SEC * 1000;
  updateTimer();
  state.timerId = setInterval(updateTimer, 200);
}

function clearTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateTimer() {
  const remainingMs = Math.max(0, state.deadline - Date.now());
  const remaining = Math.ceil(remainingMs / 1000);
  const warning = remaining <= 5;
  const timer = $('quiz-timer');
  timer.textContent = `⏱ ${remaining}초`;
  timer.classList.toggle('warning', warning);
  const bar = $('quiz-timer-bar');
  bar.style.width = `${(remainingMs / (TIME_LIMIT_SEC * 1000)) * 100}%`;
  bar.classList.toggle('warning', warning);
  if (remaining === 0) submitAnswer(null);
}

// ===== FR-04 즉시 피드백 =====
// selected: 0~4, 시간 초과는 null
function submitAnswer(selected) {
  if (state.locked || currentScreen !== 'quiz') return;
  state.locked = true;
  clearTimer();
  // 답이 확정되면 타이머 경고(빨간 깜빡임)를 끕니다.
  $('quiz-timer').classList.remove('warning');
  $('quiz-timer-bar').classList.remove('warning');

  const q = state.questions[state.currentIndex];
  const correct = selected === q.answer;
  if (correct) state.score += POINTS_PER_QUESTION;
  state.answers.push({ question: q, selected, correct });

  // 보기 표시: 정답은 초록+✔, 선택한 오답은 빨강+✖
  $('quiz-options').querySelectorAll('.option').forEach((btn) => {
    const i = Number(btn.dataset.index);
    btn.disabled = true;
    const mark = btn.querySelector('.option-result');
    if (i === q.answer) {
      btn.classList.add('correct');
      mark.textContent = '✔';
    } else if (i === selected) {
      btn.classList.add('wrong');
      mark.textContent = '✖';
    }
    if (i === selected) btn.classList.add('selected');
  });

  const title = correct ? '✔ 정답입니다!' : selected === null ? '⏰ 시간 초과! 오답입니다' : '✖ 오답입니다';
  const feedback = $('quiz-feedback');
  feedback.textContent = '';
  feedback.className = `feedback ${correct ? 'is-correct' : 'is-wrong'}`;
  feedback.appendChild(el('p', { className: 'feedback-title' }, title));
  if (!correct) {
    feedback.appendChild(el('p', { className: 'feedback-answer' },
      `정답: ${OPTION_MARKS[q.answer]} ${q.options[q.answer]}`));
  }
  feedback.appendChild(el('p', { className: 'feedback-explanation' }, q.explanation));
  feedback.hidden = false;

  $('quiz-score').textContent = `${state.score}점`;

  const isLast = state.currentIndex === state.questions.length - 1;
  const next = $('btn-next');
  next.textContent = isLast ? '결과 보기' : '다음 문제';
  next.hidden = false;
  next.focus();
}

function goNext() {
  if (!state.locked || currentScreen !== 'quiz') return;
  if (state.currentIndex >= state.questions.length - 1) {
    finishGame();
  } else {
    state.currentIndex++;
    renderQuestion();
  }
}

// 게임 도중 그만두기: 기록은 저장하지 않고 카테고리 화면으로 돌아갑니다.
function handleQuit() {
  if (currentScreen !== 'quiz') return;
  if (!window.confirm('게임을 그만둘까요? 이번 게임 기록은 저장되지 않습니다.')) return;
  clearTimer();
  state.locked = true;
  showScreen('category');
}

// ===== FR-05 결과 =====
function finishGame() {
  clearTimer();
  const total = state.questions.length;
  const correctCount = state.answers.filter((a) => a.correct).length;
  const rate = Math.round((correctCount / total) * 100);
  const timeSec = Math.max(1, Math.round((Date.now() - state.startTime) / 1000));

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: state.playerName,
    category: state.category,
    score: state.score,
    correct: correctCount,
    total,
    timeSec,
    date: new Date().toISOString(),
  };
  saveRecord(record);
  state.lastRecord = record;

  renderResult({ total, correctCount, rate, timeSec });
  showScreen('result');
}

function renderResult({ total, correctCount, rate, timeSec }) {
  const summary = $('result-summary');
  summary.textContent = '';
  summary.classList.toggle('is-golden', rate === 100);
  const stat = (label, value) => el('div', {}, [el('dt', {}, label), el('dd', {}, value)]);
  summary.append(
    el('p', { className: 'result-player' }, `${state.playerName}님 · ${categoryIcon(state.category)} ${state.category}`),
    el('p', { className: 'result-score' }, `${state.score}점`),
    el('p', { className: 'result-grade' }, getGrade(rate)),
    el('dl', { className: 'result-stats' }, [
      stat('정답', `${correctCount} / ${total}`),
      stat('정답률', `${rate}%`),
      stat('소요 시간', formatTime(timeSec)),
    ])
  );
  if (rate === 100) launchConfetti();

  const wrongBox = $('result-wrong');
  wrongBox.textContent = '';
  const wrongs = state.answers.filter((a) => !a.correct);
  if (wrongs.length === 0) {
    wrongBox.appendChild(el('p', { className: 'no-wrong' }, '틀린 문제가 없습니다. 완벽해요!'));
    return;
  }
  const details = el('details', { className: 'wrong-list' }, [
    el('summary', {}, `틀린 문제 다시 보기 (${wrongs.length}개)`),
  ]);
  wrongs.forEach(({ question: q, selected }) => {
    const myAnswer = selected === null ? '시간 초과' : `${OPTION_MARKS[selected]} ${q.options[selected]}`;
    details.appendChild(
      el('article', { className: 'wrong-item' }, [
        el('p', { className: 'wrong-question' }, q.question),
        el('p', { className: 'wrong-mine' }, `✖ 내 답: ${myAnswer}`),
        el('p', { className: 'wrong-correct' }, `✔ 정답: ${OPTION_MARKS[q.answer]} ${q.options[q.answer]}`),
        el('p', { className: 'wrong-explanation' }, q.explanation),
      ])
    );
  });
  wrongBox.appendChild(details);
}

// 골든벨 달성 축하 색종이 (순수 DOM + CSS 애니메이션)
function launchConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = $('confetti');
  box.textContent = '';
  const colors = ['#ffcc33', '#f5b700', '#ff8a00', '#22c55e', '#14b8a6', '#a78bfa', '#ef4444', '#ffffff'];
  for (let i = 0; i < 90; i++) {
    const piece = el('span', { className: 'confetti-piece' });
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 200}px`);
    piece.style.setProperty('--spin', `${360 + Math.random() * 720}deg`);
    piece.addEventListener('animationend', () => piece.remove());
    box.appendChild(piece);
  }
}

// ===== FR-06 순위 기록 =====
function isValidRecord(r) {
  return r && typeof r === 'object'
    && typeof r.name === 'string'
    && typeof r.category === 'string'
    && Number.isFinite(r.score)
    && Number.isFinite(r.timeSec)
    && typeof r.date === 'string';
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RANKING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidRecord) : [];
  } catch (err) {
    console.warn('순위 기록을 읽지 못했습니다.', err);
    return [];
  }
}

// 기록이 끝없이 쌓이지 않도록 카테고리별 상위 RANKING_KEEP개만 보관합니다.
function pruneRecords(records) {
  const byCategory = new Map();
  records.forEach((r) => {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  });
  return [...byCategory.values()].flatMap((list) => list.sort(compareRecords).slice(0, RANKING_KEEP));
}

function saveRecord(record) {
  try {
    const records = loadRecords();
    records.push(record);
    localStorage.setItem(RANKING_KEY, JSON.stringify(pruneRecords(records)));
  } catch (err) {
    console.warn('순위 기록을 저장하지 못했습니다.', err);
  }
}

function clearRecords() {
  try {
    localStorage.removeItem(RANKING_KEY);
  } catch (err) {
    console.warn('순위 기록을 초기화하지 못했습니다.', err);
  }
}

// 점수 내림차순 → 소요 시간 오름차순 → 기록 일시 오름차순
function compareRecords(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

// 카테고리의 전체 순위(정렬됨). 방금 기록이 저장되지 못했어도(저장소 차단·보관 한도 초과) 순위에 포함합니다.
function getRanking(category) {
  const list = loadRecords().filter((r) => r.category === category);
  const mine = state.lastRecord;
  if (mine && mine.category === category && !list.some((r) => r.id === mine.id)) list.push(mine);
  return list.sort(compareRecords);
}

function isMyRecord(r) {
  return Boolean(state.lastRecord && r.id && r.id === state.lastRecord.id);
}

let rankingCategory = CATEGORIES[0].name;

function showRanking(category) {
  rankingCategory = category || CATEGORIES[0].name;
  renderRanking();
  showScreen('ranking');
}

function renderRanking() {
  const tabs = $('ranking-tabs');
  tabs.textContent = '';
  tabs.setAttribute('role', 'tablist');
  [...CATEGORIES.map((c) => c.name), ALL_CATEGORY].forEach((name) => {
    const active = name === rankingCategory;
    tabs.appendChild(el('button', {
      type: 'button',
      className: `tab${active ? ' active' : ''}`,
      role: 'tab',
      'aria-selected': String(active),
      dataset: { category: name },
    }, `${categoryIcon(name)} ${name}`));
  });

  const box = $('ranking-table');
  box.textContent = '';
  const ranking = getRanking(rankingCategory);
  if (ranking.length === 0) {
    box.appendChild(el('p', { className: 'empty' }, '아직 기록이 없습니다.'));
    return;
  }

  const MEDALS = ['🥇', '🥈', '🥉'];
  const makeRow = (r, i) => {
    const isMine = isMyRecord(r);
    const classes = [i < 3 ? `rank-${i + 1}` : '', isMine ? 'highlight' : ''].filter(Boolean).join(' ');
    const rankCell = i < 3
      ? el('span', { className: 'medal', role: 'img', 'aria-label': `${i + 1}위` }, MEDALS[i])
      : String(i + 1);
    return el('tr', { className: classes }, [
      el('td', {}, rankCell),
      el('td', {}, [r.name, isMine ? el('span', { className: 'badge-new' }, '방금 기록') : null]),
      el('td', {}, `${r.score}점`),
      el('td', {}, formatTime(r.timeSec)),
      el('td', {}, formatDate(r.date)),
    ]);
  };

  const tbody = el('tbody');
  ranking.slice(0, RANKING_LIMIT).forEach((r, i) => tbody.appendChild(makeRow(r, i)));

  // 방금 기록이 상위 10위 밖이면 구분선 아래에 내 순위를 따로 보여줍니다.
  const myIndex = ranking.findIndex(isMyRecord);
  if (myIndex >= RANKING_LIMIT) {
    tbody.appendChild(el('tr', { className: 'rank-gap' }, el('td', { colSpan: 5 }, '⋯')));
    tbody.appendChild(makeRow(ranking[myIndex], myIndex));
  }
  box.appendChild(el('table', { className: 'ranking' }, [
    el('thead', {}, el('tr', {}, ['순위', '이름', '점수', '소요 시간', '일시'].map((h) => el('th', { scope: 'col' }, h)))),
    tbody,
  ]));
}

function handleRankingReset() {
  if (!window.confirm('모든 카테고리의 순위 기록이 삭제됩니다. 초기화할까요?')) return;
  clearRecords();
  state.lastRecord = null;
  renderRanking();
}

// ===== 키보드 =====
function handleKeydown(e) {
  if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;

  if (currentScreen === 'start' && e.key === 'Enter' && e.target.id === 'player-name') {
    e.preventDefault();
    handleStart();
    return;
  }

  if (currentScreen !== 'quiz') return;
  if (/^[1-5]$/.test(e.key) && !state.locked) {
    e.preventDefault();
    submitAnswer(Number(e.key) - 1);
  } else if (e.key === 'Enter' && state.locked) {
    // 버튼에 포커스가 있으면 브라우저 기본 클릭 동작에 맡겨 두 번 넘어가지 않게 합니다.
    if (e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    goNext();
  }
}

// ===== 이벤트 연결 =====
function bindEvents() {
  $('player-name').addEventListener('input', validateName);
  $('btn-start').addEventListener('click', handleStart);
  $('btn-ranking-from-start').addEventListener('click', () => showRanking());

  $('category-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-category]');
    if (card) startGame(card.dataset.category);
  });
  $('btn-all').addEventListener('click', () => startGame(ALL_CATEGORY));

  $('quiz-options').addEventListener('click', (e) => {
    const btn = e.target.closest('.option');
    if (btn && !btn.disabled) submitAnswer(Number(btn.dataset.index));
  });
  $('btn-next').addEventListener('click', goNext);
  $('btn-quit').addEventListener('click', handleQuit);
  $('btn-category-home').addEventListener('click', () => {
    showScreen('start');
    validateName();
  });

  $('btn-retry').addEventListener('click', () => startGame(state.category));
  $('btn-other-category').addEventListener('click', () => showScreen('category'));
  $('btn-ranking-from-result').addEventListener('click', () => showRanking(state.category));

  $('ranking-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-category]');
    if (!tab) return;
    rankingCategory = tab.dataset.category;
    renderRanking();
  });
  $('btn-ranking-reset').addEventListener('click', handleRankingReset);
  $('btn-home').addEventListener('click', () => {
    showScreen('start');
    validateName();
  });

  document.addEventListener('keydown', handleKeydown);
}

// ===== 초기화 =====
async function init() {
  try {
    allQuestions = await loadQuestions();
  } catch (err) {
    console.error(err);
    $('app').textContent = '문제를 불러오지 못했습니다. 파일을 확인해 주세요.';
    return;
  }
  renderCategoryList();
  bindEvents();
  validateName();
  showScreen('start');
}

init();
