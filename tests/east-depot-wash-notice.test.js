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

test("East wash notice retains the amber treatment only in night mode", () => {
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(css, /html\[data-app-theme="dark"\] \.theme-east-depot-wash-notice \{[^}]*background: #3a2608 !important;[^}]*border-color: #fbbf24 !important/);
  assert.match(css, /theme-stabling-wash-notice-header/);
  assert.match(css, /background: linear-gradient\(180deg, #654414 0%, #452d0b 100%\) !important/);
  assert.match(pageSource, /theme-stabling-wash-notice-title/);
  assert.match(pageSource, /theme-stabling-wash-notice-body/);
  assert.match(pageSource, /theme-stabling-wash-notice-icon/);
});

test("West night-mode notice matches the added Tracking ID violet palette without changing light mode", () => {
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  const tidCss = fs.readFileSync(new URL("../src/insertionDarkTidFooter.css", import.meta.url), "utf8");
  const extractRule = (source, selector) => {
    const start = source.indexOf(selector);
    assert.ok(start >= 0, selector);
    return source.slice(start, source.indexOf("}", start) + 1);
  };
  const noticeRule = extractRule(css, 'html[data-app-theme="dark"] .theme-west-depot-weekend-wash-notice {');
  const tidRule = extractRule(tidCss, 'html[data-app-theme="dark"] .theme-insertion-page .theme-insertion-tracking-footer.is-complete,');
  for (const declaration of [
    'background: linear-gradient(180deg, #22233e 0%, #17192e 100%) !important;',
    'border-color: #8f86d8 !important;',
    'color: #f4f8fc !important;',
  ]) {
    assert.ok(noticeRule.includes(declaration), declaration);
    assert.ok(tidRule.includes(declaration), declaration);
  }
  const header = extractRule(css, 'html[data-app-theme="dark"] .theme-west-depot-weekend-wash-notice .theme-stabling-wash-notice-header {');
  const title = extractRule(css, 'html[data-app-theme="dark"] .theme-west-depot-weekend-wash-notice .theme-stabling-wash-notice-title {');
  const icon = extractRule(css, 'html[data-app-theme="dark"] .theme-west-depot-weekend-wash-notice .theme-stabling-wash-notice-icon {');
  assert.match(header, /background: linear-gradient\(180deg, #22233e 0%, #17192e 100%\) !important/);
  assert.match(title, /color: #b5adf5 !important/);
  assert.match(icon, /border-color: #8f86d8 !important/);
  assert.doesNotMatch(noticeRule + header + title + icon, /#fbbf24|#654414|#452d0b|#3a2608/);
  const westSelectors = css.replace(/\/\*[\s\S]*?\*\//g, "").split("{")
    .slice(0, -1).map((part) => part.slice(part.lastIndexOf("}") + 1).trim())
    .filter((selector) => selector.includes("theme-west-depot-weekend-wash-notice"));
  assert.equal(westSelectors.length, 4);
  assert.ok(westSelectors.every((selector) => selector.startsWith('html[data-app-theme="dark"] ')));
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

test("West notice collapses three seconds after opening and clears its timer when closed or unmounted", () => {
  const noticeSource = pageSource.slice(pageSource.indexOf("const WASH_NOTICE_AUTO_COLLAPSE_MS"), pageSource.indexOf("function StablingSection"));
  assert.match(noticeSource, /WASH_NOTICE_AUTO_COLLAPSE_MS = 3000/);
  assert.match(noticeSource, /\[isCollapsed, setIsCollapsed\] = useState\(false\)/);
  assert.match(noticeSource, /if \(isEast \|\| isCollapsed\) return undefined/);
  assert.match(noticeSource, /window\.setTimeout\(\(\) => \{\s*setIsCollapsed\(true\);\s*\}, WASH_NOTICE_AUTO_COLLAPSE_MS\)/);
  assert.match(noticeSource, /return \(\) => window\.clearTimeout\(timer\)/);
  assert.match(noticeSource, /\[isEast, isCollapsed\]/);
});

test("notice heading stays available as an accessible keyboard-operable reopen button", () => {
  const noticeSource = pageSource.slice(pageSource.indexOf("function StablingWashNotice"), pageSource.indexOf("function StablingSection"));
  assert.match(noticeSource, /HeaderTag = isEast \? "div" : "button"/);
  assert.match(noticeSource, /onClick=\{isEast \? undefined : \(\) => setIsCollapsed\(\(collapsed\) => !collapsed\)\}/);
  assert.match(noticeSource, /aria-expanded=\{isEast \? undefined : !isCollapsed\}/);
  assert.match(noticeSource, /aria-controls=\{isEast \? undefined : noticeBodyId\}/);
  assert.match(noticeSource, /id=\{noticeBodyId\} hidden=\{isCollapsed\}/);
  assert.match(noticeSource, /Show West Depot notice for 3 seconds/);
  assert.match(noticeSource, /cursor-pointer focus-visible:outline/);
});
