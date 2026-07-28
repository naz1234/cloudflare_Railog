import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overtimeTrackerPath = new URL('../src/components/OvertimeTracker.jsx', import.meta.url);

test('edit timing uses the standard styled dropdown without injecting legacy options', () => {
  const source = readFileSync(overtimeTrackerPath, 'utf8');

  assert.match(
    source,
    /key=\{`duty-time-\$\{editingId \|\| "new"\}-\$\{draft\.type\}-\$\{draft\.dayType\}`\}/
  );
  assert.match(
    source,
    /<SelectValue placeholder="Select time">\s*\{getTimingLabel\(resolvedDraftTiming\.startTime, resolvedDraftTiming\.endTime, draft\.type === "EXTENSION"\)\}\s*<\/SelectValue>/
  );
  assert.match(source, /position="popper"\s+viewportClassName="!h-auto max-h-\[360px\]"/);
  assert.match(source, /draftTimingOptions\.map\(\(option, index\) => \{/);
  assert.match(source, /index === 2 \|\| index === 4/);
  assert.doesNotMatch(source, /!draftTimingIsPreset/);
});
