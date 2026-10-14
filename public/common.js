/* Shared client helpers: live state, actions, formatting, audio cues. */

const LETTERS = ['A', 'B', 'C', 'D'];
const KEY_STORE = 'mdq_host_key';

function $(id) { return document.getElementById(id); }

function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function storage(op, key, value) {
  try {
    if (op === 'get') return localStorage.getItem(key);
    if (op === 'set') localStorage.setItem(key, value);
    if (op === 'del') localStorage.removeItem(key);
  } catch (_) { /* private mode: fine, just not remembered */ }
  return null;
}

function toast(message, kind = 'info') {
  let box = $('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}

const Game = {
  state: null,
  role: 'display',
  key: null,
  clockOffset: 0, // server clock minus this device's clock
  listeners: [],
  source: null,

  onState(fn) {
    this.listeners.push(fn);
    if (this.state) fn(this.state);
  },

  // Server time, corrected for this device's clock being off.
  now() { return Date.now() + this.clockOffset; },

  hostKey() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('key');
    if (fromUrl) {
      storage('set', KEY_STORE, fromUrl);
      params.delete('key'); // keep it off the screen once remembered
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
      return fromUrl;
    }
    return storage('get', KEY_STORE) || '';
  },

  connect(role) {
    this.role = role;
    const dot = $('conn');
    const query = new URLSearchParams({ role });
    if (role === 'host') query.set('key', this.key || '');
    if (this.source) this.source.close();
    const es = new EventSource(`/events?${query}`);
    this.source = es;
    es.onmessage = (e) => {
      this.state = JSON.parse(e.data);
      if (this.state.serverTime) this.clockOffset = this.state.serverTime - Date.now();
      if (dot) { dot.textContent = '● live'; dot.classList.remove('bad'); }
      for (const fn of this.listeners) fn(this.state);
    };
    es.onerror = () => {
      if (dot) { dot.textContent = '● reconnecting…'; dot.classList.add('bad'); }
    };
  },

  async action(type, payload = {}) {
    try {
      const res = await fetch('/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Host-Key': this.key || '' },
        body: JSON.stringify({ type, payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!body.ok) toast(body.error || `Couldn't ${type.replace(/_/g, ' ')}`, 'error');
      return body;
    } catch (err) {
      toast('Lost connection to the game server', 'error');
      return { ok: false, error: err.message };
    }
  },
};

/* ---- Audio: synthesized cues, no external files ---- */
const Sound = {
  ctx: null,
  enabled: true,
  volume: 1,
  ready() { return !!this.ctx && this.ctx.state === 'running'; },
  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, start, dur, type = 'sine', gain = 0.2, slideTo = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    const t = ctx.currentTime + start;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * this.volume, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  play(name) {
    if (!this.enabled || !this.ensure()) return;
    switch (name) {
      case 'start': // opening fanfare
        [262, 330, 392, 523].forEach((f, i) => this.tone(f, i * 0.16, 0.6, 'triangle', 0.16));
        this.tone(65, 0, 1.4, 'sawtooth', 0.1);
        break;
      case 'question':
        this.tone(220, 0, 0.6, 'sine', 0.14, 330);
        break;
      case 'reveal':
        this.tone(440, 0, 0.18, 'triangle', 0.12);
        break;
      case 'select':
        this.tone(587, 0, 0.12, 'triangle', 0.1);
        break;
      case 'lock':
        this.tone(160, 0, 0.5, 'sawtooth', 0.18);
        this.tone(80, 0, 0.6, 'sine', 0.22);
        break;
      case 'suspense':
        this.tone(70, 0, 2.4, 'sawtooth', 0.16, 90);
        this.tone(105, 0, 2.4, 'sine', 0.12, 140);
        this.tone(140, 1.2, 1.2, 'triangle', 0.08);
        break;
      case 'correct':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * 0.07, 0.5, 'triangle', 0.18));
        break;
      case 'wrong':
        this.tone(200, 0, 0.5, 'sawtooth', 0.2, 140);
        this.tone(120, 0.05, 0.7, 'square', 0.16, 80);
        break;
      case 'win':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, i * 0.12, 0.9, 'triangle', 0.2));
        [1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.9 + i * 0.1, 1.2, 'sine', 0.12));
        break;
      case 'walk':
        [392, 330, 262].forEach((f, i) => this.tone(f, i * 0.18, 0.5, 'triangle', 0.14));
        break;
      case 'lifeline':
        this.tone(660, 0, 0.15, 'square', 0.12);
        this.tone(880, 0.12, 0.2, 'square', 0.12);
        break;
      case 'tick':
        this.tone(1000, 0, 0.05, 'square', 0.08);
        break;
      case 'timeup':
        this.tone(440, 0, 0.8, 'square', 0.14, 220);
        break;
      case 'seat':
        this.tone(392, 0, 0.15, 'triangle', 0.12);
        this.tone(523, 0.12, 0.25, 'triangle', 0.12);
        break;
      default:
        break;
    }
  },
};
