import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const stylesheetSource = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

const sheetStart = pageSource.indexOf("function TrainMovementExcelSheet");
const sheetEnd = pageSource.indexOf("function cleanMovementCustomTimeInput", sheetStart);
const sheetSource = pageSource.slice(sheetStart, sheetEnd);

function getFunctionSource(name) {
  const start = pageSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = pageSource.indexOf("\nfunction ", start + 1);
  assert.notEqual(end, -1, `${name} must have a following function`);
  return pageSource.slice(start, end);
}

const helperSource = [
  "normalizeTrainId",
  "formatStablingRoadForPopup",
  "getMainStablingLocations",
].map(getFunctionSource).join("\n");
const getLocations = new Function(`${helperSource}\nreturn getMainStablingLocations;`)();

const searchStart = sheetSource.indexOf("  const trainSearchKey =");
const searchEnd = sheetSource.indexOf("  const copyExcelLogRows =", searchStart);
assert.ok(searchStart >= 0 && searchEnd > searchStart);
const searchSource = sheetSource.slice(searchStart, searchEnd);
const search = new Function(
  "trainSearch", "stabledTrainLocations", "rows", "sortedLogRows",
  `${getFunctionSource("normalizeTrainId")}\n${searchSource}
   return { trainSearchResults, trainSearchFound, trainSearchNotFound };`,
);

test("movement log section receives current West and East main stabling locations", () => {
  assert.match(pageSource, /<TrainMovementExcelSheet\b[^>]*stabledTrainLocations=\{getMainStablingLocations\(westData, eastData\)\}/);
  assert.match(sheetSource, /stabledTrainLocations = \{\}/);
  assert.match(searchSource, /stabledTrainLocations\[trainSearchKey\]/);
  assert.doesNotMatch(searchSource, /\b(?:rows|logRows|sortedLogRows)\b/);
});

test("numeric, padded, lowercase and spaced queries find the same stabled train", () => {
  const locations = getLocations({ "WD-ST15": [{ trainId: "T01" }] }, {});
  for (const query of ["1", "01", "T1", "T01", " t 001 "]) {
    assert.deepEqual(search(query, locations), {
      trainSearchResults: ["West Depot STB 15 Block 01"],
      trainSearchFound: true,
      trainSearchNotFound: false,
    });
  }
});

test("both depots report the actual road and block, including duplicate train locations", () => {
  const west = { "WD-ST2": [null, { trainId: "T007" }] };
  const east = { "ED-ST10": [null, null, null, null, null, null, { trainId: "7" }] };
  assert.deepEqual(search("T07", getLocations(west, east)).trainSearchResults, [
    "West Depot STB 02 Block 02",
    "East Depot STB 10 Block 07",
  ]);
  assert.deepEqual(search("7", getLocations({}, east)).trainSearchResults, [
    "East Depot STB 10 Block 07",
  ]);
});

test("blank queries are idle and unknown trains show not found", () => {
  const locations = getLocations({ "WD-ST15": [null, { trainId: "" }] }, {});
  for (const query of ["", "   "]) {
    assert.deepEqual(search(query, locations), {
      trainSearchResults: [], trainSearchFound: false, trainSearchNotFound: false,
    });
  }
  for (const query of ["T10", "constructor", "__proto__"]) {
    assert.deepEqual(search(query, locations), {
      trainSearchResults: [], trainSearchFound: false, trainSearchNotFound: true,
    });
  }
});

test("spreadsheet trains, replacements and saved log entries never count as stabling matches", () => {
  const rows = [{ trainId: "T03", replacedBy: "T04", depot: "west" }];
  const logs = [{ train: "T05", text: "T03 swapped with T04", depot: "east" }];
  for (const query of ["T03", "T04", "T05"]) {
    assert.deepEqual(search(query, getLocations({}, {}), rows, logs), {
      trainSearchResults: [], trainSearchFound: false, trainSearchNotFound: true,
    });
  }
});

