/*
 * Game state machine. No I/O: the server feeds it actions and broadcasts the
 * views it produces. Timers, clock and randomness are injectable for tests.
 *
 * Views (what each screen is allowed to see):
 *   host     - everything, including the correct answer and the full bank
 *   display  - the current question only; the correct answer appears only
 *              once the dramatic reveal has played
 *   audience - question + options while a phone vote is open, never the answer
 */

const { sanitizeQuestions, cloneSample } = require('./questions');

// Classic 15-step ladder with safe havens at $1,000 and $32,000.
const FULL_LADDER = [
  100, 200, 300, 500, 1000,
  2000, 4000, 8000, 16000, 32000,
  64000, 125000, 250000, 500000, 1000000,
];
const FULL_SAFE_HAVENS = [4, 9];

const SUSPENSE_MS = 2500;   // pause after "Reveal Answer" before colours show
const WIN_DELAY_MS = 1200;  // green flash before the big win banner
const WRONG_HOLD_MS = 3200; // red flash before the Game Over screen
const PHONE_GRACE_MS = 2000; // how long "0" stays up before the timer closes
const MAX_PLAYERS = 50;
const MAX_BALLOTS = 5000;

/*
 * A short bank still finishes on the million: we keep the TOP rungs of the
 * ladder. Only the first 15 questions of a longer bank are played.
 */
function buildLadder(questionCount) {
  const n = Math.max(0, Math.min(questionCount, FULL_LADDER.length));
  const offset = FULL_LADDER.length - n;
  return {
    ladder: FULL_LADDER.slice(offset),
    safeHavens: FULL_SAFE_HAVENS.map((h) => h - offset).filter((h) => h >= 0 && h < n - 1),
  };
}

function tallyVotes(ballots) {
  const counts = [0, 0, 0, 0];
  for (const choice of Object.values(ballots)) {
    if (choice >= 0 && choice < 4) counts[choice]++;
  }
  return counts;
}

// Whole-number percentages that always sum to 100 (largest remainder method).
function votesToPercents(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return [0, 0, 0, 0];
  const raw = counts.map((c) => (c / total) * 100);
  const out = raw.map(Math.floor);
  let remainder = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) out[order[k].i]++;
  return out;
}

function normalizePercents(votes) {
  const clean = [0, 1, 2, 3].map((i) => Math.max(0, Number(votes && votes[i]) || 0));
  return votesToPercents(clean);
}

function freshPerQuestion() {
  return {
    questionVisible: false,
    answersRevealed: 0,   // how many answers (0-4) are on the big screen
    selectedAnswer: null, // host highlight, 0-3
    lockedAnswer: null,   // final answer, 0-3
    revealStage: 'none',  // 'none' | 'suspense' | 'revealed'
    removedAnswers: [],   // 50:50
    audience: { visible: false, votes: [0, 0, 0, 0] },
    phone: { active: false, endsAt: null, duration: 30 },
    vote: { open: false, ballots: {} },
  };
}

function freshGame(currentPlayer = 0) {
  return {
    phase: 'idle', // 'idle' | 'playing' | 'won' | 'lost' | 'walked'
    questionIndex: 0,
    currentPlayer,
    lifelines: { fifty: false, phone: false, audience: false }, // true = used
    banner: null,  // { kind: 'win' | 'lose' | 'walk', amount }
    ...freshPerQuestion(),
  };
}

