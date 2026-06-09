/* Shared client helpers: live state, actions, audio cues. */

const Game = {
  state: null,
  listeners: [],
  onState(fn) { this.listeners.push(fn); if (this.state) fn(this.state); },
  _emit() { for (const fn of this.listeners) fn(this.state); },

  connect() {
    const dot = document.getElementById('conn');
    const es = new EventSource('/events');
    es.onmessage = (e) => {
      this.state = JSON.parse(e.data);
      if (dot) { dot.textContent = '● live'; dot.classList.remove('bad'); }
      this._emit();
    };
    es.onerror = () => {
      if (dot) { dot.textContent = '● reconnecting…'; dot.classList.add('bad'); }
    };
  },

  async action(type, payload = {}) {
    try {
      await fetch('/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload }),
      });
    } catch (err) { console.error('action failed', type, err); }
  },
};

function fmtMoney(n) {
  return '$' + Number(n).toLocaleString('en-US');
}
const LETTERS = ['A', 'B', 'C', 'D'];

/* ---- Audio engine: synthesized cues, no external files ---- */
const Sound = {
  ctx: null,
  enabled: true,
  bedNodes: null,
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, start, dur, type = 'sine', gain = 0.2) {
    const ctx = this.ensure();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  },
  play(name) {
    if (!this.enabled) return;
    this.ensure();
    switch (name) {
      case 'lock': // suspense lock-in sting
        this.tone(160, 0, 0.5, 'sawtooth', 0.18);
        this.tone(80, 0, 0.6, 'sine', 0.22);
        break;
      case 'correct': // bright win chord
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * 0.07, 0.5, 'triangle', 0.18));
        break;
      case 'wrong':
        this.tone(200, 0, 0.5, 'sawtooth', 0.2);
        this.tone(120, 0.05, 0.7, 'square', 0.16);
        break;
      case 'reveal': // answers appear
        this.tone(440, 0, 0.18, 'triangle', 0.12);
        break;
      case 'lifeline':
        this.tone(660, 0, 0.15, 'square', 0.12);
        this.tone(880, 0.12, 0.2, 'square', 0.12);
        break;
      case 'win': // big finale
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, i * 0.12, 0.9, 'triangle', 0.2));
        break;
      case 'tick':
        this.tone(1000, 0, 0.05, 'square', 0.08);
        break;
      case 'suspense': // low rising drone during the reveal pause
        this.tone(70, 0, 2.4, 'sawtooth', 0.16);
        this.tone(105, 0, 2.4, 'sine', 0.12);
        this.tone(140, 1.2, 1.2, 'triangle', 0.08);
        break;
    }
  },
};
