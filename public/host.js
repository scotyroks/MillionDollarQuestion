/* Host control panel: drives the game, runs lifelines, manages players and questions. */

let editIndex = -1;      // question being edited (-1 = new)
let lastBankJson = '';   // to know when the question list really changed
let lastListKey = '';
let phoneTimer = null;

async function act(type, payload) {
  const result = await Game.action(type, payload);
  if (result.error === 'host key required') showGate('That key no longer works — enter the current one.');
  return result;
}

function hostSound(name) { Sound.play(name); }

/* ---------------------------------------------------------------- render */

function render(s) {
  const phase = $('phase');
  phase.textContent = { idle: 'intro screen', playing: 'playing', won: 'won!', lost: 'game over', walked: 'walked away' }[s.phase];
  phase.className = `phase ${s.phase}`;

  renderLadder(s);
  renderQuestion(s);
  renderButtons(s);
  renderLifelines(s);
  renderPlayers(s);
  renderBank(s);
}

function renderLadder(s) {
  const el = $('ladder');
  if (el.children.length !== s.ladder.length) {
    el.innerHTML = s.ladder.map((amt, i) => `<li data-i="${i}"><span class="num">${i + 1}</span><span class="amt">${fmtMoney(amt)}</span></li>`).join('');
  }
  [...el.children].forEach((li, i) => {
    li.className = '';
    if (s.safeHavens.includes(i)) li.classList.add('safe');
    if (i === s.questionIndex) li.classList.add('current');
    else if (i < s.questionIndex) li.classList.add('passed');
  });

  $('qNum').textContent = s.questionIndex + 1;
  $('qTotal').textContent = s.playableCount;
  $('qAmt').textContent = fmtMoney(s.ladder[s.questionIndex]);
  $('safeTag').classList.toggle('hidden', !s.safeHavens.includes(s.questionIndex));
  const banked = s.safeHavens.filter((h) => h < s.questionIndex).map((h) => s.ladder[h]).pop() || 0;
  const walk = s.questionIndex > 0 ? s.ladder[s.questionIndex - 1] : 0;
  $('qBanked').textContent = `Guaranteed ${fmtMoney(banked)} · walk away with ${fmtMoney(walk)}`;
}

function renderQuestion(s) {
  const q = s.questions[s.questionIndex];
  $('hostQ').textContent = q ? q.q : '— no question —';
  $('qOnScreen').textContent = s.questionVisible ? 'on screen' : 'hidden';
  $('qOnScreen').classList.toggle('on', s.questionVisible);

  const box = $('hostAnswers');
  if (!box.children.length) {
    box.innerHTML = LETTERS.map((l, i) => `<button class="host-ans" data-i="${i}"><span class="letter">${l}</span><span class="text"></span><span class="tag"></span></button>`).join('');
  }
  const locked = s.lockedAnswer !== null;
  const revealed = s.revealStage === 'revealed';
  [...box.children].forEach((btn, i) => {
    btn.querySelector('.text').textContent = q ? q.a[i] : '';
    const isCorrect = q && i === q.correct;
    const removed = s.removedAnswers.includes(i);
    btn.className = 'host-ans';
    if (removed) btn.classList.add('removed');
    else if (i >= s.answersRevealed) btn.classList.add('not-shown');
    // The correct answer stays hidden from the host until the pick is locked in.
    if (locked && isCorrect) btn.classList.add('is-correct');
    if (revealed && isCorrect) btn.classList.add('result-right');
    else if (revealed && s.lockedAnswer === i) btn.classList.add('result-wrong');
    else if (s.lockedAnswer === i) btn.classList.add('lock');
    else if (s.selectedAnswer === i) btn.classList.add('sel');
    let tag = '';
    if (locked && isCorrect) tag = '✓ correct';
    else if (s.lockedAnswer === i) tag = 'final answer';
    else if (removed) tag = '50:50';
    else if (i >= s.answersRevealed) tag = 'not shown';
    btn.querySelector('.tag').textContent = tag;
    btn.disabled = removed || locked || s.phase !== 'playing';
  });
}

