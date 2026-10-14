const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame, buildLadder, votesToPercents, SUSPENSE_MS, WIN_DELAY_MS, WRONG_HOLD_MS,
} = require('../lib/game');
const { cloneSample } = require('../lib/questions');

// Deterministic timers: advance(ms) runs everything due.
function fakeTimers() {
  let t = 0;
  let id = 0;
  const queue = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { queue.set(++id, { fn, at: t + ms }); return id; },
    clearTimeout(i) { queue.delete(i); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...queue.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
  };
}

function setup(opts = {}) {
  const timers = fakeTimers();
  let changes = 0;
  const game = createGame({
    questions: opts.questions || cloneSample(),
    timers,
    now: timers.now,
    random: () => 0.5,
    onChange: () => { changes++; },
    onQuestions: opts.onQuestions,
  });
  const act = (type, payload) => {
    const r = game.dispatch(type, payload);
    assert.equal(r.ok, true, `${type} failed: ${r.error}`);
  };
  return { game, timers, act, changes: () => changes };
}

function answer(ctx, choice) {
  ctx.act('select_answer', { index: choice });
  ctx.act('lock_answer');
  ctx.act('reveal_result');
}

test('ladder keeps the top rungs for short banks', () => {
  assert.deepEqual(buildLadder(15).safeHavens, [4, 9]);
  assert.equal(buildLadder(15).ladder.at(-1), 1000000);
  const ten = buildLadder(10);
  assert.equal(ten.ladder.length, 10);
  assert.equal(ten.ladder[0], 2000);
  assert.equal(ten.ladder.at(-1), 1000000);
  assert.deepEqual(ten.safeHavens, [4]); // $32,000
  assert.deepEqual(buildLadder(3).safeHavens, []);
  assert.equal(buildLadder(40).ladder.length, 15);
});

test('percentages always sum to 100', () => {
  assert.deepEqual(votesToPercents([1, 1, 1, 0]), [34, 33, 33, 0]);
  assert.deepEqual(votesToPercents([0, 0, 0, 0]), [0, 0, 0, 0]);
  assert.equal(votesToPercents([7, 3, 11, 2]).reduce((a, b) => a + b), 100);
});

test('correct answer: suspense, then green, and the game waits for Next', () => {
  const ctx = setup();
  ctx.act('start_game');
  answer(ctx, 2);
  assert.equal(ctx.game.state.revealStage, 'suspense');
  ctx.timers.advance(SUSPENSE_MS);
  assert.equal(ctx.game.state.revealStage, 'revealed');
  ctx.timers.advance(10000);
  assert.equal(ctx.game.state.phase, 'playing');
  ctx.act('next_question');
  assert.equal(ctx.game.state.questionIndex, 1);
  assert.equal(ctx.game.state.lockedAnswer, null);
});

test('wrong answer drops to the last safe haven', () => {
  const ctx = setup();
  ctx.act('start_game');
  ctx.act('goto_question', { index: 7 });
  answer(ctx, 0); // correct is 1
  ctx.timers.advance(SUSPENSE_MS + WRONG_HOLD_MS);
  assert.equal(ctx.game.state.phase, 'lost');
  assert.deepEqual(ctx.game.state.banner, { kind: 'lose', amount: 1000 });
});

test('winning the final question shows the million', () => {
  const ctx = setup();
  ctx.act('start_game');
  ctx.act('goto_question', { index: 14 });
  answer(ctx, 1);
  ctx.timers.advance(SUSPENSE_MS + WIN_DELAY_MS);
  assert.equal(ctx.game.state.phase, 'won');
  assert.equal(ctx.game.state.banner.amount, 1000000);
});

test('a short bank still ends on the million', () => {
  const ctx = setup({ questions: cloneSample().slice(0, 5) });
  ctx.act('start_game');
  ctx.act('goto_question', { index: 99 });
  assert.equal(ctx.game.state.questionIndex, 4);
  answer(ctx, 2);
  ctx.timers.advance(SUSPENSE_MS + WIN_DELAY_MS);
  assert.deepEqual(ctx.game.state.banner, { kind: 'win', amount: 1000000 });
});

test('navigating away cancels a pending reveal', () => {
  const ctx = setup();
  ctx.act('start_game');
  answer(ctx, 0);
  ctx.act('next_question');
  ctx.timers.advance(20000);
  assert.equal(ctx.game.state.phase, 'playing');
  assert.equal(ctx.game.state.revealStage, 'none');
});

test('walk away pays the last banked rung, or the current one once answered', () => {
  const a = setup();
  a.act('start_game');
  a.act('goto_question', { index: 3 });
  a.act('walk_away');
  assert.equal(a.game.state.banner.amount, 300);

  const b = setup();
  b.act('start_game');
  b.act('goto_question', { index: 3 });
  answer(b, 1);
  b.timers.advance(SUSPENSE_MS);
  b.act('walk_away');
  assert.equal(b.game.state.banner.amount, 500);
});

