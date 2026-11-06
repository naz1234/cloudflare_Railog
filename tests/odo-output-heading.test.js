import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ODO_TRAINSETS } from '../shared/odo-reading.js';

const source = readFileSync(new URL('../src/components/OdoReading.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  const buildCopyText = () => {');
const end = source.indexOf('\n  const handleCopy', start);
assert.ok(start > 0 && end > start);
const copy = new Function('TRAINSETS', 'mileages', 'workshops', 'displayDate', `${source.slice(start, end)}\nreturn buildCopyText();`);

test('copied ODO output starts with the requested parenthesized date only', () => {
  const text = copy(ODO_TRAINSETS, {}, {}, '06 November 2026');
  assert.equal(text.split('\n')[0], '(06 November 2026)');
  assert.doesNotMatch(text, /Trainset\t|Finish ODO Reading|\d{2}:\d{2}|Hrs/);
});

test('ODO date-only heading retains the blank separator and every trainset row in order', () => {
  const text = copy(ODO_TRAINSETS, { TS01: '281672', TS47: '300047' }, { TS03: true }, '06 November 2026');
  const lines = text.split('\n');
  assert.equal(lines.length, ODO_TRAINSETS.length + 2);
  assert.equal(lines[1], '');
  assert.equal(lines[2], 'TS01\t:\t281672');
  assert.equal(lines[3], 'TS02\t:\t');
  assert.equal(lines[4], 'TS03\t:\tWORKSHOP');
  assert.equal(lines.at(-1), 'TS47\t:\t300047');
  assert.deepEqual(lines.slice(2).map(line => line.split('\t')[0]), ODO_TRAINSETS);
});

test('copied heading follows the current displayed date without a hard-coded day or time dependency', () => {
  for (const date of ['07 November 2026', '30 November 2026', '01 December 2026']) {
    assert.equal(copy(ODO_TRAINSETS, {}, {}, date).split('\n')[0], `(${date})`);
  }
  assert.doesNotMatch(source.slice(start, end), /displayTime/);
});

test('ODO copying leaves mileage and workshop state intact and keeps using the existing clipboard action', () => {
  const mileages = { TS01: '281672', TS03: '123456' };
  const workshops = { TS03: true, TS04: false };
  const before = structuredClone({ mileages, workshops });
  copy(ODO_TRAINSETS, mileages, workshops, '06 November 2026');
  assert.deepEqual({ mileages, workshops }, before);
  assert.match(source, /navigator.clipboard.writeText\(buildCopyText\(\)\)/);
  assert.match(source, /setCopied\(true\)/);
});

test('the on-screen ODO summary uses the same date-only heading and keeps progress and CMMS output', () => {
  const output = source.slice(source.indexOf('{/* RIGHT: ODO OUTPUT */}'), source.indexOf('title="CMMS Output"'));
  assert.match(output, /<span className="text-indigo-200">\(\{displayDate\}\)<\/span>/);
  assert.doesNotMatch(source, /Finish ODO Reading at/);
  assert.match(output, /Recorded mileage: \{recordedCount\} \/ \{nonWorkshopCount\} active trainsets/);
  assert.match(output, /outputRows.map\(\(ts\)/);
  assert.match(source, /navigator.clipboard.writeText\(buildCmmsOutput\(cmmsReport\)\)/);
});
