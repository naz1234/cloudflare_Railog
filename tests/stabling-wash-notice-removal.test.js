import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const sectionStart = pageSource.indexOf("function StablingSection(");
const sectionEnd = pageSource.indexOf("function SectionTitle(", sectionStart);
assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
const sectionSource = pageSource.slice(sectionStart, sectionEnd);

test("West Depot no longer renders the retired washing notice or retains its message helper", () => {
  assert.doesNotMatch(pageSource, /StablingWashNotice|WEST_DEPOT_WEEKEND_WASH_NOTICE|shouldShowWestDepotWeekendWashNotice|eastDepotWashNotice/);
  assert.doesNotMatch(pageSource, /Early Shift Friday and Saturday|Kindly park all pending-wash trains/);
  assert.equal(existsSync(new URL("../src/lib/eastDepotWashNotice.js", import.meta.url)), false);
});

test("main stabling no longer needs a notice clock, collapse timer or active timetable prop", () => {
  assert.doesNotMatch(pageSource, /washNoticeDate|setWashNoticeDate|refreshNoticeTime|WASH_NOTICE_AUTO_COLLAPSE_MS/);
  assert.doesNotMatch(sectionSource, /activeTimetableType/);
  assert.match(pageSource, /<StablingSection\s+depot="west"\s+title="WEST DEPOT STABLING"/);
  assert.match(pageSource, /<StablingSection\s+depot="east"\s+title="EAST DEPOT STABLING"/);
  assert.match(sectionSource, /<RoadRow/);
  assert.match(sectionSource, /onClick=\{handleCopyStabling\}/);
  assert.match(sectionSource, /onClick=\{handleDownloadPdf\}/);
  assert.match(sectionSource, /<ClearAllStablingButton onClearAll=\{onClearAll\}/);
});

test("retired notice styling is removed without changing stabling remark pills", () => {
  assert.doesNotMatch(css, /theme-(?:west-depot-weekend|east-depot|stabling)-wash-notice/);
  assert.match(css, /html\[data-app-theme="light"\] \.theme-stabling-remark/);
  assert.match(css, /html\[data-app-theme="dark"\] \.theme-stabling-remark/);
});