test('selection is frozen once locked, and removed answers cannot be picked', () => {
  const ctx = setup();
  ctx.act('start_game');
  ctx.act('select_answer', { index: 0 });
  ctx.act('lock_answer');
  ctx.act('select_answer', { index: 3 });
  assert.equal(ctx.game.state.selectedAnswer, 0);
  ctx.act('unlock_answer');
  assert.equal(ctx.game.state.lockedAnswer, null);
  ctx.act('use_fifty');
  const removed = ctx.game.state.removedAnswers;
  assert.equal(removed.length, 2);
  assert.ok(!removed.includes(2), 'never removes the correct answer');
  ctx.act('select_answer', { index: removed[0] });
  assert.notEqual(ctx.game.state.selectedAnswer, removed[0]);
  assert.equal(ctx.game.dispatch('select_answer', { index: 9 }).ok, false);
});

test('lifelines are single use; auto audience sums to 100 and skips 50:50 answers', () => {
  const ctx = setup();
  ctx.act('start_game');
  ctx.act('use_fifty');
  const first = ctx.game.state.removedAnswers.slice();
  ctx.act('use_fifty');
  assert.deepEqual(ctx.game.state.removedAnswers, first);
  ctx.act('use_audience');
  const votes = ctx.game.state.audience.votes;
  assert.equal(votes.reduce((x, y) => x + y), 100);
  first.forEach((i) => assert.equal(votes[i], 0));
});

test('phone a friend closes itself after the countdown', () => {
  const ctx = setup();
  ctx.act('start_game');
  ctx.act('use_phone', { duration: 30 });
  assert.equal(ctx.game.state.phone.active, true);
  assert.equal(ctx.game.state.phone.endsAt, 30000);
  ctx.timers.advance(33000);
  assert.equal(ctx.game.state.phone.active, false);
});

test('live vote: one ballot per phone, closed votes are rejected', () => {
  const ctx = setup();
  ctx.act('start_game');
  assert.equal(ctx.game.castVote('p1', 0).ok, false);
  ctx.act('open_vote');
  assert.ok(ctx.game.castVote('p1', 0).ok);
  assert.ok(ctx.game.castVote('p1', 2).ok); // changed mind
  assert.ok(ctx.game.castVote('p2', 2).ok);
  assert.equal(ctx.game.castVote('p3', 7).ok, false);
  assert.equal(ctx.game.view('host').voteTotal, 2);
  ctx.act('close_vote');
  assert.deepEqual(ctx.game.state.audience.votes, [0, 0, 100, 0]);
  assert.equal(ctx.game.castVote('p4', 1).ok, false);
});

test('display and audience views never leak the correct answer early', () => {
  const ctx = setup();
  ctx.act('start_game');
  let d = ctx.game.view('display');
  assert.equal(d.question.q, '');
  assert.deepEqual(d.question.a, ['', '', '', '']);
  assert.equal(d.question.correct, null);
  assert.equal(d.questions, undefined);

  ctx.act('reveal_all_answers');
  ctx.act('open_vote');
  const a = ctx.game.view('audience');
  assert.equal(a.answers.length, 4);
  assert.ok(!JSON.stringify(a).includes('correct'));

  answer(ctx, 2);
  d = ctx.game.view('display');
  assert.equal(d.question.correct, null, 'still hidden during suspense');
  ctx.timers.advance(SUSPENSE_MS);
  assert.equal(ctx.game.view('display').question.correct, 2);
  assert.equal(ctx.game.view('host').questions.length, 15);
});

test('question edits are validated before they replace the bank', () => {
  let saved = null;
  const ctx = setup({ onQuestions: (q) => { saved = q; } });
  const bad = ctx.game.dispatch('update_questions', { questions: [{ q: 'x', a: ['1', '2'], correct: 0 }] });
  assert.equal(bad.ok, false);
  assert.equal(ctx.game.questions.length, 15);
  assert.equal(saved, null);
  ctx.act('goto_question', { index: 10 });
  ctx.act('update_questions', { questions: [{ q: '  Two\nlines ', a: ['a', 'b', 'c', 'd'], correct: '3' }] });
  assert.deepEqual(saved, [{ q: 'Two lines', a: ['a', 'b', 'c', 'd'], correct: 3 }]);
  assert.equal(ctx.game.state.questionIndex, 0);
});

test('hot seat: skip keeps the question, moving players keeps the seat', () => {
  const ctx = setup();
  ['Ana', 'Ben', 'Cy'].forEach((name) => ctx.act('add_player', { name }));
  ctx.act('start_game');
  ctx.act('goto_question', { index: 4 });
  ctx.act('select_answer', { index: 1 });
  ctx.act('skip_player');
  assert.equal(ctx.game.state.currentPlayer, 1);
  assert.equal(ctx.game.state.questionIndex, 4);
  assert.equal(ctx.game.state.selectedAnswer, null);
  ctx.act('move_player', { index: 1, dir: -1 });
  assert.deepEqual(ctx.game.players, ['Ben', 'Ana', 'Cy']);
  assert.equal(ctx.game.state.currentPlayer, 0);
  ctx.act('remove_player', { index: 0 });
  assert.deepEqual(ctx.game.players, ['Ana', 'Cy']);
  assert.equal(ctx.game.state.currentPlayer, 0);
});

test('unknown actions are rejected', () => {
  const { game } = setup();
  assert.equal(game.dispatch('hasOwnProperty').ok, false);
  assert.equal(game.dispatch('nope').ok, false);
});
