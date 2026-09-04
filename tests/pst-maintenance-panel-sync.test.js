import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const maintenancePanelSource = readFileSync(
  new URL("../src/components/MaintenancePanel.jsx", import.meta.url),
  "utf8",
);
const apiClientSource = readFileSync(
  new URL("../src/api/base44Client.js", import.meta.url),
  "utf8",
);
const entityApiSource = readFileSync(
  new URL("../functions/api/entities/[[path]].js", import.meta.url),
  "utf8",
);
const schema = JSON.parse(readFileSync(
  new URL("../base44/entities/PSTMaintenanceRequest.jsonc", import.meta.url),
  "utf8",
));

const pstCellSource = pageSource.slice(
  pageSource.indexOf("function PSTCell"),
  pageSource.indexOf("function PSTStablingSection"),
);
const pstTabSource = pageSource.slice(
  pageSource.indexOf("function PSTTabContent"),
  pageSource.indexOf("function parsePossessionTimeTo24"),
);
const pstTabRender = pageSource.slice(
  pageSource.indexOf('{activeTab === "pst"'),
  pageSource.indexOf('{activeTab === "possession"'),
);

test("PST remarks use a dedicated synced entity", () => {
  assert.match(apiClientSource, /'PSTMaintenanceRequest'/);
  assert.match(entityApiSource, /'PSTMaintenanceRequest'/);
  assert.equal(schema.name, "PSTMaintenanceRequest");
  assert.deepEqual(schema.required, ["trainId", "requestType"]);
  assert.match(pageSource, /const \[pstRequests, setPstRequests\] = useState\(\[\]\)/);
  assert.match(pageSource, /base44\.entities\.PSTMaintenanceRequest\.list\(\)/);
  assert.match(pageSource, /base44\.entities\.PSTMaintenanceRequest\.create\(payload\)/);
  assert.match(pageSource, /base44\.entities\.PSTMaintenanceRequest\.update/);
  assert.match(pageSource, /base44\.entities\.PSTMaintenanceRequest\.delete/);
});

test("PST cards show only PST-entered remarks without APU keyword detection", () => {
  assert.match(pstCellSource, /const pstRemarkItems = key/);
  assert.match(pstCellSource, /maintenanceMap\?\.\[key\]/);
  assert.match(pstCellSource, /theme-pst-request-remark/);
  assert.doesNotMatch(pstCellSource, /\\bAPU\\b/i);
  assert.doesNotMatch(pstCellSource, /block\?\.extraRemark/);
  assert.match(pageSource, /const pstMaintenanceMap = buildMaintenanceMap\([\s\S]*?pstRequests\.filter/);
  assert.match(pstTabRender, /maintenanceMap=\{pstMaintenanceMap\}/);
});

test("PST renders its own MaintenancePanel controls", () => {
  assert.match(maintenancePanelSource, /panelTitle = "Maintenance"/);
  assert.match(maintenancePanelSource, /listTitle = "Train Request"/);
  assert.match(pstTabSource, /<MaintenancePanelShell[\s\S]*?requests=\{pstRequests\}/);
  assert.match(pstTabSource, /onAdd=\{onAddPSTRequest\}/);
  assert.match(pstTabSource, /onRemove=\{onRemovePSTRequest\}/);
  assert.match(pstTabSource, /onClearAll=\{onClearPSTRequests\}/);
  assert.match(pstTabSource, /onRenameGroup=\{onRenamePSTRequestGroup\}/);
  assert.match(pstTabSource, /onDeleteGroup=\{onDeletePSTRequestGroup\}/);
  assert.match(pstTabSource, /onToggleGroupHidden=\{onTogglePSTRequestGroupHidden\}/);
  assert.match(pstTabSource, /panelTitle="PST Remarks"/);
  assert.match(pstTabSource, /listTitle="PST Remark List"/);
  assert.match(pstTabSource, /requestTypeLabel="PST Remark"/);
  assert.match(pstTabSource, /addButtonLabel="Add Remark"/);
  assert.match(pstTabSource, /showImportTools=\{false\}/);
});