// What the host should probably press next — that button glows.
function nextStep(s) {
  const q = s.questions[s.questionIndex];
  if (s.phase === 'idle') return ['btnStart', 'Press <b>Start Game</b> when everyone is ready. Add players on the right first if you like.'];
  if (s.phase !== 'playing') {
    return ['btnStart', 'Round over. <b>Start Game</b> begins a new round from the bottom of the ladder'
      + (s.players.length > 1 ? ' — or press <b>Next Player</b> to hand the seat on first.' : '.')];
  }
  if (!s.questionVisible) return ['btnRevealQ', 'Read the question out, then <b>Reveal Question</b>.'];
  if (s.answersRevealed < 4) return ['btnRevealA', 'Reveal the answers one by one with <b>Space</b>.'];
  if (s.selectedAnswer === null) return [null, 'Click the contestant\'s answer (or press <b>1–4</b>). Lifelines are on the right.'];
  if (s.lockedAnswer === null) return ['btnLock', '“Is that your final answer?” — then <b>Lock In</b>.'];
  if (s.revealStage === 'none') return ['btnResult', 'Build the tension… then <b>Reveal Answer</b>.'];
  if (s.revealStage === 'suspense') return [null, 'Revealing…'];
  if (q && s.lockedAnswer === q.correct) {
    return s.questionIndex < s.playableCount - 1
      ? ['btnNext2', 'Correct! Press <b>Next Question</b> to climb the ladder.']
      : [null, 'They\'ve won the top prize!'];
  }
  return [null, 'Wrong answer — the Game Over screen is on its way.'];
}

function renderButtons(s) {
  const playing = s.phase === 'playing';
  const busy = s.revealStage !== 'none';
  $('btnStart').innerHTML = s.phase === 'idle' ? '▶ Start Game' : '▶ New Round';
  $('btnPrev').disabled = s.questionIndex === 0;
  $('btnNext').disabled = s.questionIndex >= s.playableCount - 1;
  $('btnNext2').disabled = !playing || s.questionIndex >= s.playableCount - 1;
  $('btnRevealQ').disabled = !playing || s.questionVisible;
  $('btnRevealA').disabled = !playing || s.answersRevealed >= 4;
  $('btnRevealA').firstChild.textContent = s.answersRevealed >= 4 ? 'All answers shown ' : `Reveal Answer ${LETTERS[s.answersRevealed]} `;
  $('btnRevealAll').disabled = !playing || s.answersRevealed >= 4;
  $('btnLock').disabled = !playing || s.selectedAnswer === null || s.lockedAnswer !== null;
  $('btnUnlock').disabled = s.lockedAnswer === null || busy;
  $('btnResult').disabled = s.lockedAnswer === null || busy;
  $('btnResult').firstChild.textContent = s.revealStage === 'suspense' ? 'Revealing… ' : 'Reveal Answer ';
  $('btnWalk').disabled = !playing || s.revealStage === 'suspense';
  $('btnSkip').disabled = s.players.length < 2;
  $('btnClearBanner').disabled = !s.banner && !s.audience.visible && !s.phone.active;

  const [suggested, hint] = nextStep(s);
  document.querySelectorAll('button.suggested').forEach((b) => b.classList.remove('suggested'));
  if (suggested && !$(suggested).disabled) $(suggested).classList.add('suggested');
  $('hint').innerHTML = hint;
}

function setLifelineBadge(suffix, used) {
  const badge = $(`status${suffix}`);
  badge.textContent = used ? 'Used' : 'Available';
  badge.classList.toggle('used', used);
}

