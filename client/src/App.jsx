import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useGameState } from './useGameState.js';
import MQAudio from './audio.js';
import {
  LifelineBar, QuestionCounter, PhoneRing, StageCallout, QuestionPlate,
  AnswerGrid, MoneyLadder, HotSeat, AudienceModal, PhoneModal, EndScreen,
  IntroScreen, IconSound, fmtMoney,
} from './components.jsx';

// Scale the fixed 1920×1080 stage to fit any viewport (letterboxed).
function useStageScaler() {
  useEffect(() => {
    const scale = () => {
      const c = document.getElementById('canvas');
      if (!c) return;
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      c.style.transform = `scale(${s})`;
    };
    scale();
    window.addEventListener('resize', scale);
    return () => window.removeEventListener('resize', scale);
  }, []);
}

export default function App() {
  const { state, connected } = useGameState();
  const [muted, setMuted] = useState(() => localStorage.getItem('mq-muted') === '1');
  const [flash, setFlash] = useState(null); // null | 'green' | 'red'

  useStageScaler();

  // Audio needs a user gesture to start; arm on first interaction.
  useEffect(() => {
    const arm = () => { MQAudio.arm(); MQAudio.setMuted(muted); window.removeEventListener('pointerdown', arm); window.removeEventListener('keydown', arm); };
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => { window.removeEventListener('pointerdown', arm); window.removeEventListener('keydown', arm); };
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      MQAudio.arm();
      MQAudio.setMuted(next);
      localStorage.setItem('mq-muted', next ? '1' : '0');
      return next;
    });
  }, []);

  // ---- Transition cues (compare against previous state) ----
  const prev = useRef(null);
  const droneStop = useRef(null);
  useEffect(() => {
    if (!state) return;
    const p = prev.current || {};
    try {

    if ((state.answersRevealed || 0) > (p.answersRevealed || 0)) MQAudio.reveal();
    if (state.lockedAnswer !== null && (p.lockedAnswer === null || p.lockedAnswer === undefined)) MQAudio.lockIn();

    // Suspense drone runs only during the dramatic pause.
    if (state.revealStage === 'suspense' && p.revealStage !== 'suspense') {
      if (droneStop.current) droneStop.current();
      droneStop.current = MQAudio.suspense();
    }
    if (state.revealStage !== 'suspense' && p.revealStage === 'suspense' && droneStop.current) {
      droneStop.current(); droneStop.current = null;
    }

    // Colours flash in.
    if (state.revealStage === 'revealed' && p.revealStage !== 'revealed') {
      const q = state.questions[state.questionIndex];
      const isFinal = state.questionIndex === state.questions.length - 1;
      const correct = q && state.lockedAnswer === q.correct;
      if (correct) MQAudio[isFinal ? 'win' : 'correct']();
      else MQAudio.wrong();
      setFlash(correct ? 'green' : 'red');
      setTimeout(() => setFlash(null), 650);
    }

    const ll = state.lifelines || {}, pll = p.lifelines || {};
    if ((ll.fifty && !pll.fifty) || (ll.phone && !pll.phone) || (ll.audience && !pll.audience)) MQAudio.lifeline();

    if (p.currentPlayer !== undefined && state.currentPlayer !== p.currentPlayer) MQAudio.seat();

    } catch (_) { /* audio is best-effort; never let it break rendering */ }
    prev.current = state;
  }, [state]);

  if (!state) {
    return (
      <>
        <div className={'connection' + (connected ? '' : ' bad')}>
          <span className="dot" /> connecting…
        </div>
        <div id="canvas"><IntroScreen /></div>
      </>
    );
  }

  const q = state.questions[state.questionIndex];
  const phase = state.phase;
  const phoneLive = state.phone && state.phone.active && state.phone.endsAt;

  return (
    <>
      <div className={'connection' + (connected ? '' : ' bad')}>
        <span className="dot" /> {connected ? 'live' : 'reconnecting…'}
      </div>

      <div id="canvas">
        <div className="bg-layer bg-grid" />
        <div className="bg-layer bg-beams" />
        <div className="bg-layer bg-floor" />
        <div className="bg-layer bg-vignette" />

        {/* ===== MAIN AREA ===== */}
        <div className="main-area">
          <div className="topbar">
            <LifelineBar lifelines={state.lifelines} />
            {phoneLive
              ? <PhoneRing seconds={Math.max(0, Math.ceil((state.phone.endsAt - Date.now()) / 1000))} total={state.phone.duration || 30} />
              : <QuestionCounter index={state.questionIndex} total={state.questions.length} />}
          </div>

          <div className="stage-center">
            <StageCallout state={state} q={q} />
          </div>

          {q && (
            <div className="qa-block">
              <QuestionPlate text={state.questionVisible ? q.q : ''} />
              <AnswerGrid state={state} q={q} />
            </div>
          )}

          {flash && <div className={'area-flash ' + flash} />}
        </div>

        {/* ===== LADDER PANEL ===== */}
        <div className="ladder-panel">
          <button className="sound-toggle" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
            <IconSound muted={muted} />
          </button>
          <div className="brand">
            <div className="b-top">
              <span className="b-diamond" />
              <span className="b-name">FINAL ANSWER</span>
              <span className="b-diamond" />
            </div>
            <div className="b-sub">Play for a Million</div>
          </div>
          <HotSeat players={state.players || []} currentPlayer={state.currentPlayer} />
          <MoneyLadder state={state} />
        </div>

        {/* ===== MODALS / OVERLAYS ===== */}
        {state.audience && state.audience.visible && (
          <AudienceModal
            votes={state.audience.votes}
            removed={state.removedAnswers}
            live={!!(state.vote && state.vote.open)}
            total={state.voteTotal || 0}
          />
        )}
        {phoneLive && (
          <PhoneModal endsAt={state.phone.endsAt} duration={state.phone.duration || 30} onTick={() => MQAudio.tick()} />
        )}

        {phase === 'idle' && <IntroScreen />}
        {(phase === 'won' || phase === 'lost' || phase === 'walked') && state.banner && (
          <EndScreen banner={state.banner} />
        )}
      </div>
    </>
  );
}
