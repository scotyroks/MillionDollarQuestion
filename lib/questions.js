/*
 * Question bank: built-in sample set, validation and persistence.
 * A question is { q: string, a: [4 strings], correct: 0-3 }.
 */

const fs = require('fs');

const MAX_QUESTIONS = 100;
const MAX_TEXT = 300;

// Ordered easy → hard so difficulty ramps up the prize ladder.
const SAMPLE_QUESTIONS = [
  { q: 'How many days are there in a week?',
    a: ['Five', 'Six', 'Seven', 'Eight'], correct: 2 },
  { q: 'What colour do you get by mixing blue and yellow?',
    a: ['Red', 'Green', 'Purple', 'Orange'], correct: 1 },
  { q: 'Which animal is commonly known as "man\'s best friend"?',
    a: ['Cat', 'Dog', 'Horse', 'Rabbit'], correct: 1 },
  { q: 'How many sides does a triangle have?',
    a: ['Two', 'Three', 'Four', 'Five'], correct: 1 },
  { q: 'What is the capital city of France?',
    a: ['London', 'Berlin', 'Paris', 'Madrid'], correct: 2 },
  { q: 'How many continents are there on Earth?',
    a: ['Five', 'Six', 'Seven', 'Eight'], correct: 2 },
  { q: 'Who wrote the play "Romeo and Juliet"?',
    a: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'], correct: 1 },
  { q: 'Which element has the chemical symbol "Na"?',
    a: ['Nitrogen', 'Sodium', 'Neon', 'Nickel'], correct: 1 },
  { q: 'In which year did the Second World War end?',
    a: ['1943', '1945', '1947', '1950'], correct: 1 },
  { q: 'Who painted the ceiling of the Sistine Chapel?',
    a: ['Leonardo da Vinci', 'Raphael', 'Michelangelo', 'Donatello'], correct: 2 },
  { q: 'Which is the smallest country in the world by land area?',
    a: ['Monaco', 'Nauru', 'Vatican City', 'San Marino'], correct: 2 },
  { q: 'Which classic novel opens with the line "Call me Ishmael"?',
    a: ['Moby-Dick', 'The Great Gatsby', 'War and Peace', 'Ulysses'], correct: 0 },
  { q: 'What is the chemical symbol for the element tungsten?',
    a: ['W', 'Tu', 'Tg', 'Tn'], correct: 0 },
  { q: 'In which year was the Magna Carta sealed by King John of England?',
    a: ['1066', '1215', '1314', '1492'], correct: 1 },
  { q: 'Who was the Roman emperor when Mount Vesuvius erupted and buried Pompeii in 79 AD?',
    a: ['Nero', 'Titus', 'Augustus', 'Hadrian'], correct: 1 },
];

function cloneSample() {
  return SAMPLE_QUESTIONS.map((q) => ({ q: q.q, a: q.a.slice(), correct: q.correct }));
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

// Returns a cleaned question, or null if it isn't usable.
function sanitizeQuestion(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.a) || raw.a.length !== 4) return null;
  const q = cleanText(raw.q);
  const a = raw.a.map(cleanText);
  const correct = Number(raw.correct);
  if (!q || a.some((x) => !x)) return null;
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) return null;
  return { q, a, correct };
}

// Cleans a whole bank. Throws if anything is invalid so bad edits never land.
function sanitizeQuestions(list) {
  if (!Array.isArray(list)) throw new Error('questions must be an array');
  if (!list.length) throw new Error('need at least one question');
  if (list.length > MAX_QUESTIONS) throw new Error(`at most ${MAX_QUESTIONS} questions`);
  return list.map((raw, i) => {
    const q = sanitizeQuestion(raw);
    if (!q) throw new Error(`question ${i + 1} needs text, 4 answers and a correct answer`);
    return q;
  });
}

// Loads the bank, skipping broken entries. Never overwrites a file it can't
// read: that gets backed up first so hand edits are never lost.
function loadQuestions(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`  ! ${file} couldn't be read (${err.message}). Backed it up to ${file}.bak; using sample questions.`);
      try { fs.copyFileSync(file, file + '.bak'); } catch (_) { /* best effort */ }
    }
    raw = null;
  }
  const list = Array.isArray(raw) ? raw.slice(0, MAX_QUESTIONS).map(sanitizeQuestion) : [];
  const good = list.filter(Boolean);
  if (good.length) {
    if (good.length < list.length) console.warn(`  ! skipped ${list.length - good.length} incomplete question(s) in ${file}`);
    return good;
  }
  if (Array.isArray(raw)) {
    console.warn(`  ! no usable questions in ${file}. Backed it up to ${file}.bak; using sample questions.`);
    try { fs.copyFileSync(file, file + '.bak'); } catch (_) { /* best effort */ }
  }
  const sample = cloneSample();
  saveQuestions(file, sample);
  return sample;
}

function saveQuestions(file, questions) {
  try {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(questions, null, 2));
    fs.renameSync(tmp, file); // atomic, so a crash never leaves half a file
  } catch (err) {
    console.error('  ! could not save questions:', err.message);
  }
}

module.exports = {
  MAX_QUESTIONS,
  SAMPLE_QUESTIONS,
  cloneSample,
  sanitizeQuestion,
  sanitizeQuestions,
  loadQuestions,
  saveQuestions,
};
