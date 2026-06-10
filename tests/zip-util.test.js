import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeFileNames, zipFiles } from '../public/js/zip-util.js';
import { unzipSync } from '../public/js/vendor/fflate.module.js';

const enc = (s) => new TextEncoder().encode(s);
const dec = (u) => new TextDecoder().decode(u);

test('dedupeFileNames suffixt Kollisionen mit (n)', () => {
  assert.deepEqual(
    dedupeFileNames(['a.txt', 'a.txt', 'a.txt']),
    ['a.txt', 'a (2).txt', 'a (3).txt']
  );
});

test('dedupeFileNames behandelt Namen ohne Endung', () => {
  assert.deepEqual(dedupeFileNames(['noext', 'noext']), ['noext', 'noext (2)']);
});

test('dedupeFileNames ersetzt leere Namen durch "datei"', () => {
  assert.deepEqual(dedupeFileNames(['', '']), ['datei', 'datei (2)']);
});

test('zipFiles erzeugt ein entpackbares ZIP mit allen Dateien', () => {
  const files = [
    { name: 'hallo.txt', bytes: enc('hallo welt') },
    { name: 'bin', bytes: new Uint8Array([1, 2, 3, 4]) }
  ];
  const zipped = zipFiles(files);
  assert.ok(zipped instanceof Uint8Array);
  const out = unzipSync(zipped);
  assert.deepEqual(Object.keys(out).sort(), ['bin', 'hallo.txt']);
  assert.equal(dec(out['hallo.txt']), 'hallo welt');
  assert.deepEqual([...out['bin']], [1, 2, 3, 4]);
});

test('zipFiles entschärft doppelte Dateinamen', () => {
  const files = [
    { name: 'x.txt', bytes: enc('eins') },
    { name: 'x.txt', bytes: enc('zwei') }
  ];
  const out = unzipSync(zipFiles(files));
  assert.deepEqual(Object.keys(out).sort(), ['x (2).txt', 'x.txt']);
});

test('dedupeFileNames kollidiert nicht mit bereits vorhandenen "(n)"-Namen', () => {
  assert.deepEqual(
    dedupeFileNames(['a (2).txt', 'a.txt', 'a.txt']),
    ['a (2).txt', 'a.txt', 'a (3).txt']
  );
});

test('dedupeFileNames reduziert Pfad-Traversal auf den Basename (Zip Slip)', () => {
  assert.deepEqual(
    dedupeFileNames(['..\\..\\evil.bat', '../../etc/passwd', 'dir/sub/x.txt']),
    ['evil.bat', 'passwd', 'x.txt']
  );
});

test('dedupeFileNames entschärft reine Traversal-/Laufwerks-Namen', () => {
  assert.deepEqual(
    dedupeFileNames(['..', '.', 'C:evil.bat', '/']),
    ['datei', 'datei (2)', 'evil.bat', 'datei (3)']
  );
});

test('zipFiles schreibt nur sichere Basenames als Eintragspfade', () => {
  const files = [
    { name: '..\\..\\Startup\\evil.bat', bytes: enc('boom') },
    { name: 'ok.txt', bytes: enc('ok') }
  ];
  const out = unzipSync(zipFiles(files));
  assert.deepEqual(Object.keys(out).sort(), ['evil.bat', 'ok.txt']);
});
