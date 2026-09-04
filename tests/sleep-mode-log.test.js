import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildSleepModeLogLine,
  createSleepModeLogEntry,
  formatSleepTimeInput,
  formatSleepTrainList,
  getSleepModeDepot,
  normalizeSleepModeLogs,
  normalizeSleepTrainId,
} from "../src/lib/sleepModeLog.js";

test("Sleep Mode uses the requested grouped Sleep log sentence", () => {
  assert.equal(
    buildSleepModeLogLine({
      time: "00:21",
      trainIds: ["10", "13", "16", "20", "35", "38", "44"],
      location: "WD-ST14",
      mode: "sleep",
    }),
    "00:21 hrs – T10, T13, T16, T20, T35, T38 and T44 successfully in sleep mode at WD–ST14.",
  );
});

test("Sleep Mode uses the requested grouped Wake-up log sentence", () => {
  assert.equal(
    buildSleepModeLogLine({
      time: "00:21",
      trainIds: ["T10", "T13", "T16", "T20", "T35", "T38", "T44"],
      location: "wd-st14",
      mode: "wake",
    }),
    "00:21 hrs – T10, T13, T16, T20, T35, T38 and T44 successfully in wake–up mode at WD–ST14.",
  );
});

test("Sleep Mode adds an optional remark to the shared log line", () => {
  assert.equal(
    buildSleepModeLogLine({
      time: "00:21",
      trainIds: ["10"],
      location: "WD-ST14",
      mode: "sleep",
      remark: "Confirmed by DC",
    }),
    "00:21 hrs – T10 successfully in sleep mode at WD–ST14. Remark: Confirmed by DC.",
  );
});

test("Sleep Mode time entry formats four digits as a 24-hour time", () => {
  assert.equal(formatSleepTimeInput("0021"), "00:21");
  assert.equal(formatSleepTimeInput("18:45"), "18:45");
});

test("Sleep train IDs normalize and grouped lists remove duplicates", () => {
  assert.equal(normalizeSleepTrainId("TS02"), "02");
  assert.equal(normalizeSleepTrainId("2"), "02");
  assert.equal(formatSleepTrainList(["02", "T2", "15", "27", "31"]), "T02, T15, T27 and T31");
});

test("Sleep logs normalize persisted entries and reject incomplete rows", () => {
  const valid = createSleepModeLogEntry({
    time: "1:05",
    trainIds: ["2"],
    location: "ED-ST02",
    mode: "wake",
  }, { id: "entry-1", now: "2026-08-17T01:05:00.000Z" });

  const normalized = normalizeSleepModeLogs([valid, { id: "empty", time: "", trainIds: [], location: "" }]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].text, "01:05 hrs – T02 successfully in wake–up mode at ED–ST02.");
});

test("Sleep logs identify West and East depot locations for separate outputs", () => {
  assert.equal(getSleepModeDepot("WD-ST15"), "west");
  assert.equal(getSleepModeDepot("wd–st14"), "west");
  assert.equal(getSleepModeDepot("ED-ST02"), "east");
  assert.equal(getSleepModeDepot("ed–st03"), "east");
  assert.equal(getSleepModeDepot("Unknown"), "");
});

test("SLP is wired as a public route with shared cloud storage", () => {
  const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const depotSource = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  const componentSource = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");
  const clientSource = readFileSync(new URL("../src/api/base44Client.js", import.meta.url), "utf8");
  const entityFunctionSource = readFileSync(new URL("../functions/api/entities/[[path]].js", import.meta.url), "utf8");

  assert.match(appSource, /path="\/sleep"/);
  assert.match(appSource, /path="\/slp"/);
  assert.doesNotMatch(depotSource, /PROTECTED_SHORTCUT_KEYS[^;]+"sleep"/);
  assert.match(depotSource, /code: "SLP"/);
  assert.match(depotSource, /<SleepModeWorkspace westData=\{westData\} eastData=\{eastData\}/);
  assert.match(componentSource, /Log Sleep/);
  assert.match(componentSource, /Log Wake-up/);
  assert.match(componentSource, /Remark optional/);
  assert.match(componentSource, /Download Excel/);
  assert.match(componentSource, /data-sleep-log-depot=\{depot\}/);
  assert.match(componentSource, /\{layout\.label\} Log Output/);
  assert.match(componentSource, /const logsByDepot = useMemo/);
  assert.match(componentSource, /getSleepModeDepot\(entry\.location\)/);
  assert.match(componentSource, /\(\["west", "east"\]\)\.map/);
  assert.match(componentSource, /buildSleepModeExcelFileName\(depotLogs, undefined, layout\.shortLabel\)/);
  assert.match(componentSource, /persistLogs\(logs\.filter\(\(entry\) => getSleepModeDepot\(entry\.location\) !== depot\)\)/);
  assert.match(clientSource, /'SleepModeLog'/);
  assert.match(entityFunctionSource, /'SleepModeLog'/);
});

