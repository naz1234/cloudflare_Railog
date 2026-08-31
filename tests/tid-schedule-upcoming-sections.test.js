import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  UPCOMING_SECTION_GAP_MINUTES,
  hasLargeTimetableGap,
} from "../src/lib/tidScheduleSections.js";

const referenceTableSource = readFileSync(
  new URL("../src/components/TIDReferenceTable.jsx", import.meta.url),
  "utf8",
);

test("a large uploaded timetable gap starts another Upcoming section", () => {
  assert.equal(UPCOMING_SECTION_GAP_MINUTES, 30);
  assert.equal(hasLargeTimetableGap("14:15", "16:21"), true);
  assert.equal(hasLargeTimetableGap("13:57", "14:03"), false);
});

test("future uploads are detected by time instead of specific TIDs", () => {
  const uploadedRows = [
    { tid: 401, time: "09:00" },
    { tid: 402, time: "09:06" },
    { tid: 403, time: "11:12" },
    { tid: 404, time: "11:18" },
  ];
  const sectionStarts = uploadedRows
    .map((row, index) => index > 0 && hasLargeTimetableGap(uploadedRows[index - 1].time, row.time))
    .reduce((indices, startsSection, index) => startsSection ? [...indices, index] : indices, []);

  assert.deepEqual(sectionStarts, [2]);
});

test("invalid or reversed timetable values do not create false dividers", () => {
  assert.equal(hasLargeTimetableGap("", "16:21"), false);
  assert.equal(hasLargeTimetableGap("14:15", "not-a-time"), false);
  assert.equal(hasLargeTimetableGap("16:21", "14:15"), false);
  assert.equal(hasLargeTimetableGap("14:15", "14:45", 0), false);
});

test("the reference table combines the live next marker with automatic gap markers", () => {
  assert.match(
    referenceTableSource,
    /const startsNewTimeBlock = idx > 0 && hasLargeTimetableGap\(rows\[idx - 1\]\?\.time, time\)/,
  );
  assert.match(
    referenceTableSource,
    /const showUpcomingDivider = \(isWeekday && nextIndex >= 0 && idx === nextIndex\) \|\| startsNewTimeBlock/,
  );
  assert.match(
    referenceTableSource,
    /data-section-reason=\{startsNewTimeBlock \? "timetable-gap" : "next-tid"\}/,
  );
});
