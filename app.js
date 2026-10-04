/* ════════════════════════════════════════
   StudyBuddy — app.js
   Pomodoro · Flashcards · Quiz
════════════════════════════════════════ */

'use strict';

// ── Persist helpers ──────────────────────
const save = (k, v) => localStorage.setItem('sb_' + k, JSON.stringify(v));
const load = (k, def) => { try { const r = localStorage.getItem('sb_' + k); return r ? JSON.parse(r) : def; } catch { return def; } };

// ═══════════════════════════════════════
//  TAB NAVIGATION
// ═══════════════════════════════════════
function showTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
  document.getElementById('tab-' + name).classList.add('active');
  const nb = document.getElementById('nav-' + name);
  nb.classList.add('active');
  nb.setAttribute('aria-current', 'page');
}

// ═══════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════
let toastTimer = null;
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ═══════════════════════════════════════
//  POMODORO
// ═══════════════════════════════════════
const CIRCUMFERENCE = 2 * Math.PI * 98; // 615.75

let pomo = {
  mode: 'focus',        // 'focus' | 'short' | 'long'
  running: false,
  intervalId: null,
  timeLeft: 0,
  totalTime: 0,
  sessionsCompleted: load('pomo_sessions', 0),
  sessionCount: 0,      // sessions in current cycle
};

const pomoDurations = () => ({
  focus: parseInt(document.getElementById('set-focus').value)  * 60,
  short: parseInt(document.getElementById('set-short').value)  * 60,
  long:  parseInt(document.getElementById('set-long').value)   * 60,
});

function initTimer() {
  const d = pomoDurations();
  pomo.totalTime  = d[pomo.mode];
  pomo.timeLeft   = pomo.totalTime;
  renderTimer();
  updateRing(1);
}

function setMode(mode) {
  if (pomo.running) return;
  pomo.mode = mode;
  ['focus','short','long'].forEach(m => {
    document.getElementById('pill-' + m).classList.toggle('active', m === mode);
    document.getElementById('pill-' + m).setAttribute('aria-pressed', m === mode);
  });
  const labels = { focus: 'Focus Time', short: 'Short Break', long: 'Long Break' };
  document.getElementById('timer-mode-label').textContent = labels[mode];
  initTimer();
}

function renderTimer() {
  const m = Math.floor(pomo.timeLeft / 60).toString().padStart(2, '0');
  const s = (pomo.timeLeft % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
  document.title = pomo.running ? `${m}:${s} — StudyBuddy` : 'StudyBuddy';
}

function updateRing(fraction) {
  const offset = CIRCUMFERENCE * (1 - fraction);
  document.getElementById('ring-fill').style.strokeDashoffset = offset;
  // dynamic color based on mode
  const colors = { focus: '#7c5ce0', short: '#22d3ee', long: '#4ade80' };
  document.getElementById('ring-fill').style.stroke = colors[pomo.mode];
}

function toggleTimer() {
  if (pomo.running) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  pomo.running = true;
  document.getElementById('btn-start').textContent = '⏸ Pause';
  if (pomo.timeLeft === 0) initTimer();
  pomo.intervalId = setInterval(tick, 1000);
}

function pauseTimer() {
  pomo.running = false;
  clearInterval(pomo.intervalId);
  document.getElementById('btn-start').textContent = '▶ Resume';
}

function resetTimer() {
  pauseTimer();
  document.getElementById('btn-start').textContent = '▶ Start';
  initTimer();
}

function skipSession() {
  pauseTimer();
  document.getElementById('btn-start').textContent = '▶ Start';
  onSessionComplete(true);
}

function tick() {
  pomo.timeLeft--;
  renderTimer();
  updateRing(pomo.timeLeft / pomo.totalTime);
  if (pomo.timeLeft <= 0) {
    clearInterval(pomo.intervalId);
    pomo.running = false;
    onSessionComplete(false);
  }
}

function onSessionComplete(skipped) {
  if (pomo.mode === 'focus' && !skipped) {
    pomo.sessionsCompleted++;
    pomo.sessionCount++;
    save('pomo_sessions', pomo.sessionsCompleted);
    updateStats();
    playBeep(880, 0.3, 0.4);
    showToast('🎉 Focus session complete! Take a break.');
  }

  // Decide next mode
  const maxSessions = parseInt(document.getElementById('set-sessions').value);
  let nextMode;
  if (pomo.mode === 'focus') {
    nextMode = (pomo.sessionCount >= maxSessions) ? 'long' : 'short';
    if (pomo.sessionCount >= maxSessions) pomo.sessionCount = 0;
  } else {
    nextMode = 'focus';
    if (!skipped) playBeep(440, 0.3, 0.4);
    if (!skipped) showToast('⏱ Break over! Time to focus.');
  }

  updateDots();
  setMode(nextMode);

  const autoStart = document.getElementById('set-autostart').checked;
  if (autoStart && !skipped) {
    setTimeout(startTimer, 1200);
  }
}

function updateDots() {
  const max = parseInt(document.getElementById('set-sessions').value);
  const container = document.getElementById('session-dots');
  container.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const d = document.createElement('span');
    d.className = 'dot';
    if (i < pomo.sessionCount) d.classList.add('done');
    else if (i === pomo.sessionCount && pomo.mode === 'focus') d.classList.add('active');
    container.appendChild(d);
  }
}

