import React, { useEffect, useMemo, useRef, useState } from 'react';

export const LETTERS = ['A', 'B', 'C', 'D'];
export const fmtMoney = (n) => '$' + Number(n).toLocaleString('en-US');

/* ---------- Icons (basic shapes only) ---------- */
export function IconAudience() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#f6cd5b" strokeWidth="2.4" strokeLinecap="round">
      <rect x="4" y="18" width="5" height="10" rx="1" fill="#f6cd5b" stroke="none" />
      <rect x="13.5" y="11" width="5" height="17" rx="1" fill="#f6cd5b" stroke="none" />
      <rect x="23" y="6" width="5" height="22" rx="1" fill="#f6cd5b" stroke="none" />
    </svg>
  );
}
export function IconPhone() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#f6cd5b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5.5c-2 0-3.2 1.6-3 3.6.9 8.4 7.5 15 15.9 15.9 2 .2 3.6-1 3.6-3v-3.1c0-1-.7-1.9-1.7-2.1l-3.2-.7c-.9-.2-1.8.2-2.2 1l-.8 1.6c-2.6-1.3-4.7-3.4-6-6l1.6-.8c.8-.4 1.2-1.3 1-2.2l-.7-3.2c-.2-1-1.1-1.7-2.1-1.7H9z" fill="#f6cd5b" stroke="none" />
    </svg>
  );
}
export function IconSound({ muted }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
      {muted
        ? <g><line x1="16" y1="9" x2="21" y2="14" /><line x1="21" y1="9" x2="16" y2="14" /></g>
        : <g><path d="M16 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a8 8 0 0 1 0 12" /></g>}
    </svg>
  );
}

