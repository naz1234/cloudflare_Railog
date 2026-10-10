import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const functions = [
  "normalizeTrainId", "cleanRequestLabel", "normalizeRequestIdentity", "hasTomorrowRequestToken",
  "isWorkshopRequestLabel", "getTrainRequestDisplayType", "getTrainRequestGroupDisplayTitle",
  "normalizeRequestGroupColorKey", "isSpecificRequestGroup", "hashRequestGroupKey",
  "requestColorRgb", "requestColorDistance", "getCustomRequestColor", "getCustomRequestStyle",
  "buildDistinctRequestGroupColorMap", "getKnownMaintenanceStyle", "buildMaintenanceMap",
];
const context = vm.createContext({ TOMORROW_REQUEST_TOKENS: new Set(["TOM", "TMR", "TMRW", "TOMORROW"]) });
vm.runInContext([
  source.match(/const MAINT_STYLES = \{[\s\S]*?\n\};/)[0],
  source.match(/const CUSTOM_REQUEST_PALETTE = \[[\s\S]*?\n\];/)[0],
  ...functions.map((name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf("\n}", start) + 2);
  }),
  source.slice(source.indexOf("const GENERIC_REQUEST_GROUP_KEYS ="), source.indexOf("function isSpecificRequestGroup(")),
].join("\n"), context);

// Reproduce the live request set where trains 26/27 had two near-identical lime pills.
const requests = [
  ["Wash 20-Aug", [42]], ["Wash 26-Aug", [3]], ["Wash 10-Oct", [14]],
  ["Wash 11-Oct", [30, 44]], ["Wash 12-Oct", [21, 1, 41, 29, 33, 27, 22, 26, 32, 11, 24, 2, 35, 9]],
  ["TLC Requests Engrng Hours", [26, 27, 37]], ["C to G 10 Oct", [45, 14, 40]],
  ["FIT but LEAST PRIORITY", [4, 2]], ["Set 25C", [36, 32]],
  ["Remove to WD", [7]], ["APU HVAC", [7]], ["C to Test track", [38]], ["UNFIT", [38]],
].flatMap(([requestType, trainIds]) => trainIds.map((trainId) => ({ trainId: String(trainId), requestType })));
const accent = (map, train, remark) => map[`T${train}`].find((item) => item.displayType === remark).remarkColorAccent;
const coloursByRemark = (map) => Object.fromEntries(Object.values(map).flat().map((item) => [item.displayType, item.remarkColorAccent]).sort());
// Compare the displayed flat pastel fills, not just the original accent hex codes.
const pastelDistance = (first, second) => {
  const channels = (hex) => hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) * 0.42 + 255 * 0.58);
  const a = channels(first);
  const b = channels(second);
  return Math.hypot(...a.map((value, index) => value - b[index]));
};

test("TLC and Wash 12 Oct are visibly separated on trains 26/27 in the live request set", () => {
  const map = context.buildMaintenanceMap(requests);
  assert.ok(pastelDistance("#a3e635", "#84cc16") < 25, "the previous two green shades reproduce the problem");
  for (const train of [26, 27]) {
    assert.ok(pastelDistance(accent(map, train, "TLC Requests Engrng Hours"), accent(map, train, "Wash 12-Oct")) > 80);
  }
  for (const items of Object.values(map)) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        assert.ok(pastelDistance(items[i].remarkColorAccent, items[j].remarkColorAccent) > 65,
          `${items[i].displayType} and ${items[j].displayType} must be distinguishable on the same train`);
      }
    }
  }
});

test("matching remarks stay the same across trains and request order does not affect colours", () => {
  const map = context.buildMaintenanceMap(requests);
  assert.equal(accent(map, 26, "TLC Requests Engrng Hours"), accent(map, 27, "TLC Requests Engrng Hours"));
  assert.equal(accent(map, 26, "Wash 12-Oct"), accent(map, 33, "Wash 12-Oct"));
  assert.deepEqual(coloursByRemark(context.buildMaintenanceMap([...requests].reverse())), coloursByRemark(map));
  assert.deepEqual(coloursByRemark(context.buildMaintenanceMap([...requests, ...requests])), coloursByRemark(map));
});

test("equivalent date spellings and train IDs share one remark colour", () => {
  const map = context.buildMaintenanceMap([
    { trainId: "026", requestType: "Wash 12Oct" },
    { trainId: "T26", requestType: "TLC Requests Engrng Hours" },
    { trainId: "27", requestType: "WASH 12-OCT" },
  ]);
  assert.equal(accent(map, 26, "Wash 12Oct"), accent(map, 27, "WASH 12-OCT"));
  assert.ok(pastelDistance(accent(map, 26, "Wash 12Oct"), accent(map, 26, "TLC Requests Engrng Hours")) > 80);
});

test("more groups than palette colours do not give adjacent remarks an identical hash-based colour", () => {
  const labels = Array.from({ length: 36 }, (_, index) => `Request ${index + 1}`);
  const pairs = labels.slice(1).map((label, index) => [labels[index], label]);
  const colors = context.buildDistinctRequestGroupColorMap(labels, { includeGeneric: true, contrastGroups: pairs });
  for (const [first, second] of pairs) {
    assert.notEqual(colors[first.toUpperCase()], colors[second.toUpperCase()], `${first} and ${second}`);
  }
});
