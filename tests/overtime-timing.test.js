import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeClockTime,
  parseStoredTimingRange,
  resolveRecordTiming,
} from '../src/lib/overtimeTiming.js';

test('normalizes saved 12-hour values to the stored 24-hour format', () => {
  assert.equal(normalizeClockTime('3:00 PM'), '15:00');
  assert.equal(normalizeClockTime('3:00 AM'), '03:00');
  assert.equal(normalizeClockTime('3:00'), '03:00');
});

test('recovers a saved timing pair from legacy range text', () => {
  assert.deepEqual(parseStoredTimingRange('3:00 PM – 3:00 AM'), {
    startTime: '15:00',
    endTime: '03:00',
  });
});

test('restores cloud snake_case start and end times', () => {
  assert.deepEqual(resolveRecordTiming({ start_time: '23:00', end_time: '07:30' }), {
    startTime: '23:00',
    endTime: '07:30',
  });
});

test('invalid edit placeholders preserve the last saved timing', () => {
  assert.deepEqual(resolveRecordTiming(
    { startTime: '-', endTime: 'undefined' },
    { startTime: '15:00', endTime: '03:00' }
  ), {
    startTime: '15:00',
    endTime: '03:00',
  });
});
