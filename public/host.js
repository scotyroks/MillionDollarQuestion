/* Host control panel: drives the game and edits the question bank. */

let editIndex = -1; // which question is being edited (-1 = new)
let editorWorkingQuestions = null; // local copy while editing

function $(id) { return document.getElementById(id); }

/* ---- Render ladder + current question status ---- */
function render(s) {
  // Ladder
  const ladder = $('ladder');
  ladder.innerHTML = '';
  s.ladder.forEach((amt, i) => {
    const li = document.createElement('li');
    if (s.safeHavens.includes(i)) li.classList.add('safe');
    if (i === s.questionIndex) li.classList.add('current');
    else if (i < s.questionIndex) li.classList.add('passed');
    li.innerHTML = `<span class="num">${i + 1}</span><span class="amt">${fmtMoney(amt)}</span>`;
    ladder.appendChild(li);
  });

  $('qNum').textContent = s.questionIndex + 1;
  $('qTotal').textContent = s.questions.length;
  $('qAmt').textContent = fmtMoney(s.ladder[Math.min(s.questionIndex, s.ladder.length - 1)]);

  const q = s.questions[s.questionIndex];
  $('hostQ').textContent = q ? q.q : '— no question —';

  const ha = $('hostAnswers');
  ha.innerHTML = '';
  if (q) {
    q.a.forEach((text, i) => {
      const div = document.createElement('div');
      div.className = 'host-ans';
      // Hide the correct answer from the host until a choice has been locked in.
      if (s.lockedAnswer !== null && i === q.correct) div.classList.add('is-correct');
      if (s.lockedAnswer === i) div.classList.add('lock');
      else if (s.selectedAnswer === i) div.classList.add('sel');
      if (s.removedAnswers.includes(i)) div.style.opacity = '0.4';
      // Dim answers the room can't see yet so the host knows what's on screen.
      else if (i >= s.answersRevealed) { div.style.opacity = '0.5'; div.classList.add('not-shown'); }
      div.innerHTML = `<span class="letter">${LETTERS[i]}</span><span>${escapeHtml(text)}</span>`;
      div.onclick = () => { Sound.play('reveal'); Game.action('select_answer', { index: i }); };
      ha.appendChild(div);
    });
  }

  // Button states
  $('btnRevealQ').disabled = s.questionVisible;
  $('btnRevealA').disabled = s.answersRevealed >= 4;
  $('btnRevealA').textContent = s.answersRevealed >= 4
    ? 'All Answers Shown'
    : `Reveal Answer ${LETTERS[s.answersRevealed]} (${s.answersRevealed}/4)`;
  $('btnRevealAll').disabled = s.answersRevealed >= 4;
  $('btnLock').disabled = s.selectedAnswer === null || s.lockedAnswer !== null || s.resultRevealed;
  $('btnResult').disabled = s.lockedAnswer === null || s.resultRevealed;
  $('btn5050').disabled = s.lifelines.fifty;
  $('btnPhone').disabled = s.lifelines.phone;
  $('btnAudience').disabled = s.lifelines.audience;

  $('btn5050').style.opacity = s.lifelines.fifty ? 0.4 : 1;
  $('btnPhone').style.opacity = s.lifelines.phone ? 0.4 : 1;
  $('btnAudience').style.opacity = s.lifelines.audience ? 0.4 : 1;

  // Live phone-vote panel
  const vOpen = s.vote && s.vote.open;
  $('voteStatus').textContent = vOpen ? 'OPEN' : 'closed';
  $('voteStatus').style.color = vOpen ? 'var(--green)' : '#9fb4e8';
  $('voteTotal').textContent = s.voteTotal || 0;
  $('btnOpenVote').disabled = vOpen;
  $('btnCloseVote').disabled = !vOpen;

  const counts = s.voteCounts || [0, 0, 0, 0];
  const total = s.voteTotal || 0;
  const tally = $('voteTally');
  tally.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'vrow';
    row.innerHTML = `<span class="vl">${LETTERS[i]}</span><span class="vt"><span class="vf" style="width:${pct}%"></span></span><span class="vn">${counts[i]} (${pct}%)</span>`;
    tally.appendChild(row);
  }
  if (!$('voteUrl').dataset.set) {
    $('voteUrl').innerHTML = `Audience opens: <b>${location.origin}/vote</b> on their phones (same Wi‑Fi).`;
    $('voteUrl').dataset.set = '1';
  }

  renderPlayers(s);
  $('btnSkip').disabled = !s.players || s.players.length < 2;

  // Keep editor list fresh if open and not mid-edit-typing
  if ($('editor').classList.contains('show') && document.activeElement.tagName !== 'INPUT') {
    renderQList(s.questions);
  }
}

