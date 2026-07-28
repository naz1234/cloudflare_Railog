import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overtimeTrackerPath = new URL('../src/components/OvertimeTracker.jsx', import.meta.url);

test('edit timing selector bypasses cached option text and renders the controlled saved timing', () => {
  const source = readFileSync(overtimeTrackerPath, 'utf8');

  assert.match(
    source,
    /key=\{`duty-time-\$\{editingId \|\| "new"\}-\$\{draftTimingValue\}`\}/
  );
  assert.match(
    source,
    /<span data-testid="selected-duty-timing"[^>]*>\s*\{getTimingLabel\(resolvedDraftTiming\.startTime, resolvedDraftTiming\.endTime, draft\.type === "EXTENSION"\)\}\s*<\/span>/
  );
  assert.doesNotMatch(source, /<SelectValue placeholder="Select time">/);
});