function renderLifelines(s) {
  const used = s.lifelines;
  const playing = s.phase === 'playing';
  setLifelineBadge('5050', used.fifty);
  setLifelineBadge('Phone', used.phone);
  setLifelineBadge('Audience', used.audience);
  $('btn5050').disabled = used.fifty || !playing;
  $('btnPhone').disabled = used.phone || !playing;
  $('btnPhoneStop').disabled = !s.phone.active;
  renderPhoneCountdown(s);

  const open = s.vote.open;
  $('btnOpenVote').disabled = used.audience || !playing;
  $('btnCloseVote').disabled = !open;
  $('btnResetVote').disabled = !open || !s.voteTotal;
  $('btnAudAuto').disabled = used.audience || !playing;
  $('btnAudApply').disabled = used.audience || !playing;
  $('btnAudShow').disabled = !used.audience || s.audience.visible;
  $('btnAudHide').disabled = !s.audience.visible;
  $('voteStatus').textContent = open ? 'OPEN' : 'closed';
  $('voteStatus').style.color = open ? 'var(--green)' : '';
  $('voteTotal').textContent = s.voteTotal;

  const tally = $('voteTally');
  if (!tally.children.length) {
    tally.innerHTML = LETTERS.map((l) => `<div class="vrow"><span class="vl">${l}</span><span class="vt"><span class="vf"></span></span><span class="vn"></span></div>`).join('');
  }
  [...tally.children].forEach((row, i) => {
    const n = s.voteCounts[i];
    const pct = s.voteTotal ? Math.round((n / s.voteTotal) * 100) : 0;
    row.querySelector('.vf').style.width = `${pct}%`;
    row.querySelector('.vn').textContent = `${n} (${pct}%)`;
  });
}

function renderPhoneCountdown(s) {
  clearInterval(phoneTimer);
  const el = $('phoneLeft');
  if (!s.phone.active) { el.textContent = ''; return; }
  const tick = () => {
    const left = Math.max(0, Math.ceil((s.phone.endsAt - Game.now()) / 1000));
    el.textContent = `${left}s`;
    if (!left) clearInterval(phoneTimer);
  };
  tick();
  phoneTimer = setInterval(tick, 250);
}

function renderPlayers(s) {
  const players = s.players;
  if (players.length) {
    $('hotName').textContent = players[s.currentPlayer] || players[0];
    $('nextName').textContent = players.length > 1 ? `· next up: ${players[(s.currentPlayer + 1) % players.length]}` : '';
  } else {
    $('hotName').textContent = '— add players on the right —';
    $('nextName').textContent = '';
  }

  const list = $('playerList');
  list.innerHTML = '';
  players.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'player-row' + (i === s.currentPlayer ? ' current' : '');
    row.innerHTML = `<span class="ord">${i + 1}</span><span class="pname">${escapeHtml(name)}</span>`;
    const mk = (label, title, cls, disabled, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `small ${cls}`;
      b.textContent = label;
      b.title = title;
      b.disabled = disabled;
      b.onclick = fn;
      row.appendChild(b);
    };
    mk('↑', 'Move up', 'ghost', i === 0, () => act('move_player', { index: i, dir: -1 }));
    mk('↓', 'Move down', 'ghost', i === players.length - 1, () => act('move_player', { index: i, dir: 1 }));
    mk(i === s.currentPlayer ? 'in seat' : 'seat', 'Put in the hot seat', 'ghost', i === s.currentPlayer, () => act('set_hot_seat', { index: i }));
    mk('✕', `Remove ${name}`, 'red', false, () => { if (confirm(`Remove ${name}?`)) act('remove_player', { index: i }); });
    list.appendChild(row);
  });
}

/* ---------------------------------------------------------- question bank */

function renderBank(s) {
  const bankJson = JSON.stringify(s.questions);
  const listKey = `${bankJson}|${editIndex}|${s.questionIndex}`;
  if (listKey === lastListKey) return;
  const bankChanged = bankJson !== lastBankJson;
  lastListKey = listKey;
  lastBankJson = bankJson;

  const n = s.questions.length;
  $('bankInfo').textContent = n > s.playableCount ? `${n} questions · first ${s.playableCount} play` : `${n} question${n === 1 ? '' : 's'}`;

  const list = $('qList');
  const scroll = list.scrollTop;
  list.innerHTML = '';
  s.questions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'q-item';
    if (i === editIndex) item.classList.add('active');
    if (i >= s.playableCount) item.classList.add('extra');
    if (i === s.questionIndex) item.classList.add('live');
    const amt = i < s.playableCount ? fmtMoney(s.ladder[i]) : 'spare';
    item.innerHTML = `<span class="badge">${i + 1}</span><span class="qt">${escapeHtml(q.q)}</span><span class="amt">${amt}</span>`;
    item.onclick = () => loadIntoForm(i);
    const up = document.createElement('button');
    up.className = 'ghost small'; up.textContent = '↑'; up.title = 'Move earlier (easier)'; up.disabled = i === 0;
    up.onclick = (e) => { e.stopPropagation(); moveQuestion(i, -1); };
    const down = document.createElement('button');
    down.className = 'ghost small'; down.textContent = '↓'; down.title = 'Move later (harder)'; down.disabled = i === n - 1;
    down.onclick = (e) => { e.stopPropagation(); moveQuestion(i, 1); };
    item.append(up, down);
    list.appendChild(item);
  });
  list.scrollTop = scroll;

  // If someone else changed the question we're editing, follow it.
  if (bankChanged && editIndex >= n) loadIntoForm(-1);
}

