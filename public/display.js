/* Contestant / big-screen renderer. Reflects server state; plays cues on change. */

let prev = {};
let phoneInterval = null;

// Audio needs a user gesture to start in browsers. Show a one-time hint.
function armAudio() {
  Sound.ensure();
  document.removeEventListener('click', armAudio);
  document.removeEventListener('keydown', armAudio);
}
document.addEventListener('click', armAudio);
document.addEventListener('keydown', armAudio);

function renderLadder(s) {
  const el = document.getElementById('ladder');
  el.innerHTML = '';
  s.ladder.forEach((amt, i) => {
    const li = document.createElement('li');
    if (s.safeHavens.includes(i)) li.classList.add('safe');
    if (i === s.questionIndex && s.phase === 'playing') li.classList.add('current');
    else if (i < s.questionIndex) li.classList.add('passed');
    li.innerHTML = `<span class="num">${i + 1}</span><span class="amt">${fmtMoney(amt)}</span>`;
    el.appendChild(li);
  });
}

function renderLifelines(s) {
  const el = document.getElementById('lifelines');
  const defs = [
    { key: 'fifty', label: '50:50' },
    { key: 'phone', label: '☎' },
    { key: 'audience', label: '👥' },
  ];
  el.innerHTML = '';
  defs.forEach((d) => {
    const div = document.createElement('div');
    div.className = 'lifeline' + (s.lifelines[d.key] ? ' used' : '');
    div.textContent = d.label;
    el.appendChild(div);
  });
}

function renderQuestion(s) {
  const q = s.questions[s.questionIndex];
  const box = document.getElementById('questionBox');
  const ans = document.getElementById('answers');

  box.textContent = s.questionVisible && q ? q.q : '';

  ans.innerHTML = '';
  if (!q) return;
  q.a.forEach((text, i) => {
    const div = document.createElement('div');
    div.className = 'answer';
    if (i >= s.answersRevealed) div.classList.add('hidden-answer');
    if (s.removedAnswers.includes(i)) div.classList.add('removed');
    if (s.resultRevealed && i === q.correct) div.classList.add('correct');
    else if (s.lockedAnswer === i) div.classList.add('locked');
    else if (s.selectedAnswer === i) div.classList.add('selected');
    div.innerHTML = `<span class="letter">${LETTERS[i]}:</span><span class="text">${escapeHtml(text)}</span>`;
    ans.appendChild(div);
  });
}

function renderAudience(s) {
  const overlay = document.getElementById('audienceOverlay');
  const chart = document.getElementById('audienceChart');
  if (s.audience.visible) {
    overlay.classList.add('show');
    const heading = overlay.querySelector('h2');
    if (heading) {
      heading.textContent = (s.vote && s.vote.open)
        ? `Ask the Audience — voting live (${s.voteTotal || 0})`
        : 'Ask the Audience';
    }
    chart.innerHTML = '';
    s.audience.votes.forEach((v, i) => {
      const bar = document.createElement('div');
      bar.className = 'audience-bar';
      bar.innerHTML = `<div class="pct">${v}%</div><div class="bar" style="height:${v}%"></div><div class="lbl">${LETTERS[i]}</div>`;
      chart.appendChild(bar);
    });
  } else {
    overlay.classList.remove('show');
  }
}

function renderPhone(s) {
  const panel = document.getElementById('phoneTimer');
  const count = document.getElementById('phoneCount');
  if (s.phone.active && s.phone.endsAt) {
    panel.classList.add('show');
    if (phoneInterval) clearInterval(phoneInterval);
    const tick = () => {
      const left = Math.max(0, Math.ceil((s.phone.endsAt - Date.now()) / 1000));
      count.textContent = left;
      if (left <= 5 && left > 0) Sound.play('tick');
      if (left <= 0) { clearInterval(phoneInterval); phoneInterval = null; }
    };
    tick();
    phoneInterval = setInterval(tick, 1000);
  } else {
    panel.classList.remove('show');
    if (phoneInterval) { clearInterval(phoneInterval); phoneInterval = null; }
  }
}

function renderBanner(s) {
  const banner = document.getElementById('banner');
  const title = document.getElementById('bannerTitle');
  const amount = document.getElementById('bannerAmount');
  banner.className = 'banner';
  if (!s.banner) return;
  const b = s.banner;
  if (b.kind === 'win') { banner.classList.add('show', 'win'); title.textContent = 'MILLIONAIRE!'; amount.textContent = fmtMoney(b.amount); }
  else if (b.kind === 'correct') { banner.classList.add('show', 'win'); title.textContent = 'CORRECT!'; amount.textContent = fmtMoney(b.amount); }
  else if (b.kind === 'lose') { banner.classList.add('show', 'lose'); title.textContent = 'Game Over'; amount.textContent = 'You leave with ' + fmtMoney(b.amount); }
  else if (b.kind === 'walk') { banner.classList.add('show', 'walk'); title.textContent = 'Walked Away'; amount.textContent = 'You take ' + fmtMoney(b.amount); }
}

function cues(s) {
  // Play sounds based on transitions from previous state.
  if ((s.answersRevealed || 0) > (prev.answersRevealed || 0)) Sound.play('reveal');
  if (s.lockedAnswer !== null && prev.lockedAnswer === null) Sound.play('lock');
  if (s.resultRevealed && !prev.resultRevealed && s.banner) {
    if (s.banner.kind === 'win') Sound.play('win');
    else if (s.banner.kind === 'correct') Sound.play('correct');
    else if (s.banner.kind === 'lose') Sound.play('wrong');
  }
  const ll = s.lifelines, pll = prev.lifelines || {};
  if ((ll.fifty && !pll.fifty) || (ll.phone && !pll.phone) || (ll.audience && !pll.audience)) Sound.play('lifeline');
}

function render(s) {
  document.getElementById('intro').style.display = s.phase === 'idle' ? 'flex' : 'none';
  document.getElementById('playArea').style.display = s.phase === 'idle' ? 'none' : 'flex';
  document.getElementById('cornerLogo').style.display = s.phase === 'idle' ? 'none' : 'block';

  renderLadder(s);
  renderLifelines(s);
  renderQuestion(s);
  renderAudience(s);
  renderPhone(s);
  renderBanner(s);
  cues(s);

  prev = JSON.parse(JSON.stringify(s));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

Game.onState(render);
Game.connect();