test("SLP stabling typography matches the readable main-stabling scale", () => {
  const componentSource = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

  assert.match(componentSource, /slp-stabling-block-label/);
  assert.match(componentSource, /slp-stabling-road-label/);
  assert.match(componentSource, /slp-stabling-train-id/);
  assert.match(componentSource, /slp-stabling-mode-pill/);
  assert.match(cssSource, /\.slp-stabling-block-label\s*\{[^}]*font-size:\s*9px[^}]*letter-spacing:\s*0\.08em/s);
  assert.match(cssSource, /\.slp-stabling-road-label\s*\{[^}]*font-size:\s*11px/s);
  assert.match(cssSource, /\.slp-stabling-train-id\s*\{[^}]*font-size:\s*17px/s);
  assert.match(cssSource, /\.slp-stabling-mode-pill\s*\{[^}]*font-size:\s*10px[^}]*letter-spacing:\s*0\.04em/s);
  assert.doesNotMatch(componentSource, /slp-stabling-mode-pill[^\n]*text-\[8px\]/);
});

test("SLP time field has a compact current-time refresh control", () => {
  const componentSource = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");

  assert.match(componentSource, /id=\{`slp-log-time-\$\{depot\}`\}/);
  assert.match(componentSource, /onClick=\{\(\) => onUseCurrentTime\(depot\)\}/);
  assert.match(componentSource, /aria-label=\{`Set \$\{layout\.label\} SLP time to the current time`\}/);
  assert.match(componentSource, /theme-movement-time-refresh[\s\S]*?<RefreshCw size=\{10\}/);
});

test("each depot owns its Time, Remark, Sleep and Wake-up controls", () => {
  const componentSource = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");
  const panelStart = componentSource.indexOf("function DepotSleepPanel");
  const panelEnd = componentSource.indexOf("function SleepLogOutputPanel", panelStart);
  const panelSource = componentSource.slice(panelStart, panelEnd);

  assert.match(panelSource, /data-sleep-entry-controls=\{depot\}/);
  assert.match(panelSource, /Remark optional/);
  assert.match(panelSource, /onAddLogs\(depot, "sleep"\)/);
  assert.match(panelSource, /onAddLogs\(depot, "wake"\)/);
  assert.match(componentSource, /logDraft=\{logDrafts\.west\}/);
  assert.match(componentSource, /logDraft=\{logDrafts\.east\}/);
  assert.doesNotMatch(componentSource, /id="slp-log-time"/);
});

test("SLP logging clears only the selected depot and preserves its separate draft", () => {
  const componentSource = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");

  assert.match(componentSource, /const \[logDrafts, setLogDrafts\] = useState/);
  assert.match(componentSource, /const addSelectedLogs = useCallback\(\(depot, mode\)/);
  assert.match(componentSource, /selectedCells\.filter\(\(cell\) => cell\.depot === depot\)/);
  assert.match(componentSource, /current\.filter\(\(key\) => !key\.startsWith\(`\$\{depot\}:`\)\)/);
  assert.match(componentSource, /\[depot\]: \{ time: getCurrentTime\(\), remark: "" \}/);
});

test("trains already in Sleep mode use a bright distinct card state", () => {
  const componentSource = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

  assert.match(componentSource, /data-sleep-mode=\{latestMode \|\| "ready"\}/);
  assert.match(componentSource, /data-mode=\{latestMode \|\| "ready"\}/);
  assert.match(cssSource, /\.slp-stabling-train-card\[data-sleep-mode="sleep"\]:not\(\[aria-pressed="true"\]\) \{[\s\S]*?border-color: #d946ef;[\s\S]*?background: linear-gradient/);
  assert.match(cssSource, /\.slp-stabling-mode-pill\[data-mode="sleep"\] \{[\s\S]*?background: #f0abfc;[\s\S]*?box-shadow/);
  assert.match(cssSource, /html\[data-app-theme="dark"\] \.slp-stabling-train-card\[data-sleep-mode="sleep"\][\s\S]*?border-color: #e879f9/);
});

test("trains already in Wake-up mode use a bright distinct card state", () => {
  const cssSource = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

  assert.match(cssSource, /\.slp-stabling-train-card\[data-sleep-mode="wake"\]:not\(\[aria-pressed="true"\]\) \{[\s\S]*?border-color: #f59e0b;[\s\S]*?background: linear-gradient/);
  assert.match(cssSource, /\.slp-stabling-mode-pill\[data-mode="wake"\] \{[\s\S]*?background: #fbbf24;[\s\S]*?box-shadow/);
  assert.match(cssSource, /html\[data-app-theme="dark"\] \.slp-stabling-train-card\[data-sleep-mode="wake"\][\s\S]*?border-color: #fbbf24/);
});