function loadIntoForm(index) {
  editIndex = index;
  const q = index >= 0 ? Game.state.questions[index] : { q: '', a: ['', '', '', ''], correct: 0 };
  $('edQ').value = q.q;
  q.a.forEach((text, i) => { $(`edA${i}`).value = text; });
  document.querySelectorAll('input[name=correct]').forEach((r) => { r.checked = Number(r.value) === q.correct; });
  $('edTitle').textContent = index >= 0 ? `Editing question ${index + 1}` : 'New question';
  $('btnDeleteQ').disabled = index < 0;
  lastListKey = '';
  renderBank(Game.state);
}

function gatherForm() {
  const checked = document.querySelector('input[name=correct]:checked');
  return {
    q: $('edQ').value.trim(),
    a: [0, 1, 2, 3].map((i) => $(`edA${i}`).value.trim()),
    correct: checked ? Number(checked.value) : -1,
  };
}

async function saveQuestion(e) {
  e.preventDefault();
  const entry = gatherForm();
  if (!entry.q || entry.a.some((x) => !x)) return toast('Fill in the question and all four answers', 'error');
  if (entry.correct < 0) return toast('Tick which answer is correct', 'error');
  const questions = Game.state.questions.slice();
  const isNew = editIndex < 0;
  if (isNew) questions.push(entry);
  else questions[editIndex] = entry;
  const r = await act('update_questions', { questions });
  if (!r.ok) return;
  toast(isNew ? 'Question added' : 'Question saved');
  if (isNew) loadIntoForm(-1);
}

async function deleteQuestion() {
  if (editIndex < 0) return;
  if (Game.state.questions.length <= 1) return toast('Keep at least one question', 'error');
  if (!confirm(`Delete question ${editIndex + 1}?`)) return;
  const questions = Game.state.questions.slice();
  questions.splice(editIndex, 1);
  const r = await act('update_questions', { questions });
  if (r.ok) loadIntoForm(-1);
}

function moveQuestion(i, dir) {
  const questions = Game.state.questions.slice();
  const j = i + dir;
  [questions[i], questions[j]] = [questions[j], questions[i]];
  if (editIndex === i) editIndex = j;
  else if (editIndex === j) editIndex = i;
  act('update_questions', { questions });
}

function shuffleForm() {
  const entry = gatherForm();
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  order.forEach((from, to) => { $(`edA${to}`).value = entry.a[from]; });
  const newCorrect = order.indexOf(entry.correct);
  document.querySelectorAll('input[name=correct]').forEach((r) => { r.checked = Number(r.value) === newCorrect; });
  toast('Answers shuffled — press Save to keep');
}

