import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overtimeTrackerSource = readFileSync(
  new URL("../src/components/OvertimeTracker.jsx", import.meta.url),
  "utf8",
);
const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const forecastHeroSource = overtimeTrackerSource.slice(
  overtimeTrackerSource.indexOf('data-testid="pay-forecast-hero"'),
  overtimeTrackerSource.indexOf('data-testid="overtime-activity-timeline"'),
);

test("Paycheck Cockpit presents a dynamic expected salary forecast", () => {
  assert.match(overtimeTrackerSource, /data-testid="pay-forecast-hero"/);
  assert.match(overtimeTrackerSource, /const expectedSalary = useMemo\(/);
  assert.match(
    overtimeTrackerSource,
    /parseAmount\(allowanceDraft\.salaryWithLaundry\)[\s\S]*allowanceResult\.nightAllowance[\s\S]*allowanceResult\.expectedOvertime/,
  );
  assert.match(overtimeTrackerSource, /\{MONTHS\[salaryPeriod\.monthIndex\]\} \{salaryPeriod\.year\} Pay Forecast/);
  assert.match(forecastHeroSource, /<WalletCards/);
  assert.match(forecastHeroSource, /lg:grid-cols-\[minmax\(0,1\.45fr\)_1px_minmax\(330px,0\.9fr\)\]/);
  assert.match(forecastHeroSource, /inline-flex max-w-full[\s\S]*allowanceStatusPillClass/);
  assert.doesNotMatch(forecastHeroSource, /overtime-cockpit-subpanel/);
  assert.doesNotMatch(forecastHeroSource, /aria-label="Overtime year"/);
  assert.match(overtimeTrackerSource, /createPortal\([\s\S]*theme-overtime-toolbar/);
  assert.match(depotStablingSource, /id="overtime-toolbar-actions"/);
});

test("year activity timeline keeps accessible month selection", () => {
  assert.match(overtimeTrackerSource, /data-testid="overtime-activity-timeline"/);
  assert.match(overtimeTrackerSource, /monthSummaries\.map\(\(summary, monthIndex\) => \{/);
  assert.match(overtimeTrackerSource, /aria-label="Activity legend"/);
  assert.match(overtimeTrackerSource, /const hasActivity = summary\.hours > 0[\s\S]*totalNights > 0/);
  assert.match(overtimeTrackerSource, /aria-pressed=\{active\}/);
  assert.match(overtimeTrackerSource, /onClick=\{\(\) => handleMonthSelect\(monthIndex\)\}/);
  assert.match(overtimeTrackerSource, /flushAllowanceBeforePeriodChange\(\);[\s\S]*setSelectedMonth\(monthIndex\)/);
  assert.match(overtimeTrackerSource, /role="region"[\s\S]*monthly overtime timeline/);
  assert.match(overtimeTrackerSource, /ref=\{timelineScrollRef\}/);
  assert.match(overtimeTrackerSource, /ref=\{active \? activeMonthButtonRef : null\}/);
  assert.match(overtimeTrackerSource, /min-w-\[720px\][^\n]*lg:min-w-0/);
  assert.match(overtimeTrackerSource, /lg:overflow-x-hidden/);
});

test("allowance saves retain the latest queued snapshot for every period during an in-flight sync", () => {
  assert.match(overtimeTrackerSource, /const allowancePendingSavesRef = useRef/);
  assert.match(overtimeTrackerSource, /const queuedPeriodKey = `\$\{queuedWorkYear\}-\$\{queuedWorkMonth\}`/);
  assert.match(overtimeTrackerSource, /allowancePendingSavesRef\.current\.set\(queuedPeriodKey/);
  assert.match(overtimeTrackerSource, /if \(allowanceSyncInProgressRef\.current\)[\s\S]*allowanceRetryTimerRef/);
  assert.match(overtimeTrackerSource, /allowancePendingSavesRef\.current\.delete\(nextPeriodKey\)/);
  assert.match(overtimeTrackerSource, /!allowanceDirtyRef\.current && allowancePendingSavesRef\.current\.size === 0/);
  assert.match(overtimeTrackerSource, /finally \{[\s\S]*const pendingSnapshot = allowancePendingSavesRef\.current\.values\(\)\.next\(\)\.value[\s\S]*saveAllowanceDraft\(pendingSnapshot\)/);
});

test("salary and night inputs remain editable after the redesign", () => {
  assert.match(overtimeTrackerSource, /data-testid="salary-bases-summary"/);
  assert.match(overtimeTrackerSource, /Basic Salary and Salary \+ Laundry/);
  assert.match(overtimeTrackerSource, /id="overtime-basic-salary"/);
  assert.match(overtimeTrackerSource, /id="overtime-salary-laundry"/);
  assert.match(overtimeTrackerSource, /id="overtime-salary-received"/);
  assert.match(overtimeTrackerSource, /data-testid="night-days-allowance-summary"/);
  assert.match(overtimeTrackerSource, /id="overtime-night-days"/);
  assert.match(overtimeTrackerSource, /data-testid="recorded-hours-expected-ot-summary"/);
});

test("selected month snapshot and annual summary use the existing derived data", () => {
  assert.match(overtimeTrackerSource, /data-testid="selected-month-snapshot"/);
  assert.match(overtimeTrackerSource, /selectedMonthSummary\.rdotCount/);
  assert.match(overtimeTrackerSource, /selectedMonthSummary\.extensionCount/);
  assert.match(overtimeTrackerSource, /data-testid="overtime-annual-summary"/);
  assert.match(overtimeTrackerSource, /const annualSummaryItems = \[/);
  assert.match(overtimeTrackerSource, /highestNightShift\.total/);
  assert.match(overtimeTrackerSource, /highestExtensionOnly\.total/);
  assert.match(overtimeTrackerSource, /highestRdotOnly\.total/);
});
