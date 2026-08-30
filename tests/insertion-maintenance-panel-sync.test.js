import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import requestGroupVisibilityPlugin from "../build/requestGroupVisibilityPlugin.js";

const depotStablingUrl = new URL("../src/pages/DepotStabling.jsx", import.meta.url);
const depotStablingSource = readFileSync(
  depotStablingUrl,
  "utf8",
);
const maintenancePanelSource = readFileSync(
  new URL("../src/components/MaintenancePanel.jsx", import.meta.url),
  "utf8",
);
const lightModeFixStyles = readFileSync(
  new URL("../src/insertionMaintenanceLightFix.css", import.meta.url),
  "utf8",
);
const mainEntrySource = readFileSync(
  new URL("../src/main.jsx", import.meta.url),
  "utf8",
);

const insertionComponent = depotStablingSource.slice(
  depotStablingSource.indexOf("function InsertionTabContent"),
  depotStablingSource.indexOf("// ── Train Movement Internal Page"),
);
const stablingTabRender = depotStablingSource.slice(
  depotStablingSource.indexOf('{activeTab === "stabling"'),
  depotStablingSource.indexOf('{activeTab === "movement"'),
);
const insertionTabRender = depotStablingSource.slice(
  depotStablingSource.indexOf('{activeTab === "insertion"'),
  depotStablingSource.indexOf('{activeTab === "washing"'),
);

test("Insertion renders the same MaintenancePanel component used by Train Request", () => {
  assert.match(depotStablingSource, /function MaintenancePanelShell\(props\)/);
  assert.match(depotStablingSource, /<MaintenancePanel \{\.\.\.props\} \/>/);
  assert.match(stablingTabRender, /<MaintenancePanel[\s\S]*requests=\{requests\}/);
  assert.match(insertionComponent, /<MaintenancePanelShell[\s\S]*requests=\{maintenanceRequests\}/);
});

test("Insertion receives the shared request list and every Train Request mutation handler", () => {
  assert.match(insertionTabRender, /maintenanceRequests=\{requests\}/);
  assert.match(insertionTabRender, /onAddMaintenanceRequest=\{handleAddRequest\}/);
  assert.match(insertionTabRender, /onRemoveMaintenanceRequest=\{handleRemoveRequest\}/);
  assert.match(insertionTabRender, /onClearMaintenanceRequests=\{handleClearAllRequests\}/);
  assert.match(insertionTabRender, /onRenameMaintenanceRequestGroup=\{handleRenameRequestGroup\}/);
  assert.match(insertionTabRender, /onDeleteMaintenanceRequestGroup=\{handleDeleteRequestGroup\}/);

  assert.match(insertionComponent, /onAdd=\{onAddMaintenanceRequest\}/);
  assert.match(insertionComponent, /onRemove=\{onRemoveMaintenanceRequest\}/);
  assert.match(insertionComponent, /onClearAll=\{onClearMaintenanceRequests\}/);
  assert.match(insertionComponent, /onRenameGroup=\{onRenameMaintenanceRequestGroup\}/);
  assert.match(insertionComponent, /onDeleteGroup=\{onDeleteMaintenanceRequestGroup\}/);
});

test("Insertion receives the production request-group visibility handler", () => {
  const transformedSource = requestGroupVisibilityPlugin().transform(
    depotStablingSource,
    depotStablingUrl.pathname,
  )?.code || "";

  assert.match(
    transformedSource,
    /onToggleMaintenanceRequestGroupHidden=\{handleToggleRequestGroupHidden\}/,
  );
  assert.match(
    transformedSource,
    /<InsertionTabContent[\s\S]*?maintenanceMap=\{visibleRequestMaintenanceMap\}/,
  );
  assert.match(
    insertionComponent,
    /onToggleGroupHidden=\{onToggleMaintenanceRequestGroupHidden\}/,
  );
});

test("Insertion reuses shared stabling locations for request status", () => {
  assert.match(insertionTabRender, /stabledTrainIds=\{Array\.from\(westStablingKeys\)\}/);
  assert.match(insertionTabRender, /stabledTrainLocations=\{getMainStablingLocations\(westData, eastData\)\}/);
  assert.match(insertionComponent, /stabledTrainIds=\{stabledTrainIds\}/);
  assert.match(insertionComponent, /stabledTrainLocations=\{stabledTrainLocations\}/);
});

test("Insertion hides the CMMS Excel and Train Request image import tools only", () => {
  assert.match(maintenancePanelSource, /showImportTools = true/);
  assert.match(
    maintenancePanelSource,
    /\{showImportTools && \([\s\S]*data-testid="cmms-wash-review-card"[\s\S]*<MaintenanceImageSummary requests=\{requests\} onAdd=\{onAdd\} \/>[\s\S]*\)\}/,
  );
  assert.match(insertionComponent, /showImportTools=\{false\}/);
  assert.doesNotMatch(stablingTabRender, /showImportTools=\{false\}/);
});

test("Insertion keeps Maintenance directly beside the actual depot content width", () => {
  assert.match(
    insertionComponent,
    /className="grid min-w-0 items-start gap-2"[\s\S]*gridTemplateColumns: "max-content 276px"/,
  );
  assert.doesNotMatch(insertionComponent, /gridTemplateColumns: "minmax\(1230px, 1fr\) 276px"/);
});

test("light mode does not clip the Insertion Maintenance panel", () => {
  assert.match(mainEntrySource, /import '@\/insertionMaintenanceLightFix\.css'/);
  assert.match(
    lightModeFixStyles,
    /html\[data-app-theme="light"\] \.theme-insertion-page \{\s*overflow: visible !important;/,
  );
  assert.match(
    lightModeFixStyles,
    /html\[data-app-theme="light"\] \.theme-insertion-page \.maintenance-panel-shell \{[\s\S]*?z-index: 3;[\s\S]*?min-width: 276px;/,
  );
  assert.doesNotMatch(
    lightModeFixStyles,
    /html\[data-app-theme="dark"\] \.theme-insertion-page/,
  );
});
