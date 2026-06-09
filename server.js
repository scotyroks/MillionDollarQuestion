/*
 * Who Wants to Be a Millionaire — game night server
 * Pure Node.js, zero dependencies. Run with: node server.js
 *
 * Sync model:
 *   - GET  /events   -> Server-Sent Events stream, pushes full game state
 *   - POST /action   -> { type, payload } mutates state, broadcasts to all
 *   - Questions persist to questions.json
 *
 * Two screens:
 *   - /host     control panel (faces the host)
 *   - /display  big screen     (faces the contestant / room)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');

// Classic 15-step money ladder. Safe havens at index 4 and 9.
const LADDER = [
  100, 200, 300, 500, 1000,
  2000, 4000, 8000, 16000, 32000,
  64000, 125000, 250000, 500000, 1000000,
];
const SAFE_HAVENS = [4, 9]; // indexes guaranteed once passed

// ---- Questions persistence -------------------------------------------------

const SAMPLE_QUESTIONS = [
  { q: 'Which planet is known as the Red Planet?',
    a: ['Venus', 'Mars', 'Jupiter', 'Mercury'], correct: 1 },
  { q: 'What is the largest mammal in the world?',
    a: ['African Elephant', 'Blue Whale', 'Giraffe', 'Polar Bear'], correct: 1 },
  { q: 'In which year did the first manned Moon landing take place?',
    a: ['1965', '1969', '1972', '1958'], correct: 1 },
  { q: 'What is the chemical symbol for gold?',
    a: ['Gd', 'Go', 'Au', 'Ag'], correct: 2 },
  { q: 'Who painted the Mona Lisa?',
    a: ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Donatello'], correct: 2 },
  { q: 'How many strings does a standard violin have?',
    a: ['Four', 'Five', 'Six', 'Seven'], correct: 0 },
  { q: 'Which country hosted the 2016 Summer Olympics?',
    a: ['China', 'Brazil', 'UK', 'Russia'], correct: 1 },
  { q: 'What is the hardest natural substance on Earth?',
    a: ['Gold', 'Iron', 'Diamond', 'Quartz'], correct: 2 },
  { q: 'Which gas do plants absorb from the atmosphere?',
    a: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'], correct: 2 },
  { q: 'Who wrote the play "Romeo and Juliet"?',
    a: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'], correct: 1 },
  { q: 'What is the smallest prime number?',
    a: ['0', '1', '2', '3'], correct: 2 },
  { q: 'Which ocean is the largest by surface area?',
    a: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3 },
  { q: 'The Great Wall is located in which country?',
    a: ['Japan', 'India', 'China', 'Mongolia'], correct: 2 },
  { q: 'How many sides does a hexagon have?',
    a: ['Five', 'Six', 'Seven', 'Eight'], correct: 1 },
  { q: 'Which element has the atomic number 1?',
    a: ['Helium', 'Oxygen', 'Hydrogen', 'Carbon'], correct: 2 },
];

function loadQuestions() {
  try {
    const raw = fs.readFileSync(QUESTIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (_) { /* fall through to sample */ }
  saveQuestions(SAMPLE_QUESTIONS);
  return SAMPLE_QUESTIONS.slice();
}

function saveQuestions(questions) {
  try {
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questions, null, 2));
  } catch (err) {
    console.error('Could not save questions:', err.message);
  }
}

// ---- Game state ------------------------------------------------------------

let questions = loadQuestions();

function freshPerQuestion() {
  return {
    questionVisible: false,
    answersRevealed: false,
    selectedAnswer: null, // host highlight (orange), letter index 0-3
    lockedAnswer: null,   // locked in (pulsing), letter index 0-3
    resultRevealed: false,
    removedAnswers: [],   // 50:50 removed option indexes
    audience: { visible: false, votes: [0, 0, 0, 0] },
    phone: { active: false, endsAt: null, duration: 30 },
    vote: { open: false, ballots: {} }, // live phone voting: voterId -> choice index
  };
}

// Tally live ballots into [countA, countB, countC, countD]
function tallyVotes(ballots) {
  const counts = [0, 0, 0, 0];
  for (const choice of Object.values(ballots)) {
    if (choice >= 0 && choice < 4) counts[choice]++;
  }
  return counts;
}

