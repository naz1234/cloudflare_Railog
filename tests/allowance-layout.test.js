import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overtimeTrackerSource = readFileSync(
  new URL("../src/components/OvertimeTracker.jsx", import.meta.url),
  "utf8",
);

test("Allowance Check panels share one header title style", () => {
  assert.match(
    overtimeTrackerSource,
    /const allowancePanelTitleClass = "text-\[10px\] font-semibold uppercase leading-\[1\.35\] tracking-\[0\.12em\] text-\[#d5e4f3\]";/,
  );

  const sharedTitleUses = overtimeTrackerSource.match(/className=\{allowancePanelTitleClass\}/g) || [];
  assert.ok(sharedTitleUses.length >= 7, "all Allowance Check panel headers should use the shared title style");
});

test("Basic Salary and Salary plus Laundry share one panel", () => {
  assert.match(overtimeTrackerSource, /data-testid="salary-bases-summary"/);
  assert.match(overtimeTrackerSource, /Basic Salary and Salary \+ Laundry/);
  assert.match(overtimeTrackerSource, /grid grid-cols-2 divide-x divide-\[#31506b\]\/80/);
});
