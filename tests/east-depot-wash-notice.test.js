import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EAST_DEPOT_RETURN_TO_MAINLINE_REMARK,
  EAST_DEPOT_WEEKDAY_WASH_NOTICE,
  shouldShowEastDepotWashNotice,
} from "../src/lib/eastDepotWashNotice.js";

const pageSource = fs.readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");

function localDateAt(hours, minutes) {
  const date = new Date(2026, 8, 3, hours, minutes, 0, 0);
  return date;
}

test("East Depot wash notice uses the requested wording", () => {
  assert.equal(
    EAST_DEPOT_WEEKDAY_WASH_NOTICE,
    "Early Shift Weekdays – Kindly arrange for the pending-wash trains parked at East Depot to be sent back to the Mainline as off-peak trains, to reduce swapping and expedite the pending washing.",
  );
});

test("pending-wash train cards use the requested Mainline return remark", () => {
  assert.equal(EAST_DEPOT_RETURN_TO_MAINLINE_REMARK, "Return Back to ML");
  assert.match(pageSource, /showReturnBackToMainlineRemark=\{showEastDepotWashNotice\}/);
  assert.match(pageSource, /showReturnBackToMainlineRemark && depot === "east" && hasPendingWash/);
  assert.match(pageSource, /maintList\.some\(\(item\) => getStablingRequestCategory\(item\) === "wash"\)/);
  assert.match(pageSource, /theme-east-depot-return-remark/);
  assert.match(pageSource, /\{EAST_DEPOT_RETURN_TO_MAINLINE_REMARK\}/);
});

test("notice appears only for East Depot with the Weekday timetable", () => {
  const midday = localDateAt(12, 0);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "east", timetableType: "weekday", date: midday }), true);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "west", timetableType: "weekday", date: midday }), false);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "east", timetableType: "friday", date: midday }), false);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "east", timetableType: "saturday", date: midday }), false);
  assert.equal(shouldShowEastDepotWashNotice({ depot: "east", timetableType: "ph", date: midday }), false);
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
