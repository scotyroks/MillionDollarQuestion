const test = require('node:test');
const assert = require('node:assert/strict');
const { encode, toSvg } = require('../lib/qr');

function finderAt(m, x, y) {
  // 7x7 finder: dark ring, light ring, 3x3 dark core.
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      if (m[y + dy][x + dx] !== (d !== 2)) return false;
    }
  }
  return true;
}

test('picks the smallest version that fits', () => {
  assert.equal(encode('hi').length, 21);                              // v1
  assert.equal(encode('http://192.168.1.20:3000/vote').length, 29);   // v3
  assert.equal(encode('x'.repeat(200)).length, 57);                   // v10
  assert.throws(() => encode('x'.repeat(400)), /too long/);
});

test('has the three finder patterns and timing lines', () => {
  const m = encode('http://10.0.0.5:3000/vote');
  const n = m.length;
  assert.ok(finderAt(m, 0, 0));
  assert.ok(finderAt(m, n - 7, 0));
  assert.ok(finderAt(m, 0, n - 7));
  for (let i = 8; i < n - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0);
    assert.equal(m[i][6], i % 2 === 0);
  }
});

test('renders an SVG', () => {
  const svg = toSvg('hello');
  assert.match(svg, /^<svg[^>]+viewBox="0 0 29 29"/);
});