function stepSetting(type, delta) {
  const ids = { focus: 'set-focus', short: 'set-short', long: 'set-long', sessions: 'set-sessions' };
  const el = document.getElementById(ids[type]);
  const newVal = Math.max(parseInt(el.min), Math.min(parseInt(el.max), parseInt(el.value) + delta));
  el.value = newVal;
  applySettings();
}

function applySettings() {
  if (!pomo.running) initTimer();
  updateDots();
}

// ── Beep Sound (Web Audio) ───────────────
let audioCtx = null;
function playBeep(freq = 800, vol = 0.3, dur = 0.3) {
  if (!document.getElementById('set-sound').checked) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch(e) {}
}

// ═══════════════════════════════════════
//  FLASHCARDS
// ═══════════════════════════════════════
let cards = load('fc_cards', []);
let cardIndex = 0;
let editingCardId = null;

function renderCardList() {
  const list = document.getElementById('card-list');
  const empty = document.getElementById('fc-empty');
  const counter = document.getElementById('fc-counter');

  list.querySelectorAll('.card-item').forEach(e => e.remove());
  counter.textContent = `${cards.length > 0 ? cardIndex + 1 : 0} / ${cards.length} cards`;
  empty.style.display = cards.length === 0 ? '' : 'none';

  cards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'card-item' + (i === cardIndex ? ' active' : '');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.innerHTML = `
      <span class="card-item-q">${escHtml(card.q)}</span>
      ${card.deck ? `<span class="card-item-deck">${escHtml(card.deck)}</span>` : ''}
      <button class="card-item-del" onclick="deleteCard(event,${i})" title="Delete">✕</button>
    `;
    el.addEventListener('click', () => { cardIndex = i; showCard(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { cardIndex = i; showCard(); } });
    list.appendChild(el);
  });

  updateStats();
}

function showCard() {
  const card = cards[cardIndex];
  const inner = document.getElementById('fc-inner');
  inner.classList.remove('flipped');

  setTimeout(() => {
    document.getElementById('fc-front-text').textContent = card ? card.q : 'Add cards to get started!';
    document.getElementById('fc-back-text').textContent  = card ? card.a : '';
    document.getElementById('fc-counter').textContent    = `${cards.length > 0 ? cardIndex + 1 : 0} / ${cards.length} cards`;
    document.getElementById('fc-rating').style.display   = 'none';
  }, 50);

  renderCardList();
}

