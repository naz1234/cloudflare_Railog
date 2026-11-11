import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { findStablingTrainLocations, parseStablingTrainSearch } from "../src/lib/stablingTrainSearch.js";

const source = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

const insertionSectionStart = source.indexOf("function InsertionStablingSection");
const insertionSectionEnd = source.indexOf("function RemovalSummaryTooltip", insertionSectionStart);
const insertionSectionSource = source.slice(insertionSectionStart, insertionSectionEnd);

test("West and East insertion sections both receive the cross-depot search data", () => {
  const sharedSearchProp = "allDepots={insertionSearchDepots}";

  assert.equal(source.split(sharedSearchProp).length - 1, 2);
  assert.match(source, /data: westSection\?\.data \|\| \{\}/);
  assert.match(source, /data: eastSection\?\.data \|\| \{\}/);
  const parent = source.slice(source.indexOf('function InsertionTabContent('), source.indexOf('function TrainMovementExcelSheet('));
  assert.equal((parent.match(/trainSearch=\{trainSearch\}/g) || []).length, 2);
  assert.equal((parent.match(/onTrainSearchChange=\{setTrainSearch\}/g) || []).length, 2);
});

test("insertion train search reports depot, road, and block for the active PG data", () => {
  assert.match(insertionSectionSource, /placeholder="Search trains, e.g. 01 02 03"/);
  assert.match(insertionSectionSource, /findStablingTrainLocations\(trainKeys, allDepots\)/);
  assert.match(insertionSectionSource, /result\.trainKey\.slice\(1\)\.padStart\(2, "0"\)/);
  assert.match(insertionSectionSource, /not found in either insertion depot/);
});

test("matching insertion train cards receive the yellow search highlight", () => {
  assert.match(insertionSectionSource, /isSearchMatch=\{searchTrainKeys\.has\(normalizeTrainId\(block\?\.trainId/);
  assert.match(source, /const insCardBorder = isSearchMatch\s*\? "2px solid #facc15"/);
  assert.match(source, /const insCardGlow = isSearchMatch/);
});

test("INS multi-search runs against both active depot snapshots and keeps missing trains separate", () => {
  const start = insertionSectionSource.indexOf('  const [localSearch');
  const end = insertionSectionSource.indexOf('\n  useEffect(', start);
  const searchCode = insertionSectionSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  const lookup = new Function('parseStablingTrainSearch', 'findStablingTrainLocations', `return (trainSearch, allDepots) => {
    const useState = initial => [initial, () => {}], useMemo = factory => factory();
    const onTrainSearchChange = undefined, roads = ['WD-ST15'], WEST_ROADS = roads;
    ${searchCode}\nreturn {trainKeys,invalidTokens,locationResults,missingTrainKeys,searched,found,notFound};
  };`)(parseStablingTrainSearch, findStablingTrainLocations);
  const west = { 'WD-ST15': [{ trainId: '01' }, { trainId: 'T02' }] };
  const east = { 'ED-ST02': [{ trainId: '03' }, { trainId: '01' }] };
  const depots = [
    { depotLabel: 'West Depot', roads: ['WD-ST15'], data: west, blockIndices: [1, 0], blockLabels: ['BLOCK 2', 'BLOCK 1'] },
    { depotLabel: 'East Depot', roads: ['ED-ST02'], data: east, blockIndices: [0, 1], blockLabels: ['BLOCK 1', 'BLOCK 2'] },
  ];
  const before = structuredClone(depots);
  const result = lookup('01,03 T001 47 BAD', depots);
  assert.deepEqual(result.trainKeys, ['T1', 'T3', 'T47']);
  assert.deepEqual(result.invalidTokens, ['BAD']);
  assert.deepEqual(result.missingTrainKeys, ['T47']);
  assert.deepEqual(result.locationResults.map(item => [item.trainKey, item.depotLabel, item.blockLabel]), [
    ['T1', 'West Depot', 'BLOCK 1'], ['T1', 'East Depot', 'BLOCK 2'], ['T3', 'East Depot', 'BLOCK 1'],
  ]);
  assert.equal(result.found, true);
  assert.equal(result.notFound, false);
  assert.deepEqual(depots, before);
  east['ED-ST02'][0].trainId = '';
  assert.deepEqual(lookup('01 03 47', depots).missingTrainKeys, ['T3', 'T47']);
  assert.equal(lookup('', depots).searched, false);
  assert.equal(lookup('99', depots).notFound, true);
});

test("INS highlights each normalized searched train and Clear/Escape do not call save or insertion handlers", () => {
  const expression = insertionSectionSource.match(/isSearchMatch=\{([^\n]+?)\} \/>/)?.[1];
  assert.ok(expression);
  const matches = new Function('parseStablingTrainSearch', `return (query, block) => {
    const searchTrainKeys = new Set(parseStablingTrainSearch(query).trainKeys);
    const normalizeTrainId = value => value ? 'T' + Number(String(value).replace(/[^0-9]/g,'')) : '';
    return ${expression};
  };`)(parseStablingTrainSearch);
  for (const trainId of ['01', 'T002', '03']) assert.equal(matches('01 02 03', {trainId}), true);
  for (const trainId of ['04', '', undefined]) assert.equal(matches('01 02 03', {trainId}), false);
  assert.equal(matches('', {trainId:'01'}), false);
  assert.match(insertionSectionSource, /event\.key === "Escape"\) setSectionSearch\(""\)/);
  assert.match(insertionSectionSource, /onClick=\{\(\) => setSectionSearch\(""\)\}/);
  assert.match(insertionSectionSource, /maxLength=\{512\}/);
});
