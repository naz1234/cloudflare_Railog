import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overtimeTrackerPath = new URL('../src/components/OvertimeTracker.jsx', import.meta.url);

test('edit timing uses a native controlled dropdown with the saved timing value', () => {
  const source = readFileSync(overtimeTrackerPath, 'utf8');

  assert.match(
    source,
    /<select\s+key=\{`duty-time-\$\{editingId \|\| "new"\}-\$\{draftTimingValue\}`\}\s+data-testid="duty-timing-select"\s+value=\{draftTimingValue\}/
  );
  assert.match(
    source,
    /onChange=\{\(event\) => \{\s*const timingValue = event\.target\.value;\s*const \[startTime, endTime\] = timingValue\.split\("\|"\);/
  );
  assert.match(source, /draftTimingOptions\.map\(\(option\) => \{/);
  assert.match(source, /<option key=\{timingValue\} value=\{timingValue\}>/);
});
