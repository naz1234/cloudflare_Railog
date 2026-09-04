import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EAST_DEPOT_RETURN_TO_MAINLINE_REMARK,
  EAST_DEPOT_WEEKDAY_WASH_NOTICE,
  WEST_DEPOT_WEEKEND_WASH_NOTICE,
  shouldShowEastDepotWashNotice,
  shouldShowWestDepotWeekendWashNotice,
} from "../src/lib/eastDepotWashNotice.js";

const pageSource = fs.readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");

function localDateAt(hours, minutes) {
  const date = new Date(2026, 8, 3, hours, minutes, 0, 0);
  return date;
}

test("East Depot wash notice uses the requested wording", () => {
  assert.equal(
    EAST_DEPOT_WEEKDAY_WASH_NOTICE,
    "Early Shift Weekdays: Kindly send pending-wash trains at East Depot back to the Mainline as off-peak trains.\nObjective: To reduce swapping and expedite washing.",
  );
});

test("pending-wash train cards use the requested Mainline return remark", () => {
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.equal(EAST_DEPOT_RETURN_TO_MAINLINE_REMARK, "Return Back to ML");
  assert.match(pageSource, /showReturnBackToMainlineRemark=\{showEastDepotWashNotice\}/);
  assert.match(pageSource, /showReturnBackToMainlineRemark && depot === "east" && hasPendingWash/);
  assert.match(pageSource, /maintList\.some\(\(item\) => getStablingRequestCategory\(item\) === "wash"\)/);
  assert.match(pageSource, /theme-east-depot-return-remark/);
  assert.match(pageSource, /\{EAST_DEPOT_RETURN_TO_MAINLINE_REMARK\}/);
  assert.match(css, /html\[data-app-theme="light"\] \.theme-east-depot-return-remark/);
});

test("notice appears only for East Depot with the Weekday timetable", () => {
  const midday = localDateAt(12, 0);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "east", timetableType: "weekday", date: midday }), true);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "west", timetableType: "weekday", date: midday }), false);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "east", timetableType: "friday", date: midday }), false);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "east", timetableType: "saturday", date: midday }), false);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "east", timetableType: "ph", date: midday }), false);
});

test("West Depot uses the requested message only for Friday and Saturday timetables", () => {
  assert.equal(
    WEST_DEPOT_WEEKEND_WASH_NOTICE,
    "Early Shift Friday and Saturday:\nKindly park all pending-wash trains at West Depot and ensure none are running on the Mainline.\n\nObjective: Late Shift can send the trains directly for wash after Possession and expedite washing.",
  );
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "west", timetableType: "friday" }), true);
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "west", timetableType: "saturday" }), true);
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "west", timetableType: "weekday" }), false);
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "west", timetableType: "ph" }), false);
  assert.equal(shouldShowWestDepotWeekendWashNotice({ depot: "east", timetableType: "friday" }), false);
});

test("Train Request renders the weekend message only through the West condition", () => {
  assert.match(pageSource, /showWestDepotWeekendWashNotice && \(/);
  assert.match(pageSource, /<StablingWashNotice depot="west" message=\{WEST_DEPOT_WEEKEND_WASH_NOTICE\} \/>/);
  assert.match(pageSource, /theme-west-depot-weekend-wash-notice/);
});

test("East and West wash notices use the purple reference treatment only in night mode", () => {
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(css, /html\[data-app-theme="dark"\] :is\(\s*\.theme-east-depot-wash-notice,\s*\.theme-west-depot-weekend-wash-notice\s*\)/);
  assert.match(css, /background: linear-gradient\(135deg, #211d52 0%, #1f225b 100%\) !important/);
  assert.match(css, /border-color: #8b5cf6 !important/);
  assert.match(pageSource, /theme-stabling-wash-notice-icon/);
});

test("notice follows the inclusive 09:00 to 16:00 local-time window", () => {
  const visible = (hours, minutes) => shouldShowEastDepotWashNotice({
    depot: "east",
    timetableType: "weekday",
    date: localDateAt(hours, minutes),
  });

  assert.equal(visible(8, 59), false);
  assert.equal(visible(9, 0), true);
  assert.equal(visible(15, 59), true);
  assert.equal(visible(16, 0), true);
  assert.equal(visible(16, 1), false);
});

test("Train Request wires the active timetable and refreshes the East notice clock", () => {
  assert.match(pageSource, /depot="east"\s+activeTimetableType=\{selectedTimetableType\}\s+title="EAST DEPOT STABLING"/);
  assert.match(pageSource, /showEastDepotWashNotice && \(/);
  assert.match(pageSource, /role="status"/);
  assert.match(pageSource, /window\.setInterval\(refreshNoticeTime, 30000\)/);
});
