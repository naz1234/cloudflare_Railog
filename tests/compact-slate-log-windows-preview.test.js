import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { base44, seedPreviewRecords, seedPreviewMovementRecord } from "../scripts/preview-compact-slate-api.js";

const preview = readFileSync(new URL("../scripts/preview-compact-slate.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../scripts/preview-compact-slate.mjs", import.meta.url), "utf8");
const css = readFileSync(new URL("../scripts/preview-compact-slate.css", import.meta.url), "utf8");
const production = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");

test("the four requested windows reuse live components in production order below stabling", () => {
  const components = ["StablingSection", "TrainMovementExcelSheet", "RequestedTrainActionSummary", "RemovalLogOutputFromTrainRem", "OfficialEastExcelGenerator"];
  const positions = components.map((name) => preview.indexOf(`<${name}`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  const productionPositions = components.map((name) => production.indexOf(`<${name}`));
  assert.ok(productionPositions.every((position) => position >= 0));
  assert.deepEqual(productionPositions, [...productionPositions].sort((a, b) => a - b));
  for (const name of components.slice(1, 4)) assert.match(server, new RegExp(`export \\{[^}]*${name}`));
  assert.match(preview, /import OfficialEastExcelGenerator from "\.\.\/src\/components\/OfficialEastExcelGenerator"/);
});

test("logs and generator receive the same local removal state, requests, timetable and stabling", () => {
  assert.match(preview, /<TrainMovementExcelSheet[\s\S]*?requests=\{requests\}[\s\S]*?trainRemState=\{removalState\}[\s\S]*?stabledTrainLocations=\{stablingLocations\}/);
  assert.match(preview, /<RemovalLogOutputFromTrainRem[\s\S]*?trainRemState=\{removalState\}[\s\S]*?maintenanceMap=\{requestMaps\.visible\}[\s\S]*?requests=\{requests\}[\s\S]*?westData=\{stabling\.west\} eastData=\{stabling\.east\}/);
  assert.match(preview, /<RequestedTrainActionSummary requests=\{requests\}/);
  for (const depot of ["west", "east"]) {
    assert.ok(preview.includes(`buildTrainRemRemovalLog(removalState, "${depot}", requestMaps.visible, previewTimetable, stabling.${depot})`));
  }
});

test("local movement samples cover all three operations and reset without a production client", () => {
  for (const operation of ["swapping", "insertion", "removal"]) assert.ok(preview.includes(`operation: "${operation}"`));
  assert.match(preview, /\.map\(createTrainMovementExcelRow\)/);
  assert.match(preview, /seedPreviewMovementRecord\(/);
  assert.match(preview, /saveTrainMovementExcelDirty\(false\)/);
  assert.match(preview, /setRemovalState\(seed\(\)\)/);
  assert.match(preview, /key=\{`movement-\$\{revision\}`\}/);
  assert.match(server, /replacement: path\.join\(root, "scripts\/preview-compact-slate-api\.js"\)/);
  assert.match(server, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(preview, /base44\.entities|fetch\(/);
});

test("preview shortcuts scroll inside the workspace and keep the existing stabling width", () => {
  assert.match(preview, /aria-label="Preview panel shortcuts"/);
  assert.match(preview, /workspace\.scrollTo\(/);
  assert.match(preview, /panel\.getBoundingClientRect\(\)\.top - workspace\.getBoundingClientRect\(\)\.top/);
  assert.match(css, /\.slate-preview-depots \{[^}]*width: 954px;/);
  assert.match(css, /\.slate-preview-live-window \{ width: 100%; min-width: 0;/);
});

test("movement live sync updates only cloned in-memory fixtures and preserves removal fixtures", async () => {
  seedPreviewRecords([{ id: "preview-west", depot: "west" }]);
  const fixture = { id: "preview-movement", recordKey: "main", rows: [{ id: "local-row", trainId: "23" }] };
  seedPreviewMovementRecord(fixture);
  fixture.rows[0].trainId = "99";
  const movement = base44.entities.TrainMovementExcelLive;
  const listed = await movement.list();
  assert.equal(listed[0].rows[0].trainId, "23");
  listed[0].rows[0].trainId = "88";
  assert.equal((await movement.filter({ recordKey: "main" }))[0].rows[0].trainId, "23");
  await movement.update("preview-movement", { rows: [{ id: "local-row", trainId: "42" }] });
  assert.equal((await movement.list())[0].rows[0].trainId, "42");
  assert.deepEqual(await base44.entities.TrainRem.list(), [{ id: "preview-west", depot: "west" }]);
});
