import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  WEST_DEPOT_WEEKEND_WASH_NOTICE,
  shouldShowWestDepotWeekendWashNotice,
} from "../src/lib/eastDepotWashNotice.js";

const pageSource = fs.readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");

function localDateAt(hours, minutes) {
  const date = new Date(2026, 8, 3, hours, minutes, 0, 0);
  return date;
}

test("West Depot uses the requested message only for Friday and Saturday timetables", () => {
  const midday = localDateAt(12, 0);
  assert.equal(
    WEST_DEPOT_WEEKEND_WASH_NOTICE,
    "Early Shift Friday and Saturday:\nKindly park all pending-wash trains at West Depot and ensure none are running on the Mainline.\n\nObjective: Late Shift can send the trains directly for wash after Possession and expedite washing.",
  );
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "west", timetableType: "friday", date: midday }), true);
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "west", timetableType: "saturday", date: midday }), true);
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "west", timetableType: "weekday", date: midday }), false);
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "west", timetableType: "ph", date: midday }), false);
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "east", timetableType: "friday", date: midday }), false);
});

test("no early-shift notice appears at East Depot under any timetable", () => {
  for (const timetableType of ["weekday", "friday", "saturday", "ph"]) {
    for (const hours of [9, 12, 16]) {
      assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "east", timetableType, date: localDateAt(hours, 0) }), false);
    }
  }
});

test("Train Request renders the weekend message only through the West condition", () => {
  assert.match(pageSource, /showWestDepotWeekendWashNotice && \(/);
  assert.match(pageSource, /<StablingWashNotice depot="west" message=\{WEST_DEPOT_WEEKEND_WASH_NOTICE\} \/>/);
  assert.match(pageSource, /theme-west-depot-weekend-wash-notice/);
});

test("East and West wash notices use the amber Access Entry window treatment only in night mode", () => {
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(css, /html\[data-app-theme="dark"\] :is\(\s*\.theme-east-depot-wash-notice,\s*\.theme-west-depot-weekend-wash-notice\s*\)/);
  assert.match(css, /background: #3a2608 !important/);
  assert.match(css, /border-color: #fbbf24 !important/);
  assert.match(css, /theme-stabling-wash-notice-header/);
  assert.match(css, /background: linear-gradient\(180deg, #654414 0%, #452d0b 100%\) !important/);
  assert.match(pageSource, /theme-stabling-wash-notice-title/);
  assert.match(pageSource, /theme-stabling-wash-notice-body/);
  assert.match(pageSource, /theme-stabling-wash-notice-icon/);
});

test("West notice follows the inclusive 09:00 to 16:00 local-time window", () => {
  const westVisible = (hours, minutes) => shouldShowWestDepotWeekendWashNotice({
    depot: "west",
    timetableType: "friday",
    date: localDateAt(hours, minutes),
  });

  assert.equal(westVisible(8, 59), false);
  assert.equal(westVisible(9, 0), true);
  assert.equal(westVisible(15, 59), true);
  assert.equal(westVisible(16, 0), true);
  assert.equal(westVisible(16, 1), false);
});

test("Train Request wires the active timetable and refreshes the notice clock", () => {
  assert.match(pageSource, /depot="east"\s+activeTimetableType=\{selectedTimetableType\}\s+title="EAST DEPOT STABLING"/);
  assert.match(pageSource, /shouldShowWestDepotWeekendWashNotice\(\{\s*depot,\s*timetableType: normalizeTimetableType\(activeTimetableType\),\s*date: washNoticeDate,/);
  assert.match(pageSource, /role="status"/);
  assert.match(pageSource, /window\.setInterval\(refreshNoticeTime, 30000\)/);
});