function createGame(options = {}) {
  const timers = options.timers || { setTimeout, clearTimeout };
  const now = options.now || Date.now;
  const random = options.random || Math.random;
  const onChange = options.onChange || (() => {});
  const onQuestions = options.onQuestions || (() => {});

  let questions = options.questions ? sanitizeQuestions(options.questions) : cloneSample();
  let players = [];
  let state = freshGame();

  let revealToken = 0;
  let pending = [];

  function cancelTimers() {
    revealToken++;
    pending.forEach((t) => timers.clearTimeout(t));
    pending = [];
  }

  function later(ms, fn) {
    const token = revealToken;
    pending.push(timers.setTimeout(() => {
      if (token !== revealToken) return; // superseded by a newer action
      fn();
      onChange();
    }, ms));
  }

  const playable = () => Math.min(questions.length, FULL_LADDER.length);
  const ladderInfo = () => buildLadder(questions.length);
  const currentQuestion = () => questions[state.questionIndex];
  const isFinal = () => state.questionIndex === playable() - 1;

  function answeredCorrectly() {
    const q = currentQuestion();
    return state.revealStage === 'revealed' && q && state.lockedAnswer === q.correct;
  }

  function guaranteedAmount() {
    const { ladder, safeHavens } = ladderInfo();
    let amount = 0;
    for (const h of safeHavens) if (h < state.questionIndex) amount = ladder[h];
    return amount;
  }

  function walkAwayAmount() {
    const { ladder } = ladderInfo();
    if (answeredCorrectly()) return ladder[state.questionIndex];
    return state.questionIndex > 0 ? ladder[state.questionIndex - 1] : 0;
  }

  function goTo(index) {
    cancelTimers();
    Object.assign(state, freshPerQuestion());
    state.questionIndex = Math.max(0, Math.min(playable() - 1, index));
    state.banner = null;
    if (state.phase !== 'idle') state.phase = 'playing';
  }

  function generateAudienceVotes() {
    const correct = currentQuestion().correct;
    const options = [0, 1, 2, 3].filter((i) => !state.removedAnswers.includes(i));
    const votes = [0, 0, 0, 0];
    // The audience is more sure of itself on the easy questions.
    const confidence = 1 - state.questionIndex / Math.max(1, playable());
    let remaining = 100;
    votes[correct] = Math.round(30 + confidence * 35 + random() * 20);
    remaining -= votes[correct];
    const others = options.filter((i) => i !== correct);
    others.forEach((i, k) => {
      const v = k === others.length - 1 ? remaining : Math.floor(random() * (remaining + 1));
      votes[i] = v;
      remaining -= v;
    });
    if (remaining > 0) votes[correct] += remaining; // everything else was removed
    return votes;
  }

  const actions = {
    start_game() {
      cancelTimers();
      state = freshGame(state.currentPlayer);
      state.phase = 'playing';
    },
    reset_game() {
      cancelTimers();
      state = freshGame(state.currentPlayer);
    },
    goto_question(p) { goTo(p.index | 0); },
    next_question() { goTo(state.questionIndex + 1); },
    prev_question() { goTo(state.questionIndex - 1); },

    // ---- Hot seat ----
    add_player(p) {
      const name = String(p.name || '').trim().slice(0, 40);
      if (!name) throw new Error('player needs a name');
      if (players.length >= MAX_PLAYERS) throw new Error('too many players');
      players.push(name);
    },
    remove_player(p) {
      const i = p.index | 0;
      if (i < 0 || i >= players.length) return;
      players.splice(i, 1);
      if (i < state.currentPlayer) state.currentPlayer--;
      if (state.currentPlayer >= players.length) state.currentPlayer = 0;
    },
    move_player(p) {
      const i = p.index | 0;
      const j = i + (p.dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || i >= players.length || j >= players.length) return;
      [players[i], players[j]] = [players[j], players[i]];
      if (state.currentPlayer === i) state.currentPlayer = j;
      else if (state.currentPlayer === j) state.currentPlayer = i;
    },
    set_hot_seat(p) {
      const i = p.index | 0;
      if (i >= 0 && i < players.length) state.currentPlayer = i;
    },
    skip_player() {
      // The next player faces the SAME question at the same prize level.
      cancelTimers();
      if (players.length) state.currentPlayer = (state.currentPlayer + 1) % players.length;
      state.selectedAnswer = null;
      state.lockedAnswer = null;
      state.revealStage = 'none';
      state.banner = null;
      if (state.phase !== 'idle') state.phase = 'playing';
    },

    // ---- Question flow ----
    reveal_question() { state.questionVisible = true; },
    reveal_answers() {
      state.questionVisible = true;
      if (state.answersRevealed < 4) state.answersRevealed++;
    },
    reveal_all_answers() {
      state.questionVisible = true;
      state.answersRevealed = 4;
    },
    select_answer(p) {
      const i = p.index;
      if (!Number.isInteger(i) || i < 0 || i > 3) throw new Error('bad answer');
      if (state.lockedAnswer !== null || state.removedAnswers.includes(i)) return;
      state.selectedAnswer = state.selectedAnswer === i ? null : i;
    },
    lock_answer() {
      if (state.selectedAnswer !== null && state.lockedAnswer === null) {
        state.lockedAnswer = state.selectedAnswer;
      }
    },
    unlock_answer() {
      if (state.revealStage === 'none') state.lockedAnswer = null;
    },
    reveal_result() {
      if (state.lockedAnswer === null || state.revealStage !== 'none' || !currentQuestion()) return;
      cancelTimers();
      const correct = state.lockedAnswer === currentQuestion().correct;
      const final = isFinal();
      const { ladder } = ladderInfo();
      state.revealStage = 'suspense';
      state.banner = null;
      later(SUSPENSE_MS, () => { state.revealStage = 'revealed'; });
      if (correct && final) {
        later(SUSPENSE_MS + WIN_DELAY_MS, () => {
          state.phase = 'won';
          state.banner = { kind: 'win', amount: ladder[state.questionIndex] };
        });
      } else if (!correct) {
        later(SUSPENSE_MS + WRONG_HOLD_MS, () => {
          state.phase = 'lost';
          state.banner = { kind: 'lose', amount: guaranteedAmount() };
        });
      }
      // A non-final correct answer stays green until the host hits Next.
    },
    walk_away() {
      if (state.phase !== 'playing') return;
      cancelTimers();
      state.banner = { kind: 'walk', amount: walkAwayAmount() };
      state.phase = 'walked';
    },
    clear_banner() { state.banner = null; },

    // ---- Lifelines ----
    use_fifty() {
      if (state.lifelines.fifty || !currentQuestion()) return;
      state.lifelines.fifty = true;
      const correct = currentQuestion().correct;
      const wrong = [0, 1, 2, 3].filter((i) => i !== correct);
      for (let i = wrong.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
      }
      state.removedAnswers = wrong.slice(0, 2);
      if (state.removedAnswers.includes(state.selectedAnswer)) state.selectedAnswer = null;
    },
    use_phone(p) {
      if (state.lifelines.phone) return;
      const duration = Math.max(5, Math.min(120, p.duration | 0 || 30));
      state.lifelines.phone = true;
      state.phone = { active: true, duration, endsAt: now() + duration * 1000 };
      const endsAt = state.phone.endsAt;
      timers.setTimeout(() => {
        if (state.phone.endsAt !== endsAt || !state.phone.active) return;
        state.phone.active = false;
        onChange();
      }, duration * 1000 + PHONE_GRACE_MS);
    },
    stop_phone() { state.phone.active = false; },
    use_audience(p) {
      if (state.lifelines.audience || !currentQuestion()) return;
      state.lifelines.audience = true;
      state.audience = {
        visible: true,
        votes: p.votes ? normalizePercents(p.votes) : generateAudienceVotes(),
      };
    },
    show_audience() { if (state.lifelines.audience) state.audience.visible = true; },
    hide_audience() { state.audience.visible = false; },

    // ---- Live phone voting ----
    open_vote() {
      if (state.lifelines.audience && !state.vote.open) return;
      state.lifelines.audience = true;
      state.vote = { open: true, ballots: {} };
      state.audience = { visible: true, votes: [0, 0, 0, 0] }; // fills in live
    },
    close_vote() {
      if (!state.vote.open) return;
      state.vote.open = false;
      state.audience = { visible: true, votes: votesToPercents(tallyVotes(state.vote.ballots)) };
    },
    reset_vote() {
      state.vote.ballots = {};
      if (state.vote.open) state.audience.votes = [0, 0, 0, 0];
    },

    // ---- Question bank ----
    update_questions(p) {
      questions = sanitizeQuestions(p.questions);
      if (state.questionIndex >= playable()) goTo(playable() - 1);
      onQuestions(questions);
    },
    load_sample_questions() {
      questions = cloneSample();
      goTo(Math.min(state.questionIndex, playable() - 1));
      onQuestions(questions);
    },
  };

  function dispatch(type, payload = {}) {
    const fn = Object.prototype.hasOwnProperty.call(actions, type) ? actions[type] : null;
    if (!fn) return { ok: false, error: `unknown action "${type}"` };
    try {
      fn(payload && typeof payload === 'object' ? payload : {});
    } catch (err) {
      return { ok: false, error: err.message };
    }
    onChange();
    return { ok: true };
  }

  // From an audience phone. Kept apart from dispatch so phones can't drive the game.
  function castVote(voterId, choice) {
    if (!state.vote.open) return { ok: false, error: 'voting is closed' };
    const id = String(voterId || '').slice(0, 64);
    if (!id || !Number.isInteger(choice) || choice < 0 || choice > 3) return { ok: false, error: 'bad vote' };
    if (state.removedAnswers.includes(choice)) return { ok: false, error: 'that answer was removed' };
    const ballots = state.vote.ballots;
    if (!(id in ballots) && Object.keys(ballots).length >= MAX_BALLOTS) return { ok: false, error: 'vote is full' };
    ballots[id] = choice;
    state.audience.votes = votesToPercents(tallyVotes(ballots));
    onChange();
    return { ok: true };
  }

  function voteSummary() {
    const counts = tallyVotes(state.vote.ballots);
    return { counts, total: counts.reduce((a, b) => a + b, 0) };
  }

  function hostView() {
    const { counts, total } = voteSummary();
    const { vote, ...rest } = state;
    return {
      ...rest,
      vote: { open: vote.open },
      voteCounts: counts,
      voteTotal: total,
      questions,
      playableCount: playable(),
      players,
      ...ladderInfo(),
      serverTime: now(),
    };
  }

  function displayView() {
    const q = currentQuestion();
    const { total } = voteSummary();
    const revealed = state.revealStage === 'revealed';
    return {
      phase: state.phase,
      questionIndex: state.questionIndex,
      questionCount: playable(),
      ...ladderInfo(),
      players,
      currentPlayer: state.currentPlayer,
      lifelines: state.lifelines,
      banner: state.banner,
      questionVisible: state.questionVisible,
      answersRevealed: state.answersRevealed,
      selectedAnswer: state.selectedAnswer,
      lockedAnswer: state.lockedAnswer,
      revealStage: state.revealStage,
      removedAnswers: state.removedAnswers,
      audience: state.audience,
      phone: state.phone,
      vote: { open: state.vote.open, total },
      question: q ? {
        q: state.questionVisible ? q.q : '',
        a: q.a.map((text, i) => (i < state.answersRevealed ? text : '')),
        correct: revealed ? q.correct : null,
      } : null,
      serverTime: now(),
    };
  }

  function audienceView() {
    const q = currentQuestion();
    const open = state.vote.open && !!q;
    return {
      open,
      questionNumber: state.questionIndex + 1,
      question: open ? q.q : '',
      answers: open ? q.a : [],
      removed: state.removedAnswers,
      total: voteSummary().total,
      serverTime: now(),
    };
  }

  function view(role) {
    if (role === 'host') return hostView();
    if (role === 'display') return displayView();
    return audienceView();
  }

  return {
    dispatch,
    castVote,
    view,
    get state() { return state; },
    get questions() { return questions; },
    get players() { return players; },
  };
}

module.exports = {
  FULL_LADDER,
  FULL_SAFE_HAVENS,
  SUSPENSE_MS,
  WIN_DELAY_MS,
  WRONG_HOLD_MS,
  buildLadder,
  tallyVotes,
  votesToPercents,
  createGame,
};