// Convert raw counts into whole-number percentages summing to 100
function votesToPercents(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return [0, 0, 0, 0];
  const raw = counts.map((c) => (c / total) * 100);
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  // Hand out leftover points to the largest fractional parts
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++) {
    floored[order[k].i]++;
    remainder--;
  }
  return floored;
}

function freshGame() {
  return Object.assign({
    phase: 'idle',          // 'idle' (intro) | 'playing' | 'won' | 'lost' | 'walked'
    questionIndex: 0,
    lifelines: { fifty: false, phone: false, audience: false }, // true = used up
    banner: null,           // { kind: 'win'|'lose'|'walk', amount }
  }, freshPerQuestion());
}

let state = freshGame();

function ladderInfo() {
  return { ladder: LADDER, safeHavens: SAFE_HAVENS };
}

function guaranteedAmount(index) {
  // Highest safe haven strictly below the current index
  let amount = 0;
  for (const h of SAFE_HAVENS) {
    if (h < index) amount = LADDER[h];
  }
  return amount;
}

function fullState() {
  const counts = tallyVotes(state.vote.ballots);
  return {
    ...state,
    questions,
    ...ladderInfo(),
    voteCounts: counts,
    voteTotal: counts.reduce((a, b) => a + b, 0),
    serverTime: Date.now(),
  };
}

// ---- SSE clients -----------------------------------------------------------

const clients = new Set();

