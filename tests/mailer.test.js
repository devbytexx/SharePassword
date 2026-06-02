import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBurnMail } from '../lib/mailer.js';

test('buildBurnMail produces sane subject and text without leaking sensitive data', () => {
  const m = buildBurnMail({
    to: 'sender@firma.de',
    from: 'noreply@bytexx.de',
    senderHint: 'Zugangsdaten Kunde X',
    ipHashHex: 'deadbeef'.repeat(8),
    when: new Date('2026-06-02T10:00:00Z')
  });
  assert.equal(m.to, 'sender@firma.de');
  assert.equal(m.from, 'noreply@bytexx.de');
  assert.match(m.subject, /abgerufen/i);
  assert.match(m.text, /Zugangsdaten Kunde X/);
  assert.match(m.text, /deadbeef/);
  assert.doesNotMatch(m.text, /token/i);
  assert.doesNotMatch(m.text, /https?:/);
  assert.match(m.text, /\n-- \nsecret\.bytexx\.de/);
});

test('buildBurnMail strips CR/LF from senderHint (anti-injection)', () => {
  const m = buildBurnMail({
    to: 'a@b.de', from: 'noreply@bytexx.de',
    senderHint: 'normal\r\n-- \nfake sig\r\nanother line',
    ipHashHex: 'a'.repeat(32),
    when: new Date('2026-06-02T10:00:00Z')
  });
  assert.doesNotMatch(m.text, /\r/);
  // The injected newline before "-- " must not survive: the only "-- " line
  // in the message must be the legitimate signature delimiter at the end.
  const matches = m.text.match(/\n-- \n/g) || [];
  assert.equal(matches.length, 1, 'exactly one signature delimiter');
});

test('buildBurnMail truncates oversized senderHint', () => {
  const big = 'x'.repeat(500);
  const m = buildBurnMail({
    to: 'a@b.de', from: 'noreply@bytexx.de',
    senderHint: big, ipHashHex: 'a'.repeat(32), when: new Date()
  });
  assert.ok(m.text.length < 1000);
});

test('buildBurnMail omits hint line when senderHint is null/empty', () => {
  for (const h of [null, undefined, '']) {
    const m = buildBurnMail({
      to: 'a@b.de', from: 'noreply@bytexx.de',
      senderHint: h, ipHashHex: 'a'.repeat(32), when: new Date()
    });
    assert.doesNotMatch(m.text, /Hinweis des Absenders/);
  }
});

test('buildBurnMail throws on invalid date / short hash', () => {
  assert.throws(() => buildBurnMail({
    to: 'a@b.de', from: 'x', senderHint: null,
    ipHashHex: 'a'.repeat(32), when: 'not-a-date'
  }), /valid Date/);
  assert.throws(() => buildBurnMail({
    to: 'a@b.de', from: 'x', senderHint: null,
    ipHashHex: 'short', when: new Date()
  }), /hex string/);
});
