import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOffPeakInfoByTrain } from "../src/lib/maintenanceRemovalInfo.js";
import { selectEastNineAmOffPeakRows } from "../src/lib/eastNineAmRemoval.js";
import { getHdw40GroupRows } from "../src/lib/trainRemHdw40.js";

const panel = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const tooltip = readFileSync(new URL("../src/components/OffPeakTrainInfo.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

test("off-peak information normalizes train IDs, preserves TID pairing and deduplicates", () => {
  const rows = [
    { trainId: "T025", tid: "TID 237" },
    { trainId: "25", tid: 237 },
    { trainId: "25", tid: "238" },
    { trainId: 32, tid: "016" },
  ];
  const original = JSON.stringify(rows);
  assert.deepEqual([...buildOffPeakInfoByTrain(rows)], [
    ["25", [{ tid: "237" }, { tid: "238" }]],
    ["32", [{ tid: "016" }]],
  ]);
  assert.equal(JSON.stringify(rows), original);
});

test("blank, invalid and zero train IDs do not receive off-peak icons", () => {
  assert.equal(buildOffPeakInfoByTrain().size, 0);
  assert.equal(buildOffPeakInfoByTrain(null).size, 0);
  assert.equal(buildOffPeakInfoByTrain([
    null, {}, { trainId: "" }, { trainId: "T00" }, { trainId: "TRAIN" },
    { trainId: "T-25" }, { trainId: "T25 / T32" },
  ]).size, 0);
});

test("HDW off-peak trains appear without fabricating a TID or including HDW depot rows", () => {
  const rows = getHdw40GroupRows([
    { trainId: "06", tid: "216", hdwDepot: "west" },
    { trainId: "19", tid: "218", hdwDepot: "east" },
    { trainId: "T12", tid: "", hdwDepot: "mainline" },
  ], "mainline");
  assert.deepEqual([...buildOffPeakInfoByTrain(rows)], [["12", [{ tid: "" }]]]);
  assert.deepEqual(buildOffPeakInfoByTrain([{ trainId: "25", tid: "invalid" }]).get("25"), [{ tid: "" }]);
});

test("scheduled West/East TIDs are excluded by the existing off-peak selector", () => {
  const referenceRows = [
    { trainId: "06", tid: "216" },
    { trainId: "19", tid: "218" },
    { trainId: "25", tid: "237" },
    { trainId: "32", tid: "238" },
  ];
  const offPeakRows = selectEastNineAmOffPeakRows(referenceRows, ["216"], ["218"]);
  assert.deepEqual([...buildOffPeakInfoByTrain(offPeakRows).keys()], ["25", "32"]);
});

test("off-peak icon follows current rows and clears when assignments or presets change", () => {
  const rows = [{ trainId: "25", tid: "237" }];
  assert.equal(buildOffPeakInfoByTrain(rows).has("25"), true);
  assert.equal(buildOffPeakInfoByTrain([]).has("25"), false);
  assert.deepEqual([...buildOffPeakInfoByTrain([{ trainId: "32", tid: "238" }]).keys()], ["32"]);
});

test("main Train Request uses the existing active mainline selector, not missing stabling status", () => {
  assert.match(page, /const offPeakInfoRows = useMemo\(\s*\(\) => collectTrainRemMainlineInServiceRows\(trainRemCheckState, activeTimetable\),\s*\[trainRemCheckState, activeTimetable\]/);
  assert.equal((page.match(/offPeakRows=\{offPeakInfoRows\}/g) || []).length, 1);
  assert.match(panel, /offPeakRows = \[\]/);
  assert.match(panel, /buildOffPeakInfoByTrain\(offPeakRows\)/);
  assert.match(panel, /offPeakInfoByTrain\.get\(normalizeTrainCompareKey\(req\.trainId\)\)/);
  assert.match(panel, /offPeakReferences\?\.length > 0/);
  const row = panel.slice(panel.indexOf("const chipLabel = getRequestChipTrainLabel(req);"), panel.indexOf("const renderRequestGroupCards"));
  assert.ok(row.indexOf("<OffPeakTrainInfo") < row.indexOf("<AlreadyStatusIcon"));
  assert.ok(row.indexOf("<OffPeakTrainInfo") < row.indexOf("<StillNotAtStablingIcon"));
  assert.match(row, /depot="west"/);
  assert.match(row, /depot="east"/);
  assert.match(row, /<DeleteRequestButton/);
});

test("off-peak tooltip works on hover and keyboard focus at the current compact icon size", () => {
  assert.match(tooltip, /if \(!references\.length\) return null/);
  assert.match(tooltip, /TooltipPrimitive\.Trigger asChild/);
  assert.match(tooltip, /<button\s+type="button"/);
  assert.match(tooltip, /aria-label=\{`Off-peak train/);
  assert.match(tooltip, /h-\[15px\] w-\[15px\]/);
  assert.match(tooltip, /TooltipPrimitive\.Portal/);
  assert.match(tooltip, /sideOffset=\{6\}/);
  assert.match(tooltip, /collisionPadding=\{10\}/);
  assert.match(tooltip, />Off-peak train</);
  assert.doesNotMatch(tooltip, /Removal time|not set|transform|translate|animate-/);
});

test("off-peak uses violet in dark mode and a readable deeper violet in light mode", () => {
  assert.match(css, /\.theme-removal-info-trigger\[data-service="off-peak"\] \{\s*color: #a78bfa;/);
  assert.match(css, /\.theme-removal-info-trigger\[data-service="off-peak"\]:focus-visible/);
  assert.match(css, /html\[data-app-theme="light"\] \.theme-removal-info-trigger\[data-service="off-peak"\] svg \* \{\s*color: #7c3aed !important;/);
  assert.match(css, /\.theme-removal-info-tooltip\[data-service="off-peak"\] \{\s*border-color: #a78bfa;/);
});