function flipCard() {
  if (cards.length === 0) return;
  const inner = document.getElementById('fc-inner');
  inner.classList.toggle('flipped');
  const isFlipped = inner.classList.contains('flipped');
  document.getElementById('fc-rating').style.display = isFlipped ? '' : 'none';
}

function nextCard() {
  if (cards.length === 0) return;
  cardIndex = (cardIndex + 1) % cards.length;
  showCard();
}
function prevCard() {
  if (cards.length === 0) return;
  cardIndex = (cardIndex - 1 + cards.length) % cards.length;
  showCard();
}

function addCard() {
  const q = document.getElementById('fc-q-input').value.trim();
  const a = document.getElementById('fc-a-input').value.trim();
  const deck = document.getElementById('fc-deck-input').value.trim();

  if (!q || !a) { showToast('⚠️ Please fill in both question and answer.'); return; }

  if (editingCardId !== null) {
    cards[editingCardId] = { q, a, deck };
    editingCardId = null;
    document.getElementById('fc-add-btn').textContent = 'Add Card';
    showToast('✅ Card updated!');
  } else {
    cards.push({ q, a, deck });
    cardIndex = cards.length - 1;
    showToast('✅ Card added!');
  }

  save('fc_cards', cards);
  clearCardForm();
  showCard();
}

function clearCardForm() {
  document.getElementById('fc-q-input').value = '';
  document.getElementById('fc-a-input').value = '';
  document.getElementById('fc-deck-input').value = '';
  editingCardId = null;
  document.getElementById('fc-add-btn').textContent = 'Add Card';
}

function deleteCard(event, idx) {
  event.stopPropagation();
  cards.splice(idx, 1);
  cardIndex = Math.min(cardIndex, Math.max(0, cards.length - 1));
  save('fc_cards', cards);
  showCard();
  showToast('🗑️ Card deleted');
}

function clearAllCards() {
  if (cards.length === 0) return;
  if (!confirm('Delete all flashcards?')) return;
  cards = [];
  cardIndex = 0;
  save('fc_cards', cards);
  showCard();
}

function rateCard(rating) {
  const labels = ['Hard 😕', 'OK 🙂', 'Easy 😄'];
  showToast(`Marked as ${labels[rating]}`);
  // Simple spaced-repetition hint: auto-advance
  nextCard();
}

// ═══════════════════════════════════════
//  QUIZ
// ═══════════════════════════════════════
let questions = load('qz_questions', []);
let quiz = {
  active: [],
  current: 0,
  score: 0,
  answers: [],       // {correct: bool, question: str}
  timerLeft: 0,
  timerInterval: null,
  lastPct: 0,
};

function renderQuestionList() {
  const list = document.getElementById('question-list');
  const empty = document.getElementById('qz-empty');
  const count = document.getElementById('qz-count');

  list.querySelectorAll('.q-item').forEach(e => e.remove());
  count.textContent = questions.length;
  empty.style.display = questions.length === 0 ? '' : 'none';

  questions.forEach((q, i) => {
    const el = document.createElement('div');
    el.className = 'q-item';
    el.innerHTML = `
      <span class="q-item-num">${i + 1}</span>
      <span class="q-item-text">${escHtml(q.text)}</span>
      <button class="q-item-del" onclick="deleteQuestion(event,${i})" title="Delete">✕</button>
    `;
    list.appendChild(el);
  });
}

function addQuestion() {
  const text = document.getElementById('qz-question').value.trim();
  const opts = [...document.querySelectorAll('.qz-opt-input')].map(i => i.value.trim());
  const correctVal = document.querySelector('input[name="correct-ans"]:checked');
  const correct = correctVal ? parseInt(correctVal.value) : 0;

  if (!text) { showToast('⚠️ Please enter a question.'); return; }
  const validOpts = opts.filter(o => o);
  if (validOpts.length < 2) { showToast('⚠️ Add at least 2 options.'); return; }
  if (!opts[correct]) { showToast('⚠️ The correct answer option is empty.'); return; }

  questions.push({ text, options: opts, correct });
  save('qz_questions', questions);
  clearQuizForm();
  renderQuestionList();
  showToast('✅ Question added!');
}

