import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overtimeTrackerPath = new URL('../src/components/OvertimeTracker.jsx', import.meta.url);

test('edit timing selector keeps Radix dropdown support and renders the controlled saved timing', () => {
  const source = readFileSync(overtimeTrackerPath, 'utf8');

  assert.match(
    source,
    /key=\{`duty-time-\$\{editingId \|\| "new"\}-\$\{draftTimingValue\}`\}/
  );
  assert.match(
    source,
    /<SelectValue asChild>\s*<span data-testid="selected-duty-timing"[^>]*>\s*\{getTimingLabel\(resolvedDraftTiming\.startTime, resolvedDraftTiming\.endTime, draft\.type === "EXTENSION"\)\}\s*<\/span>\s*<\/SelectValue>/
  );
  assert.match(source, /<SelectContent[\s\S]*?draftTimingOptions\.map/);
});
