import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overtimeTrackerPath = new URL('../src/components/OvertimeTracker.jsx', import.meta.url);

test('edit timing selector renders the controlled saved timing label', () => {
  const source = readFileSync(overtimeTrackerPath, 'utf8');

  assert.match(
    source,
    /<SelectValue placeholder="Select time">\s*\{getTimingLabel\(resolvedDraftTiming\.startTime, resolvedDraftTiming\.endTime, draft\.type === "EXTENSION"\)\}\s*<\/SelectValue>/
  );
});