function clearQuizForm() {
  document.getElementById('qz-question').value = '';
  document.querySelectorAll('.qz-opt-input').forEach(i => i.value = '');
  const r = document.querySelector('input[name="correct-ans"][value="0"]');
  if (r) r.checked = true;
}

function deleteQuestion(event, idx) {
  event.stopPropagation();
  questions.splice(idx, 1);
  save('qz_questions', questions);
  renderQuestionList();
}

function clearAllQuestions() {
  if (questions.length === 0) return;
  if (!confirm('Delete all questions?')) return;
  questions = [];
  save('qz_questions', questions);
  renderQuestionList();
}

function startQuiz() {
  if (questions.length === 0) { showToast('⚠️ Add at least one question first.'); return; }

  const shuffle = document.getElementById('qz-shuffle').checked;
  quiz.active = shuffle ? [...questions].sort(() => Math.random() - 0.5) : [...questions];
  quiz.current = 0;
  quiz.score = 0;
  quiz.answers = [];

  document.getElementById('quiz-setup').style.display = 'none';
  document.getElementById('quiz-results').style.display = 'none';
  document.getElementById('quiz-active').style.display = '';

  renderQuestion();
}

function renderQuestion() {
  const q = quiz.active[quiz.current];
  const total = quiz.active.length;
  const pct = (quiz.current / total) * 100;

  document.getElementById('quiz-progress-bar').style.width = pct + '%';
  document.getElementById('qz-progress-label').textContent = `Question ${quiz.current + 1} / ${total}`;
  document.getElementById('qz-score-live').textContent = `Score: ${quiz.score}`;
  document.getElementById('qz-q-text').textContent = q.text;
  document.getElementById('qz-next-btn').style.display = 'none';

  const answersEl = document.getElementById('qz-answers');
  answersEl.innerHTML = '';
  const labels = ['A', 'B', 'C', 'D'];
  q.options.forEach((opt, i) => {
    if (!opt) return;
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.setAttribute('id', `ans-btn-${i}`);
    btn.innerHTML = `<span class="opt-badge">${labels[i]}</span> ${escHtml(opt)}`;
    btn.addEventListener('click', () => selectAnswer(i));
    answersEl.appendChild(btn);
  });

  // Question timer
  clearInterval(quiz.timerInterval);
  const timeLimit = parseInt(document.getElementById('qz-time').value) || 30;
  quiz.timerLeft = timeLimit;
  updateTimerBadge();

  quiz.timerInterval = setInterval(() => {
    quiz.timerLeft--;
    updateTimerBadge();
    if (quiz.timerLeft <= 0) {
      clearInterval(quiz.timerInterval);
      timeOut();
    }
  }, 1000);
}

function updateTimerBadge() {
  const badge = document.getElementById('qz-timer-badge');
  badge.textContent = `⏱ ${quiz.timerLeft}s`;
  badge.classList.toggle('urgent', quiz.timerLeft <= 5);
}

function selectAnswer(idx) {
  clearInterval(quiz.timerInterval);
  const q = quiz.active[quiz.current];
  const correct = q.correct;
  const isCorrect = idx === correct;

  if (isCorrect) {
    quiz.score++;
    playBeep(660, 0.2, 0.25);
  } else {
    playBeep(220, 0.2, 0.35);
  }

  quiz.answers.push({ correct: isCorrect, question: q.text, chosen: q.options[idx], answer: q.options[correct] });

  // Highlight answers
  document.querySelectorAll('.answer-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct) btn.classList.add('correct');
    else if (i === idx && !isCorrect) btn.classList.add('wrong');
  });

  document.getElementById('qz-score-live').textContent = `Score: ${quiz.score}`;
  document.getElementById('qz-next-btn').style.display = '';
}

