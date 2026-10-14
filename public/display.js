/* Big-screen renderer. Mirrors the server's display view and plays cues on changes. */

let prev = null;
let phoneTimer = null;
let voteUrl = '';

/* ---- Sound needs one click/keypress before browsers allow it ---- */
function armAudio() {
  Sound.ensure();
  setTimeout(() => $('soundHint').classList.toggle('hidden', Sound.ready()), 150);
}
document.addEventListener('pointerdown', armAudio);
document.addEventListener('keydown', armAudio);

/* ---- Fullscreen + hide the cursor when idle ---- */
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
$('btnFullscreen').onclick = toggleFullscreen;
document.addEventListener('dblclick', toggleFullscreen);
document.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') toggleFullscreen(); });
let idleTimer = null;
document.addEventListener('mousemove', () => {
  document.body.classList.remove('idle-cursor');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle-cursor'), 2500);
});

// Keep the TV from sleeping mid-game where supported.
async function keepAwake() {
  try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch (_) { /* optional */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });
keepAwake();

fetch('/api/info').then((r) => r.json()).then((info) => { voteUrl = info.voteUrl; }).catch(() => {});

/* ---- Pieces ---- */
function restartAnimation(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function renderHotseat(s) {
  const players = s.players || [];
  $('hotseat').classList.toggle('hidden', !players.length);
  $('introPlayers').textContent = players.length ? `Tonight's players: ${players.join(' · ')}` : '';
  const name = players[s.currentPlayer] || players[0] || '';
  const el = $('seatName');
  if (el.textContent !== name) {
    el.textContent = name;
    restartAnimation(el, 'seat-flash');
  }
}

function renderLadder(s) {
  const el = $('ladder');
  if (el.children.length !== s.ladder.length) {
    el.innerHTML = s.ladder.map((amt, i) => `<li><span class="num">${i + 1}</span><span class="amt">${fmtMoney(amt)}</span></li>`).join('');
  }
  [...el.children].forEach((li, i) => {
    li.className = '';
    if (s.safeHavens.includes(i)) li.classList.add('safe');
    if (i === s.questionIndex && s.phase === 'playing') li.classList.add('current');
    else if (i < s.questionIndex) li.classList.add('passed');
  });
  $('forAmount').textContent = fmtMoney(s.ladder[s.questionIndex]);
}

function renderLifelines(s) {
  const el = $('lifelines');
  const defs = [['fifty', '50:50', '50:50'], ['phone', '☎', 'Phone a Friend'], ['audience', '👥', 'Ask the Audience']];
  if (!el.children.length) {
    el.innerHTML = defs.map(([key, label, title]) => `<div class="lifeline" data-key="${key}" title="${title}">${label}</div>`).join('');
  }
  [...el.children].forEach((div) => {
    const used = !!s.lifelines[div.dataset.key];
    if (used && prev && !prev.lifelines[div.dataset.key]) restartAnimation(div, 'just-used');
    div.classList.toggle('used', used);
  });
}

function renderQuestion(s) {
  const q = s.question;
  const textEl = $('questionText');
  const text = q ? q.q : '';
  if (textEl.textContent !== text) {
    textEl.textContent = text;
    if (text) restartAnimation(textEl, 'appear');
  }

  const box = $('answers');
  if (!box.children.length) {
    box.innerHTML = LETTERS.map((l) => `<div class="answer"><span class="letter">${l}:</span><span class="text"></span></div>`).join('');
  }
  const revealed = s.revealStage === 'revealed' && q && q.correct !== null;
  [...box.children].forEach((div, i) => {
    const answerText = q ? q.a[i] : '';
    const textSpan = div.querySelector('.text');
    const wasHidden = div.classList.contains('hidden-answer');
    if (textSpan.textContent !== answerText) textSpan.textContent = answerText;
    const hidden = !q || i >= s.answersRevealed;
    let state = '';
    if (revealed && i === q.correct) state = 'correct';
    else if (revealed && s.lockedAnswer === i) state = 'wrong';
    else if (s.lockedAnswer === i) state = 'locked';
    else if (s.selectedAnswer === i) state = 'selected';
    // Only touch classes that changed so running flash animations aren't restarted.
    ['correct', 'wrong', 'locked', 'selected'].forEach((c) => div.classList.toggle(c, c === state));
    div.classList.toggle('hidden-answer', hidden);
    div.classList.toggle('removed', s.removedAnswers.includes(i));
    if (wasHidden && !hidden) restartAnimation(div, 'appear');
  });
}

function renderAudience(s) {
  const overlay = $('audienceOverlay');
  const show = s.audience.visible;
  overlay.classList.toggle('show', show);
  if (!show) return;
  const live = s.vote.open;
  $('audienceTitle').textContent = live ? 'Ask the Audience — vote now!' : 'Ask the Audience';
  $('voteJoin').classList.toggle('hidden', !live);
  $('voteUrl').textContent = voteUrl;
  $('voteCount').textContent = `${s.vote.total} vote${s.vote.total === 1 ? '' : 's'} in`;

  const chart = $('audienceChart');
  if (!chart.children.length) {
    chart.innerHTML = LETTERS.map((l) => `<div class="audience-bar"><div class="pct"></div><div class="bar"></div><div class="lbl">${l}</div></div>`).join('');
  }
  [...chart.children].forEach((bar, i) => {
    const v = s.audience.votes[i] || 0;
    bar.querySelector('.pct').textContent = `${v}%`;
    bar.querySelector('.bar').style.height = `${v}%`;
    bar.classList.toggle('removed', s.removedAnswers.includes(i));
  });
}

function renderPhone(s) {
  const overlay = $('phoneOverlay');
  const active = s.phone.active && s.phone.endsAt;
  overlay.classList.toggle('show', !!active);
  if (!active) {
    clearInterval(phoneTimer);
    phoneTimer = null;
    return;
  }
  if (phoneTimer && prev && prev.phone.endsAt === s.phone.endsAt) return; // already counting
  clearInterval(phoneTimer);
  const prog = $('phoneProg');
  const circumference = 2 * Math.PI * 45;
  prog.style.strokeDasharray = circumference;
  let lastLeft = null;
  const tick = () => {
    const msLeft = Math.max(0, s.phone.endsAt - Game.now());
    const left = Math.ceil(msLeft / 1000);
    $('phoneCount').textContent = left;
    prog.style.strokeDashoffset = circumference * (1 - msLeft / (s.phone.duration * 1000));
    $('phoneRing').classList.toggle('urgent', left <= 5);
    if (left !== lastLeft) {
      if (left <= 5 && left > 0) Sound.play('tick');
      if (left === 0) Sound.play('timeup');
      lastLeft = left;
    }
    if (left <= 0) { clearInterval(phoneTimer); phoneTimer = null; }
  };
  tick();
  phoneTimer = setInterval(tick, 250);
}

function confetti() {
  const box = $('confetti');
  const colours = ['#f4c430', '#ffe07a', '#16c172', '#ffffff', '#d4af37'];
  box.innerHTML = '';
  for (let i = 0; i < 140; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colours[i % colours.length];
    p.style.animationDuration = `${2.5 + Math.random() * 3}s`;
    p.style.animationDelay = `${Math.random() * 1.5}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(p);
  }
  setTimeout(() => { box.innerHTML = ''; }, 7000);
}

function renderBanner(s) {
  const banner = $('banner');
  const b = s.banner;
  banner.className = 'overlay banner';
  if (!b) return;
  const name = (s.players || [])[s.currentPlayer];
  const copy = {
    win: ['MILLIONAIRE!', ''],
    lose: ['Game Over', 'You leave with'],
    walk: ['Walked Away', 'You take home'],
  }[b.kind];
  if (!copy) return;
  banner.classList.add('show', b.kind);
  $('bannerWho').textContent = name || '';
  $('bannerTitle').textContent = copy[0];
  $('bannerLead').textContent = copy[1];
  $('bannerAmount').textContent = fmtMoney(b.amount);
  if (b.kind === 'win' && !(prev && prev.banner)) confetti();
}

function cues(s) {
  if (!prev) return;
  if (s.phase === 'playing' && prev.phase === 'idle') Sound.play('start');
  if (s.questionVisible && !prev.questionVisible) Sound.play('question');
  if (s.answersRevealed > prev.answersRevealed) Sound.play('reveal');
  if (s.selectedAnswer !== null && s.selectedAnswer !== prev.selectedAnswer && s.lockedAnswer === null) Sound.play('select');
  if (s.lockedAnswer !== null && prev.lockedAnswer === null) Sound.play('lock');
  if (s.revealStage === 'suspense' && prev.revealStage !== 'suspense') Sound.play('suspense');
  if (s.revealStage === 'revealed' && prev.revealStage !== 'revealed' && s.question) {
    const right = s.lockedAnswer === s.question.correct;
    const final = s.questionIndex === s.questionCount - 1;
    Sound.play(right ? (final ? 'win' : 'correct') : 'wrong');
  }
  if (s.phase === 'walked' && prev.phase !== 'walked') Sound.play('walk');
  const ll = s.lifelines; const pl = prev.lifelines;
  if ((ll.fifty && !pl.fifty) || (ll.phone && !pl.phone) || (ll.audience && !pl.audience)) Sound.play('lifeline');
  if (s.currentPlayer !== prev.currentPlayer && (s.players || []).length) Sound.play('seat');
}

function render(s) {
  const idle = s.phase === 'idle';
  $('intro').classList.toggle('hidden', !idle);
  $('playArea').classList.toggle('hidden', idle);
  $('cornerLogo').classList.toggle('hidden', idle);

  renderHotseat(s);
  renderLadder(s);
  renderLifelines(s);
  renderQuestion(s);
  renderAudience(s);
  renderPhone(s);
  renderBanner(s);
  cues(s);
  prev = JSON.parse(JSON.stringify(s));
}

Game.onState(render);
Game.connect('display');