/* ---------- Lifeline bar (read-only; reflects used state) ---------- */
export function LifelineBar({ lifelines }) {
  const items = [
    { key: 'fifty', label: 'Fifty-Fifty', node: <span className="ll-text">50:50</span> },
    { key: 'audience', label: 'Audience', node: <IconAudience /> },
    { key: 'phone', label: 'Phone', node: <IconPhone /> },
  ];
  return (
    <div className="lifelines">
      {items.map((it) => (
        <div key={it.key} className={'lifeline' + (lifelines[it.key] ? ' used' : '')}>
          <span className="lifeline-badge">{it.node}</span>
          <span className="lifeline-label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Question counter (top-right) ---------- */
export function QuestionCounter({ index, total }) {
  return (
    <div className="q-counter">
      <div className="qc-label">Question</div>
      <div className="qc-num"><b>{index + 1}</b> / {total}</div>
    </div>
  );
}

/* ---------- Phone-a-friend countdown ring (top-right while live) ---------- */
export function PhoneRing({ seconds, total }) {
  const r = 46, c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, seconds / total));
  const low = seconds <= 5;
  return (
    <div className="timer-wrap">
      <div className={'timer-ring' + (low ? ' low' : '')}>
        <svg width="104" height="104">
          <circle cx="52" cy="52" r={r} stroke="rgba(120,170,240,0.18)" strokeWidth="7" fill="none" />
          <circle
            cx="52" cy="52" r={r}
            stroke={low ? '#ec4b4b' : '#f6cd5b'} strokeWidth="7" fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="timer-num">{Math.max(0, Math.ceil(seconds))}</div>
      </div>
      <div className="timer-label">Phone</div>
    </div>
  );
}

/* ---------- Stage centre callout ---------- */
export function StageCallout({ state, q }) {
  const { questionIndex, ladder, safeHavens, selectedAnswer, lockedAnswer, revealStage } = state;
  const level = questionIndex + 1;

  if (revealStage === 'revealed' && q) {
    const correct = lockedAnswer === q.correct;
    const label = correct ? 'Correct' : (lockedAnswer == null ? 'No Answer' : 'Incorrect');
    return (
      <div className="prize-callout">
        <div className="pc-label">{label}</div>
        <div className="pc-amount" style={{ color: correct ? 'var(--green)' : 'var(--red)', fontSize: '72px' }}>
          {LETTERS[q.correct]}
        </div>
        <div className="pc-sub">{q.a[q.correct]}</div>
      </div>
    );
  }

  if (lockedAnswer != null) {
    return (
      <div className="prize-callout">
        <div className="pc-label">Locked In</div>
        <div className="pc-amount" style={{ fontSize: '60px' }}>{LETTERS[lockedAnswer]}</div>
        <div className="pc-sub">Is that your final answer?</div>
      </div>
    );
  }

  const safe = safeHavens.includes(questionIndex);
  return (
    <div className="prize-callout">
      <div className="pc-label">Question {level} for</div>
      <div className="pc-amount">{fmtMoney(ladder[questionIndex])}</div>
      <div className="pc-sub">{safe ? 'Safe Haven ♦ Lock it in' : 'Read carefully…'}</div>
    </div>
  );
}

/* ---------- Question plate ---------- */
export function QuestionPlate({ text }) {
  return (
    <div className="question-plate-outer">
      <div className="hexplate question-plate">{text}</div>
    </div>
  );
}

/* ---------- Answer grid (server-driven states) ---------- */
export function AnswerGrid({ state, q }) {
  const { answersRevealed, selectedAnswer, lockedAnswer, revealStage, removedAnswers } = state;
  const revealed = revealStage === 'revealed';
  return (
    <div className="answers">
      {q.a.map((txt, i) => {
        let cls = 'answer-outer';
        if (removedAnswers.includes(i)) cls += ' hidden5050';
        else if (i >= answersRevealed) cls += ' not-revealed';

        if (revealed) {
          if (i === q.correct) cls += ' correct';
          else if (lockedAnswer === i) cls += ' wrong';
          else cls += ' dimmed';
        } else if (lockedAnswer === i) {
          cls += ' selected locked';
        } else if (selectedAnswer === i) {
          cls += ' selected';
        }

        return (
          <div key={i} className={cls}>
            <div className="answer">
              <span className="letter">{LETTERS[i]}</span>
              <span className="atext">{txt}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Money ladder ---------- */
export function MoneyLadder({ state }) {
  const { ladder, safeHavens, questionIndex, phase } = state;
  const won = phase === 'won';
  return (
    <div className="ladder">
      {ladder.map((amount, i) => {
        let cls = 'rung';
        if (safeHavens.includes(i)) cls += ' safe';
        if (won) cls += ' passed';
        else if (i < questionIndex) cls += ' passed';
        if (!won && i === questionIndex && phase === 'playing') cls += ' current';
        return (
          <div key={i} className={cls}>
            <span className="r-num">{i + 1}</span>
            <span className="r-amt">{fmtMoney(amount)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Hot seat ---------- */
export function HotSeat({ players, currentPlayer }) {
  const name = players[currentPlayer] || players[0];
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('hs-flash');
    void el.offsetWidth; // restart animation
    el.classList.add('hs-flash');
  }, [name]);
  if (!players.length) return null;
  return (
    <div className="hotseat">
      <span className="hs-label">In the hot seat</span>
      <span className="hs-name" ref={ref}>{name}</span>
    </div>
  );
}

/* ---------- Ask the Audience modal ---------- */
export function AudienceModal({ votes, removed, live, total }) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-title">Ask the Audience</div>
        <div className="modal-sub">{live ? `Voting live — ${total} ${total === 1 ? 'vote' : 'votes'} in` : 'The studio audience has voted'}</div>
        <div className="poll">
          {LETTERS.map((L, i) => {
            if (removed.includes(i)) return null;
            const p = votes[i] || 0;
            return (
              <div className="poll-col" key={i}>
                <div className="poll-pct">{p}%</div>
                <div className="poll-bar-track">
                  <div className="poll-bar" style={{ height: p + '%' }} />
                </div>
                <div className="poll-letter">{L}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Phone a Friend overlay (countdown) ---------- */
export function PhoneModal({ endsAt, duration, onTick }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const update = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecs((prev) => {
        if (left !== prev && left <= 5 && left > 0 && onTick) onTick();
        return left;
      });
    };
    update();
    const id = setInterval(update, 250);
    return () => clearInterval(id);
  }, [endsAt, onTick]);
  const low = secs <= 5;
  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-title">Phone a Friend</div>
        <div className="modal-sub">{secs > 0 ? 'The clock is running' : 'Time’s up — make your call'}</div>
        <div className="phone-body">
          <div className="friend-portrait">
            <span>[ CALLER PHOTO ]</span>
            <span style={{ opacity: 0.6 }}>drop portrait here</span>
          </div>
          <div className="friend-side">
            <div className="friend-name">Your Lifeline</div>
            <div className="friend-role">On the line</div>
            <div className="friend-speech">
              Read them the question and the four options, then talk it through before the timer runs out.
            </div>
          </div>
        </div>
        <div className={'phone-count' + (low ? ' low' : '')}>
          {'00:' + String(Math.min(99, secs)).padStart(2, '0')}
        </div>
      </div>
    </div>
  );
}

/* ---------- Confetti ---------- */
export function Confetti() {
  const bits = useMemo(() => {
    const cols = ['#f6cd5b', '#34d17a', '#4aa3ff', '#fff', '#e0a92e'];
    return Array.from({ length: 70 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 3,
      dur: 3 + Math.random() * 3,
      col: cols[i % cols.length],
      rot: Math.random() * 360,
    }));
  }, []);
  return (
    <div className="confetti">
      {bits.map((b, i) => (
        <i key={i} style={{
          left: b.left + '%', background: b.col,
          animationDelay: b.delay + 's', animationDuration: b.dur + 's',
          transform: `rotate(${b.rot}deg)`,
        }} />
      ))}
    </div>
  );
}

/* ---------- End screen (win / lose / walk) ---------- */
export function EndScreen({ banner }) {
  const kind = banner.kind; // 'win' | 'lose' | 'walk'
  const win = kind === 'win';
  const label = win ? 'Winner' : kind === 'walk' ? 'Walked Away' : 'Game Over';
  const note = win
    ? 'A perfect run to the top of the ladder — one million dollars.'
    : kind === 'walk'
      ? 'You took the money and left the hot seat on your own terms.'
      : banner.amount > 0
        ? 'You leave with your guaranteed safe-haven winnings.'
        : 'No safe haven reached this time — but the hot seat awaits a rematch.';
  return (
    <div className="screen">
      {win && <Confetti />}
      <div className={'end-label ' + (win ? 'win' : kind === 'walk' ? 'walk' : 'lose')}>{label}</div>
      <div className={'end-amount ' + (win ? 'win' : 'lose')}>{fmtMoney(banner.amount)}</div>
      <div className="end-note">{note}</div>
    </div>
  );
}

/* ---------- Intro / waiting screen ---------- */
export function IntroScreen() {
  return (
    <div className="screen">
      <div className="screen-logo">
        <div className="sl-name">
          <span>MILLION</span>
          <span>DOLLAR</span>
          <span className="sl-q">QUESTION</span>
        </div>
        <div className="sl-sub">Game Night</div>
      </div>
      <div className="screen-tag">
        Fifteen questions stand between the hot seat and one million dollars.
        Three lifelines. Two safe havens. How far will your nerve take you?
      </div>
      <div className="screen-wait">Waiting for the host…</div>
    </div>
  );
}
