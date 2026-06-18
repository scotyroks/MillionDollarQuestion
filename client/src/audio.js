// Procedural audio cues (Web Audio) — no external files.
// Ported from the "Final Answer" design's mq-audio.js and extended with the
// transition cues this host-driven display needs (answer reveal, ticks, etc.).
// Audio can only start after a user gesture, so the display arms it on first
// click/keypress.

let ctx = null;
let master = null;
let muted = false;
let droneNodes = null;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, t0, dur, type, peak, glideTo) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const MQAudio = {
  arm() { ensure(); },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
  },
  isMuted() { return muted; },

  click() { ensure(); tone(420, ctx.currentTime, 0.06, 'square', 0.12); },

  reveal() { // an answer slides onto the board
    ensure();
    const t = ctx.currentTime;
    tone(440, t, 0.18, 'triangle', 0.14);
    tone(660, t + 0.05, 0.16, 'triangle', 0.1);
  },

  lifeline() {
    ensure();
    const t = ctx.currentTime;
    tone(660, t, 0.14, 'triangle', 0.18);
    tone(990, t + 0.08, 0.18, 'triangle', 0.16);
  },

  lockIn() {
    ensure();
    const t = ctx.currentTime;
    tone(180, t, 0.5, 'sine', 0.3, 90);
    tone(240, t, 0.5, 'sine', 0.18, 120);
  },

  tick() { ensure(); tone(1000, ctx.currentTime, 0.05, 'square', 0.09); },

  seat() { // hot seat passes to a new player
    ensure();
    const t = ctx.currentTime;
    tone(523.25, t, 0.16, 'triangle', 0.16);
    tone(392, t + 0.1, 0.18, 'triangle', 0.14);
  },

  // Looping suspense drone; returns a stop() fn
  suspense() {
    ensure();
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'sine';
    o1.frequency.value = 73.42; // low D
    o2.frequency.value = 110;   // A
    lfo.frequency.value = 0.5;
    lfoG.gain.value = 0.05;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
    o1.start(t); o2.start(t); lfo.start(t);
    droneNodes = { o1, o2, lfo, g };
    return function stop() {
      if (!droneNodes) return;
      const tt = ctx.currentTime;
      droneNodes.g.gain.cancelScheduledValues(tt);
      droneNodes.g.gain.setTargetAtTime(0.0001, tt, 0.08);
      const n = droneNodes;
      setTimeout(() => { try { n.o1.stop(); n.o2.stop(); n.lfo.stop(); } catch (e) {} }, 400);
      droneNodes = null;
    };
  },

  correct() {
    ensure();
    const t = ctx.currentTime;
    tone(523.25, t, 0.18, 'triangle', 0.3);
    tone(659.25, t + 0.12, 0.22, 'triangle', 0.3);
    tone(783.99, t + 0.26, 0.5, 'triangle', 0.32);
  },

  wrong() {
    ensure();
    const t = ctx.currentTime;
    tone(196, t, 0.6, 'sawtooth', 0.28, 110);
    tone(98, t + 0.05, 0.7, 'square', 0.2, 60);
  },

  milestone() {
    ensure();
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, t + i * 0.1, 0.4, 'triangle', 0.26));
  },

  win() {
    ensure();
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093];
    notes.forEach((f, i) => tone(f, t + i * 0.12, 0.5, 'triangle', 0.3));
    tone(261.63, t, 1.4, 'sine', 0.2);
  },
};

export default MQAudio;