/* ---- Controls wiring ---- */
function wire() {
  $('btnStart').onclick = () => Game.action('start_game');
  $('btnReset').onclick = () => { if (confirm('Reset the whole game?')) Game.action('reset_game'); };
  $('btnPrev').onclick = () => Game.action('prev_question');
  $('btnNext').onclick = () => Game.action('next_question');
  $('btnRevealQ').onclick = () => Game.action('reveal_question');
  $('btnRevealA').onclick = () => { Sound.play('reveal'); Game.action('reveal_answers'); };
  $('btnRevealAll').onclick = () => { Sound.play('reveal'); Game.action('reveal_all_answers'); };
  $('btnLock').onclick = () => { Sound.play('lock'); Game.action('lock_answer'); };
  $('btnResult').onclick = () => Game.action('reveal_result');
  $('btnSkip').onclick = () => { Sound.play('lifeline'); Game.action('skip_player'); };
  $('btnWalk').onclick = () => { if (confirm('Walk away with the guaranteed amount?')) Game.action('walk_away'); };
  $('btnClearBanner').onclick = () => Game.action('clear_banner');

  $('btn5050').onclick = () => { Sound.play('lifeline'); Game.action('use_fifty'); };
  $('btnPhone').onclick = () => { Sound.play('lifeline'); Game.action('use_phone', { duration: 30 }); };
  $('btnPhoneStop').onclick = () => Game.action('stop_phone');
  $('btnAudience').onclick = () => { Sound.play('lifeline'); Game.action('use_audience'); };
  $('btnAudApply').onclick = applyAudience;
  $('btnAudAuto').onclick = () => Game.action('use_audience'); // server auto-generates
  $('btnAudHide').onclick = () => Game.action('hide_audience');

  // Live phone voting
  $('btnOpenVote').onclick = () => { Sound.play('lifeline'); Game.action('open_vote'); };
  $('btnCloseVote').onclick = () => { Sound.play('reveal'); Game.action('close_vote'); };
  $('btnResetVote').onclick = () => Game.action('reset_vote');

  $('soundToggle').onchange = (e) => { Sound.enabled = e.target.checked; };

  $('btnToggleEditor').onclick = () => {
    const ed = $('editor');
    ed.classList.toggle('show');
    if (ed.classList.contains('show')) { renderQList(Game.state.questions); loadIntoForm(-1); }
  };
  $('btnNewQ').onclick = () => loadIntoForm(-1);
  $('btnSaveQ').onclick = saveQuestion;
  $('btnDeleteQ').onclick = deleteQuestion;

  // Players / hot seat
  $('btnAddPlayer').onclick = addPlayer;
  $('playerName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addPlayer(); });
}

function addPlayer() {
  const input = $('playerName');
  const name = input.value.trim();
  if (!name) return;
  Game.action('add_player', { name });
  input.value = '';
  input.focus();
}

function renderPlayers(s) {
  const players = s.players || [];
  const list = $('playerList');
  // Hot-seat header
  if (players.length) {
    const cur = players[s.currentPlayer] || players[0];
    $('hotName').textContent = cur;
    if (players.length > 1) {
      const nextIdx = (s.currentPlayer + 1) % players.length;
      $('nextName').textContent = `· Next up: ${players[nextIdx]}`;
    } else {
      $('nextName').textContent = '';
    }
  } else {
    $('hotName').textContent = '— no players —';
    $('nextName').textContent = '';
  }

  // Don't rebuild while typing in the name field
  if (document.activeElement === $('playerName')) return;
  list.innerHTML = '';
  players.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'player-row' + (i === s.currentPlayer ? ' current' : '');
    row.innerHTML = `<span class="ord">${i + 1}</span>`
      + `<span class="seat">${i === s.currentPlayer ? '🪑' : ''}</span>`
      + `<span class="pname">${escapeHtml(name)}</span>`;
    const seat = document.createElement('button');
    seat.className = 'small ghost';
    seat.textContent = i === s.currentPlayer ? 'in seat' : 'set seat';
    seat.disabled = i === s.currentPlayer;
    seat.onclick = () => Game.action('set_hot_seat', { index: i });
    const del = document.createElement('button');
    del.className = 'small red';
    del.textContent = '✕';
    del.onclick = () => Game.action('remove_player', { index: i });
    row.appendChild(seat);
    row.appendChild(del);
    list.appendChild(row);
  });
}

function applyAudience() {
  const votes = ['audA', 'audB', 'audC', 'audD'].map((id) => Math.max(0, parseInt($(id).value, 10) || 0));
  Game.action('set_audience_votes', { votes });
}

/* ---- Question editor ---- */
function renderQList(questions) {
  const list = $('qList');
  list.innerHTML = '';
  questions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'q-item' + (i === editIndex ? ' active' : '');
    item.innerHTML = `<span class="badge">${i + 1}</span><span class="qt">${escapeHtml(q.q)}</span>`;
    item.onclick = () => loadIntoForm(i);
    list.appendChild(item);
  });
}

function loadIntoForm(index) {
  editIndex = index;
  const q = index >= 0 ? Game.state.questions[index] : { q: '', a: ['', '', '', ''], correct: 0 };
  $('edQ').value = q.q;
  for (let i = 0; i < 4; i++) $('edA' + i).value = q.a[i] || '';
  document.querySelectorAll('input[name=correct]').forEach((r) => { r.checked = (+r.value === q.correct); });
  $('edStatus').textContent = index >= 0 ? `Editing #${index + 1}` : 'New question';
  renderQList(Game.state.questions);
}

function gatherForm() {
  const text = $('edQ').value.trim();
  const a = [0, 1, 2, 3].map((i) => $('edA' + i).value.trim());
  const correctEl = document.querySelector('input[name=correct]:checked');
  const correct = correctEl ? +correctEl.value : 0;
  return { q: text, a, correct };
}

function saveQuestion() {
  const entry = gatherForm();
  if (!entry.q || entry.a.some((x) => !x)) { $('edStatus').textContent = '⚠ fill in the question and all 4 answers'; return; }
  const questions = Game.state.questions.slice();
  if (editIndex >= 0) questions[editIndex] = entry;
  else { questions.push(entry); editIndex = questions.length - 1; }
  Game.action('update_questions', { questions });
  $('edStatus').textContent = 'Saved ✓';
}

function deleteQuestion() {
  if (editIndex < 0) { loadIntoForm(-1); return; }
  if (!confirm('Delete this question?')) return;
  const questions = Game.state.questions.slice();
  questions.splice(editIndex, 1);
  Game.action('update_questions', { questions });
  editIndex = -1;
  loadIntoForm(-1);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Arm audio on first interaction
document.addEventListener('click', function arm() { Sound.ensure(); document.removeEventListener('click', arm); });

wire();
Game.onState(render);
Game.connect();