function timeOut() {
  const q = quiz.active[quiz.current];
  quiz.answers.push({ correct: false, question: q.text, chosen: '(Time out)', answer: q.options[q.correct] });
  document.querySelectorAll('.answer-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correct) btn.classList.add('correct');
  });
  showToast("⏰ Time's up!");
  document.getElementById('qz-next-btn').style.display = '';
  playBeep(220, 0.2, 0.5);
}

function nextQuestion() {
  quiz.current++;
  if (quiz.current >= quiz.active.length) {
    finishQuiz();
  } else {
    renderQuestion();
  }
}

function finishQuiz() {
  clearInterval(quiz.timerInterval);
  document.getElementById('quiz-active').style.display = 'none';
  document.getElementById('quiz-results').style.display = '';

  const total = quiz.active.length;
  const pct   = Math.round((quiz.score / total) * 100);
  quiz.lastPct = pct;

  // update global score stat
  save('qz_score', pct);
  updateStats();

  const emojis = pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 50 ? '😊' : '😅';
  document.getElementById('results-emoji').textContent = emojis;
  document.getElementById('results-title').textContent = pct >= 70 ? 'Well Done!' : 'Keep Practicing!';
  document.getElementById('results-score').textContent = `${quiz.score} / ${total}`;
  document.getElementById('results-pct').textContent   = `${pct}%`;

  const bar = document.getElementById('results-bar');
  bar.style.width = '0%';
  bar.style.background = pct >= 70
    ? 'linear-gradient(90deg, #4ade80, #22d3ee)'
    : 'linear-gradient(90deg, #f87171, #fbbf24)';
  setTimeout(() => bar.style.width = pct + '%', 100);

  // Review list
  const review = document.getElementById('results-review');
  review.innerHTML = quiz.answers.map(a => `
    <div class="review-item ${a.correct ? 'pass' : 'fail'}">
      <span class="review-icon">${a.correct ? '✅' : '❌'}</span>
      <span><strong>${escHtml(a.question)}</strong><br>
      ${a.correct ? '' : `Your answer: ${escHtml(a.chosen)} · Correct: ${escHtml(a.answer)}`}</span>
    </div>
  `).join('');

  if (pct === 100) playBeep(880, 0.3, 0.5);
}

function retryQuiz() {
  document.getElementById('quiz-results').style.display = 'none';
  startQuiz();
}

function backToSetup() {
  clearInterval(quiz.timerInterval);
  document.getElementById('quiz-active').style.display  = 'none';
  document.getElementById('quiz-results').style.display = 'none';
  document.getElementById('quiz-setup').style.display   = '';
}

// ═══════════════════════════════════════
//  GLOBAL STATS
// ═══════════════════════════════════════
function updateStats() {
  document.getElementById('stat-sessions').textContent = pomo.sessionsCompleted;
  document.getElementById('stat-cards').textContent    = cards.length;
  const sc = load('qz_score', 0);
  document.getElementById('stat-score').textContent    = sc + '%';
}

// ── Utility ──────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════
//  INIT
// ═══════════════════════════════════════
(function init() {
  // Pomodoro
  initTimer();
  updateDots();

  // Flashcards
  showCard();

  // Quiz
  renderQuestionList();

  // Stats
  updateStats();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const activeTab = document.querySelector('.tab-panel.active')?.id;

    if (activeTab === 'tab-pomodoro') {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        toggleTimer();
      }
      if (e.code === 'KeyR' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        resetTimer();
      }
    }

    if (activeTab === 'tab-flashcards') {
      if (e.code === 'ArrowRight') nextCard();
      if (e.code === 'ArrowLeft')  prevCard();
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        flipCard();
      }
    }
  });
})();
