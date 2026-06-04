import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPreview } from '../public/js/preview-util.js';

test('Bild per MIME-Typ', () => {
  assert.equal(classifyPreview('image/png', 'x.png'), 'image');
  assert.equal(classifyPreview('image/jpeg', 'x.jpg'), 'image');
});

test('PDF per MIME-Typ', () => {
  assert.equal(classifyPreview('application/pdf', 'x.pdf'), 'pdf');
});

test('Text per MIME-Typ', () => {
  assert.equal(classifyPreview('text/plain', 'x.txt'), 'text');
});

test('Fallback über Dateiendung bei leerem/generischem MIME-Typ', () => {
  assert.equal(classifyPreview('', 'foto.JPG'), 'image');
  assert.equal(classifyPreview('application/octet-stream', 'notes.md'), 'text');
  assert.equal(classifyPreview('application/octet-stream', 'report.pdf'), 'pdf');
});

test('Unbekannte Typen → null (nur Download)', () => {
  assert.equal(classifyPreview('application/zip', 'archive.zip'), null);
  assert.equal(classifyPreview('application/octet-stream', 'data.bin'), null);
  assert.equal(classifyPreview('', 'ohneendung'), null);
});
