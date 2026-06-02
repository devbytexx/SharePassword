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
});