function exportQuestions() {
  const blob = new Blob([JSON.stringify(Game.state.questions, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'million-dollar-questions.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Small CSV reader: handles quoted fields with commas, "" escapes and newlines.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

function questionsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length && /question/i.test(rows[0][0])) rows.shift(); // header row
  return rows.map((r, i) => {
    const letter = String(r[5] || '').trim().toUpperCase();
    const correct = LETTERS.includes(letter) ? LETTERS.indexOf(letter) : Number(letter) - 1;
    if (r.length < 6 || !(correct >= 0 && correct <= 3)) throw new Error(`CSV row ${i + 1}: need question, A, B, C, D and the correct letter`);
    return { q: r[0], a: r.slice(1, 5), correct };
  });
}

async function importQuestions(file) {
  try {
    const text = await file.text();
    const questions = /\.csv$/i.test(file.name) ? questionsFromCsv(text) : JSON.parse(text);
    if (!Array.isArray(questions)) throw new Error('expected a list of questions');
    const mode = confirm(`Import ${questions.length} questions.\n\nOK = replace the current bank\nCancel = add them to the end`);
    const next = mode ? questions : Game.state.questions.concat(questions);
    const r = await act('update_questions', { questions: next });
    if (r.ok) { toast(`Imported ${questions.length} questions`); loadIntoForm(-1); }
  } catch (err) {
    toast(`Import failed: ${err.message}`, 'error');
  }
}

/* ---------------------------------------------------------------- wiring */

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea'); // plain-http LAN fallback
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

const confirmWalk = () => {
  if (confirm(`Walk away with ${$('qBanked').textContent.split('walk away with ')[1] || 'the money'}?`)) {
    act('walk_away');
  }
};

function wire() {
  $('btnStart').onclick = () => {
    if (Game.state.phase === 'playing' && Game.state.questionIndex > 0 && !confirm('Start a new round from question 1?')) return;
    act('start_game');
  };
  $('btnReset').onclick = () => { if (confirm('Reset to the intro screen? Players are kept.')) act('reset_game'); };
  $('btnPrev').onclick = () => act('prev_question');
  $('btnNext').onclick = () => act('next_question');
  $('btnNext2').onclick = () => act('next_question');
  $('btnRevealQ').onclick = () => act('reveal_question');
  $('btnRevealA').onclick = () => { hostSound('reveal'); act('reveal_answers'); };
  $('btnRevealAll').onclick = () => { hostSound('reveal'); act('reveal_all_answers'); };
  $('btnLock').onclick = () => { hostSound('lock'); act('lock_answer'); };
  $('btnUnlock').onclick = () => act('unlock_answer');
  $('btnResult').onclick = () => act('reveal_result');
  $('btnSkip').onclick = () => { hostSound('seat'); act('skip_player'); };
  $('btnWalk').onclick = confirmWalk;
  $('btnClearBanner').onclick = () => {
    act('clear_banner');
    if (Game.state.audience.visible) act('hide_audience');
    if (Game.state.phone.active) act('stop_phone');
  };
  $('hostAnswers').onclick = (e) => {
    const btn = e.target.closest('.host-ans');
    if (!btn || btn.disabled) return;
    hostSound('select');
    act('select_answer', { index: Number(btn.dataset.i) });
  };
  $('ladder').onclick = (e) => {
    const li = e.target.closest('li');
    if (li) act('goto_question', { index: Number(li.dataset.i) });
  };

  $('btn5050').onclick = () => { hostSound('lifeline'); act('use_fifty'); };
  $('btnPhone').onclick = () => { hostSound('lifeline'); act('use_phone', { duration: Number($('phoneSecs').value) }); };
  $('btnPhoneStop').onclick = () => act('stop_phone');
  $('btnAudAuto').onclick = () => { hostSound('lifeline'); act('use_audience'); };
  $('btnAudApply').onclick = () => {
    const votes = ['audA', 'audB', 'audC', 'audD'].map((id) => Math.max(0, parseInt($(id).value, 10) || 0));
    if (!votes.some(Boolean)) return toast('Enter at least one number', 'error');
    hostSound('lifeline');
    act('use_audience', { votes });
  };
  $('btnAudShow').onclick = () => act('show_audience');
  $('btnAudHide').onclick = () => act('hide_audience');
  $('btnOpenVote').onclick = () => { hostSound('lifeline'); act('open_vote'); };
  $('btnCloseVote').onclick = () => { hostSound('reveal'); act('close_vote'); };
  $('btnResetVote').onclick = () => act('reset_vote');

  $('soundToggle').onchange = (e) => {
    Sound.enabled = e.target.checked;
    storage('set', 'mdq_host_sound', Sound.enabled ? '1' : '0');
    if (Sound.enabled) Sound.ensure();
  };
  // Host sounds default off — the big screen already plays them for the room.
  Sound.enabled = storage('get', 'mdq_host_sound') === '1';
  $('soundToggle').checked = Sound.enabled;

  $('playerForm').onsubmit = (e) => {
    e.preventDefault();
    const name = $('playerName').value.trim();
    if (!name) return;
    act('add_player', { name });
    $('playerName').value = '';
  };

  $('qForm').onsubmit = saveQuestion;
  $('btnNewQ').onclick = () => { loadIntoForm(-1); $('edQ').focus(); };
  $('btnDeleteQ').onclick = deleteQuestion;
  $('btnShuffleQ').onclick = shuffleForm;
  $('btnExport').onclick = exportQuestions;
  $('btnImport').onclick = () => $('importFile').click();
  $('importFile').onchange = (e) => { if (e.target.files[0]) importQuestions(e.target.files[0]); e.target.value = ''; };
  $('btnSamples').onclick = () => {
    if (confirm('Replace the whole question bank with the 15 sample questions?')) act('load_sample_questions').then(() => loadIntoForm(-1));
  };

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.onclick = () => copyText($(btn.dataset.copy).textContent).then(() => toast('Copied'));
  });

  $('btnKeys').onclick = () => $('keysOverlay').classList.toggle('show');
  $('btnKeysClose').onclick = () => $('keysOverlay').classList.remove('show');
  $('keysOverlay').onclick = (e) => { if (e.target.id === 'keysOverlay') $('keysOverlay').classList.remove('show'); };

  document.addEventListener('keydown', onKey);
}