function broadcast() {
  const data = `data: ${JSON.stringify(fullState())}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch (_) { /* dropped */ }
  }
}

// ---- Actions ---------------------------------------------------------------

function handleAction(type, payload) {
  switch (type) {
    case 'start_game':
      state = freshGame();
      state.phase = 'playing';
      break;

    case 'reset_game':
      state = freshGame();
      break;

    case 'goto_question': {
      const idx = Math.max(0, Math.min(questions.length - 1, payload.index | 0));
      Object.assign(state, freshPerQuestion());
      state.questionIndex = idx;
      state.phase = 'playing';
      state.banner = null;
      break;
    }

    case 'next_question': {
      const idx = Math.min(questions.length - 1, state.questionIndex + 1);
      Object.assign(state, freshPerQuestion());
      state.questionIndex = idx;
      state.banner = null;
      break;
    }

    case 'prev_question': {
      const idx = Math.max(0, state.questionIndex - 1);
      Object.assign(state, freshPerQuestion());
      state.questionIndex = idx;
      state.banner = null;
      break;
    }

    case 'reveal_question':
      state.questionVisible = true;
      break;

    case 'reveal_answers':
      state.questionVisible = true;
      state.answersRevealed = true;
      break;

    case 'select_answer':
      if (!state.resultRevealed) state.selectedAnswer = payload.index;
      break;

    case 'lock_answer':
      if (state.selectedAnswer !== null && !state.resultRevealed) {
        state.lockedAnswer = state.selectedAnswer;
      }
      break;

    case 'reveal_result': {
      if (state.lockedAnswer === null) break;
      state.resultRevealed = true;
      const correctIdx = questions[state.questionIndex].correct;
      if (state.lockedAnswer === correctIdx) {
        const isFinal = state.questionIndex === questions.length - 1;
        state.banner = {
          kind: isFinal ? 'win' : 'correct',
          amount: LADDER[state.questionIndex],
        };
        if (isFinal) state.phase = 'won';
      } else {
        state.phase = 'lost';
        state.banner = { kind: 'lose', amount: guaranteedAmount(state.questionIndex) };
      }
      break;
    }

    case 'walk_away':
      state.phase = 'walked';
      state.resultRevealed = true;
      state.banner = {
        kind: 'walk',
        amount: state.questionIndex > 0 ? LADDER[state.questionIndex - 1] : 0,
      };
      break;

    case 'clear_banner':
      state.banner = null;
      break;

    case 'use_fifty': {
      if (state.lifelines.fifty) break;
      state.lifelines.fifty = true;
      const correctIdx = questions[state.questionIndex].correct;
      const wrong = [0, 1, 2, 3].filter((i) => i !== correctIdx);
      // shuffle wrong, keep two removed
      for (let i = wrong.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
      }
      state.removedAnswers = wrong.slice(0, 2);
      break;
    }

    case 'use_phone':
      if (state.lifelines.phone) break;
      state.lifelines.phone = true;
      state.phone = {
        active: true,
        duration: payload.duration || 30,
        endsAt: Date.now() + (payload.duration || 30) * 1000,
      };
      break;

    case 'stop_phone':
      state.phone.active = false;
      break;

    case 'use_audience':
      if (state.lifelines.audience) break;
      state.lifelines.audience = true;
      state.audience = { visible: true, votes: payload.votes || generateAudienceVotes() };
      break;

    case 'set_audience_votes':
      state.audience.votes = payload.votes;
      state.audience.visible = true;
      break;

    case 'hide_audience':
      state.audience.visible = false;
      break;

    // ---- Live phone voting (Ask the Audience) ----
    case 'open_vote':
      state.lifelines.audience = true;
      state.vote = { open: true, ballots: {} };
      state.audience = { visible: true, votes: [0, 0, 0, 0] }; // chart fills live
      break;

    case 'close_vote':
      state.vote.open = false;
      state.audience.visible = true;
      state.audience.votes = votesToPercents(tallyVotes(state.vote.ballots));
      break;

    case 'cast_vote': {
      // From an audience phone. Only counts while voting is open.
      if (!state.vote.open) break;
      const { voterId } = payload;
      const choice = payload.choice | 0;
      if (!voterId || choice < 0 || choice > 3) break;
      if (state.removedAnswers.includes(choice)) break; // can't vote a 50:50'd option
      state.vote.ballots[voterId] = choice;
      // Keep the live chart in sync as votes arrive
      if (state.audience.visible) {
        state.audience.votes = votesToPercents(tallyVotes(state.vote.ballots));
      }
      break;
    }

    case 'reset_vote':
      state.vote = { open: false, ballots: {} };
      break;

    case 'update_questions':
      if (Array.isArray(payload.questions)) {
        questions = payload.questions;
        saveQuestions(questions);
        if (state.questionIndex >= questions.length) {
          state.questionIndex = Math.max(0, questions.length - 1);
        }
      }
      break;

    default:
      return false;
  }
  broadcast();
  return true;
}

function generateAudienceVotes() {
  // Plausible audience lean toward the correct answer
  const correctIdx = questions[state.questionIndex].correct;
  const votes = [0, 0, 0, 0];
  let remaining = 100;
  const main = 45 + Math.floor(Math.random() * 35); // 45-79
  votes[correctIdx] = main;
  remaining -= main;
  const others = [0, 1, 2, 3].filter((i) => i !== correctIdx);
  for (let i = 0; i < others.length; i++) {
    if (i === others.length - 1) votes[others[i]] = remaining;
    else {
      const v = Math.floor(Math.random() * (remaining + 1));
      votes[others[i]] = v;
      remaining -= v;
    }
  }
  return votes;
}

// ---- HTTP server -----------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // SSE stream
  if (pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(fullState())}\n\n`);
    clients.add(res);
    const keepAlive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) {}
    }, 20000);
    req.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(res);
    });
    return;
  }

  // Actions
  if (pathname === '/action' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const { type, payload } = JSON.parse(body || '{}');
        const ok = handleAction(type, payload || {});
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Sanitised poll snapshot for audience phones (never exposes the correct answer)
  if (pathname === '/poll' && req.method === 'GET') {
    const q = questions[state.questionIndex];
    const counts = tallyVotes(state.vote.ballots);
    const snapshot = {
      open: state.vote.open,
      questionNumber: state.questionIndex + 1,
      question: q ? q.q : '',
      answers: q ? q.a : ['', '', '', ''],
      removed: state.removedAnswers,
      total: counts.reduce((a, b) => a + b, 0),
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(snapshot));
    return;
  }

  // Routes
  if (pathname === '/' || pathname === '/host') return serveFile(res, path.join(PUBLIC_DIR, 'host.html'));
  if (pathname === '/display') return serveFile(res, path.join(PUBLIC_DIR, 'display.html'));
  if (pathname === '/vote') return serveFile(res, path.join(PUBLIC_DIR, 'vote.html'));

  // Static files (sanitised)
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  const nets = require('os').networkInterfaces();
  let lan = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { lan = net.address; break; }
    }
  }
  console.log('\n  Who Wants to Be a Millionaire — game night\n');
  console.log(`  Host screen     : http://${lan}:${PORT}/host`);
  console.log(`  Contestant view : http://${lan}:${PORT}/display`);
  console.log(`  Audience phones : http://${lan}:${PORT}/vote`);
  console.log(`  (local)         : http://localhost:${PORT}/host\n`);
});
