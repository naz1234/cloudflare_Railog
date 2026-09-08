import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  UPCOMING_SECTION_GAP_MINUTES,
  getUpcomingFirstRows,
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

test("the reference table labels upcoming blocks and earlier departures separately", () => {
  assert.match(
    referenceTableSource,
    /const startsNewTimeBlock = idx > 0 && hasLargeTimetableGap\(rows\[idx - 1\]\?\.time, time\)/,
  );
  assert.match(
    referenceTableSource,
    /const showUpcomingDivider = isUpcoming && \(idx === nextIndex \|\| startsNewTimeBlock\)/,
  );
  assert.match(
    referenceTableSource,
    /data-section-reason=\{showEarlierDivider \? "earlier-departures" : startsNewTimeBlock \? "timetable-gap" : "next-tid"\}/,
  );
});

test("the 15:58 departure leads the afternoon list without losing morning rows", () => {
  const rows = [
    { tid: 101, time: "05:25", remark: "Late Rem" },
    { tid: 120, time: "06:22", remark: "Early Rem" },
    { tid: 121, time: "15:58" },
    { tid: 122, time: "16:04" },
  ];
  const displayed = getUpcomingFirstRows(rows, 2);
  assert.deepEqual(displayed.map(({ row }) => row.tid), [121, 122, 101, 120]);
  assert.deepEqual(displayed.map(({ originalIndex }) => originalIndex), [2, 3, 0, 1]);
  assert.equal(displayed[2].row, rows[0]);
  assert.deepEqual(rows.map(({ tid }) => tid), [101, 120, 121, 122]);
  assert.deepEqual(getUpcomingFirstRows(rows, 3).map(({ row }) => row.tid), [122, 101, 120, 121]);
});

test("before the first and after the last departure every row stays available", () => {
  const rows = [{ tid: 1, time: "05:25" }, { tid: 2, time: "16:04" }];
  for (const nextIndex of [0, -1, 2, NaN]) {
    assert.deepEqual(getUpcomingFirstRows(rows, nextIndex).map(({ row }) => row), rows);
  }
  assert.deepEqual(getUpcomingFirstRows([], -1), []);
  assert.deepEqual(getUpcomingFirstRows(rows.slice(0, 1), 0).map(({ row }) => row.tid), [1]);
});