test("results follow stabling updates without requiring a new search query", () => {
  const west = { "WD-ST1": [{ trainId: "T06" }] };
  assert.deepEqual(search("6", getLocations(west, {})).trainSearchResults, [
    "West Depot STB 01 Block 01",
  ]);
  const east = { "ED-ST3": [null, null, { trainId: "T06" }] };
  assert.deepEqual(search("6", getLocations({}, east)).trainSearchResults, [
    "East Depot STB 03 Block 03",
  ]);
  assert.equal(search("6", getLocations({}, {})).trainSearchNotFound, true);
});

test("combined movement section labels the lookup as stabling search and announces locations", () => {
  assert.match(sheetSource, /placeholder="Search train ID in West and East Depot stabling…"/);
  assert.match(sheetSource, /aria-label="Search train ID in West and East Depot stabling"/);
  assert.match(sheetSource, /role="status" aria-live="polite"/);
  assert.match(sheetSource, /trainSearchResults\.map\(\(location\)/);
  assert.match(sheetSource, />\{location\}<\/span>/);
  assert.match(sheetSource, /not found in West or East Depot stabling/);
  assert.match(sheetSource, /onClick=\{\(\) => setTrainSearch\(""\)\}/);
});

test("stabling lookup no longer highlights unrelated spreadsheet rows or saved logs", () => {
  assert.doesNotMatch(pageSource, /trainMovementRowMatchesSearch|trainMovementLogEntryMatchesSearch/);
  assert.doesNotMatch(sheetSource, /is-search-match/);
  assert.doesNotMatch(stylesheetSource, /theme-movement-sheet-row\.is-search-match|theme-movement-log-line\.is-search-match/);
});

test("TID arrival search appears only in the movement log with the selected timetable", () => {
  assert.equal((pageSource.match(/<Arrival3A1P2Lookup\b/g) || []).length, 1);
  assert.match(sheetSource, /<Arrival3A1P2Lookup\s+activeTimetable=\{activeTimetable\}\s+activeTimetableType=\{activeTimetableType\}/);
  assert.match(pageSource, /<TrainMovementExcelSheet\b[^>]*activeTimetableType=\{selectedTimetableType\}/);
  assert.ok(sheetSource.indexOf("theme-movement-train-search") < sheetSource.indexOf("<Arrival3A1P2Lookup"));
  assert.ok(sheetSource.indexOf("<Arrival3A1P2Lookup") < sheetSource.indexOf("<table"));
  const removalPlanSource = getFunctionSource("TrainRequestedNotInRemoval");
  assert.doesNotMatch(removalPlanSource, /Arrival3A1P2Lookup|arrivalLookupTime/);
  assert.match(removalPlanSource, /<RequestedTrainActionOverviewTable/);
});

test("relocated TID lookup owns its 30-second clock and cleans it up on unmount", () => {
  const lookupSource = getFunctionSource("Arrival3A1P2Lookup");
  const effectStart = lookupSource.indexOf("  useEffect(() => {");
  const effectEnd = lookupSource.indexOf("  const normalizedTid", effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  const updates = [];
  let tick;
  let cleanup;
  let cleared;
  const intervalId = Symbol("arrival clock");
  const runEffect = new Function(
    "useEffect", "setLookupTime", "setInterval", "clearInterval",
    lookupSource.slice(effectStart, effectEnd),
  );
  runEffect(
    (effect, dependencies) => { assert.deepEqual(dependencies, []); cleanup = effect(); },
    (time) => updates.push(time),
    (callback, delay) => { assert.equal(delay, 30000); tick = callback; return intervalId; },
    (id) => { cleared = id; },
  );
  assert.equal(updates.length, 1);
  tick();
  assert.equal(updates.length, 2);
  assert.ok(updates.every((time) => time instanceof Date && !Number.isNaN(time.getTime())));
  cleanup();
  assert.equal(cleared, intervalId);
  assert.match(lookupSource, /getTimetableArrival3A1P2Time\(activeTimetable, normalizedTid, lookupTime\)/);
});
