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
      if (i === q.correct) div.classList.add('is-correct');
      if (s.lockedAnswer === i) div.classList.add('lock');
      else if (s.selectedAnswer === i) div.classList.add('sel');
      if (s.removedAnswers.includes(i)) div.style.opacity = '0.4';
      div.innerHTML = `<span class="letter">${LETTERS[i]}</span><span>${escapeHtml(text)}</span>`;
      div.onclick = () => { Sound.play('reveal'); Game.action('select_answer', { index: i }); };
      ha.appendChild(div);
    });
  }

  // Button states
  $('btnRevealQ').disabled = s.questionVisible;
  $('btnRevealA').disabled = s.answersRevealed;
  $('btnLock').disabled = s.selectedAnswer === null || s.lockedAnswer !== null || s.resultRevealed;
  $('btnResult').disabled = s.lockedAnswer === null || s.resultRevealed;
  $('btn5050').disabled = s.lifelines.fifty;
  $('btnPhone').disabled = s.lifelines.phone;
  $('btnAudience').disabled = s.lifelines.audience;

  $('btn5050').style.opacity = s.lifelines.fifty ? 0.4 : 1;
  $('btnPhone').style.opacity = s.lifelines.phone ? 0.4 : 1;
  $('btnAudience').style.opacity = s.lifelines.audience ? 0.4 : 1;

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
  $('btnLock').onclick = () => { Sound.play('lock'); Game.action('lock_answer'); };
  $('btnResult').onclick = () => Game.action('reveal_result');
  $('btnWalk').onclick = () => { if (confirm('Walk away with the guaranteed amount?')) Game.action('walk_away'); };
  $('btnClearBanner').onclick = () => Game.action('clear_banner');

  $('btn5050').onclick = () => { Sound.play('lifeline'); Game.action('use_fifty'); };
  $('btnPhone').onclick = () => { Sound.play('lifeline'); Game.action('use_phone', { duration: 30 }); };
  $('btnPhoneStop').onclick = () => Game.action('stop_phone');
  $('btnAudience').onclick = () => { Sound.play('lifeline'); Game.action('use_audience'); };
  $('btnAudApply').onclick = applyAudience;
  $('btnAudAuto').onclick = () => Game.action('use_audience'); // server auto-generates
  $('btnAudHide').onclick = () => Game.action('hide_audience');

  $('soundToggle').onchange = (e) => { Sound.enabled = e.target.checked; };

  $('btnToggleEditor').onclick = () => {
    const ed = $('editor');
    ed.classList.toggle('show');
    if (ed.classList.contains('show')) { renderQList(Game.state.questions); loadIntoForm(-1); }
  };
  $('btnNewQ').onclick = () => loadIntoForm(-1);
  $('btnSaveQ').onclick = saveQuestion;
  $('btnDeleteQ').onclick = deleteQuestion;
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