function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select') || $('gate').classList.contains('show')) return;
  const k = e.key;
  const click = (id) => {
    const b = $(id);
    if (b && !b.disabled) { b.click(); e.preventDefault(); }
    else if (k === ' ') e.preventDefault(); // don't scroll the page
  };
  if (/^[1-4]$/.test(k)) {
    const btn = $('hostAnswers').children[Number(k) - 1];
    if (btn && !btn.disabled) btn.click();
    e.preventDefault();
    return;
  }
  switch (k.toLowerCase()) {
    case 'q': return click('btnRevealQ');
    case ' ': return click('btnRevealA');
    case 'a': return click('btnRevealAll');
    case 'l': return click('btnLock');
    case 'u': return click('btnUnlock');
    case 'enter': return click('btnResult');
    case 'n': return click('btnNext');
    case 'p': return click('btnPrev');
    case 's': return click('btnSkip');
    case 'w': return click('btnWalk');
    case 'escape':
      if ($('keysOverlay').classList.contains('show')) { $('keysOverlay').classList.remove('show'); return undefined; }
      return click('btnClearBanner');
    case '?': $('keysOverlay').classList.toggle('show'); return undefined;
    default: return undefined;
  }
}

/* ------------------------------------------------------------- host key */

function showGate(message) {
  $('gate').classList.add('show');
  $('gateMsg').textContent = message || '';
  setTimeout(() => $('gateKey').focus(), 50);
}

async function checkKey() {
  const res = await fetch('/api/info', { headers: { 'X-Host-Key': Game.key || '' } });
  return res.json();
}

async function start() {
  Game.key = Game.hostKey();
  let info;
  try { info = await checkKey(); } catch (_) { return showGate('Can\'t reach the game server.'); }
  if (!info.isHost) {
    showGate(Game.key ? 'That key didn\'t work.' : '');
    return undefined;
  }
  $('gate').classList.remove('show');
  $('displayUrl').textContent = info.displayUrl;
  $('voteUrl').textContent = info.voteUrl;
  $('voteUrlInline').textContent = info.voteUrl;
  $('hostUrl').textContent = info.hostUrl;
  const firstTime = !Game.source;
  if (firstTime) Game.onState(render);
  Game.connect('host'); // (re)connect with the key that just worked
  if (firstTime) loadWhenReady();
  return undefined;
}

function loadWhenReady() {
  if (Game.state) loadIntoForm(-1);
  else setTimeout(loadWhenReady, 100);
}

$('gateForm').onsubmit = (e) => {
  e.preventDefault();
  const key = $('gateKey').value.trim();
  if (!key) return;
  storage('set', KEY_STORE, key);
  history.replaceState(null, '', location.pathname);
  start();
};

document.addEventListener('pointerdown', () => { if (Sound.enabled) Sound.ensure(); }, { once: true });

wire();
start();
