import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/movementLogSlate.css", import.meta.url), "utf8");
const baseCss = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const sheetStart = page.indexOf("function TrainMovementExcelSheet(");
const sheet = page.slice(sheetStart, page.indexOf("\nfunction ", sheetStart + 1));
const rule = (name) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1];

test("movement log adopts the Removal Summary frame, title icon and ready-count header", () => {
  assert.match(page, /import "\.\.\/movementLogSlate\.css";/);
  assert.match(sheet, /<section data-movement-design="compact-slate" className="theme-movement-sheet/);
  assert.match(sheet, /className="slate-movement-title-icon" aria-hidden="true"><FileSpreadsheet size=\{15\}/);
  assert.match(sheet, /<h2 className="slate-movement-title">Train Swapping \/ Insertion \/ Removal Log<\/h2>/);
  assert.match(sheet, /<span>Added<\/span><strong>\{readyCount\}<\/strong>/);
  assert.match(sheet, /aria-label=\{`\$\{readyCount\} movements added to the log`\}/);
  assert.match(css, /border-radius: 28px;/);
  assert.match(rule("slate-movement-title"), /font-size: 16px;\s*font-weight: 700;\s*letter-spacing: -\.035em;/);
  assert.match(rule("slate-movement-title-icon"), /width: 30px;\s*height: 30px;/);
  assert.match(css, /\.slate-movement-title-icon svg \{[^}]*stroke: var\(--movement-muted\) !important;/);
  assert.match(css, /\.slate-movement-count > strong \{[^}]*font-size: 24px;/);
  assert.match(rule("slate-movement-count"), /background: transparent !important;/);
  assert.match(rule("slate-movement-count"), /box-shadow: none !important;/);
  assert.match(rule("slate-movement-count"), /border: 0;\s*border-left: 1px solid var\(--movement-line\) !important;/);
});

test("compact top header contains the actions without a toolbar or live-status badge", () => {
  const header = sheet.slice(sheet.indexOf('<div className="theme-movement-sheet-header'), sheet.indexOf("{feedback && ("));
  assert.match(header, /className="slate-movement-actions"/);
  assert.doesNotMatch(sheet, /slate-movement-toolbar|theme-movement-live-status|liveStatusText|Live ready|Live synced|Syncing\.\.\./);
  assert.match(sheet, /onClick=\{addRow\}/);
  assert.match(sheet, /onClick=\{copyAllRows\}/);
  assert.match(sheet, /onClick=\{clearRows\}/);
  assert.match(sheet, /confirmClearTarget === "sheet" \? "Confirm Clear" : "Clear"/);
  assert.match(sheet, /role="status">\{feedback\}/);
  assert.match(sheet, /copyStatuses\.sheet === "copied" \? "Copied"/);
  assert.match(sheet, /scheduleTrainMovementExcelLiveSave\(payload\)/);
  assert.match(sheet, /setLiveLastSynced\(new Date\(\)\)/);
  assert.match(css, /@container movement-sheet \(max-width: 820px\)/);
  assert.match(css, /\.slate-movement-actions > button \{[^}]*height: 30px !important;[^}]*border-radius: 8px !important;[^}]*cursor: pointer;/);
  assert.match(css, /\.slate-movement-actions > button\.is-confirming \{[^}]*background: #b83349 !important;/);
  assert.match(css, /\.slate-movement-actions > button:focus-visible \{/);
});

test("search layout responds to panel width and preserves both lookup components and result states", () => {
  assert.match(css, /@container movement-sheet \(min-width: 740px\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /theme-movement-train-search\.is-empty/);
  assert.match(css, /theme-train-rem-search:has\(input:placeholder-shown\)/);
  assert.match(sheet, /aria-label="Search train ID in West and East Depot stabling"/);
  assert.match(sheet, /trainSearchFound \? "is-found" : trainSearchNotFound \? "is-not-found"/);
  assert.match(sheet, /<Arrival3A1P2Lookup\s+activeTimetable=\{activeTimetable\}\s+activeTimetableType=\{activeTimetableType\}/);
});

test("the redundant output header is hidden while both depot log windows and their content remain", () => {
  assert.doesNotMatch(sheet, /theme-movement-log-title-icon|Train Swapping \/ Insertion \/ Removal Log Output|Copy all movement log output|clearExcelLogRows|westLogCount|eastLogCount/);
  assert.match(sheet, /aria-label="Train swapping, insertion and removal output logs"/);
  assert.match(sheet, /className="theme-movement-log-output/);
  for (const depot of ["west", "east"]) {
    assert.match(sheet, new RegExp(`key: "${depot}"`));
    assert.match(sheet, new RegExp(`rows: ${depot}MovementLogRows`));
    const label = depot === "west" ? "West" : "East";
    assert.match(sheet, new RegExp(`copyLabel: "Copy ${label} Log"`));
  }
  assert.match(sheet, /onClick=\{\(\) => copyExcelLogRows\(log.key\)\}/);
  assert.match(sheet, /data-depot=\{log.key\} className="theme-movement-log-card/);
  assert.match(sheet, /\{logText\}/);
  assert.match(sheet, /const \[logRows, setLogRows\] = useState\(\(\) => loadTrainMovementExcelLogRows\(\)\)/);
  assert.match(sheet, /saveTrainMovementExcelLogRows\(logRows\)/);
});

test("N/A is plain text in both themes on matching cells without changing replacement editing", () => {
  assert.match(css, /--movement-row: #071828;/);
  assert.match(css, /--movement-row: #ffffff;/);
  assert.match(css, /--movement-row-alt: #f8fafc;/);
  assert.match(css, /\.theme-movement-sheet-table tbody td \{[^}]*background: var\(--movement-row\) !important;/);
  assert.match(css, /\.theme-movement-sheet-table tbody tr:nth-child\(even\) td \{\s*background: var\(--movement-row-alt\) !important;/);
  assert.match(css, /html\[data-app-theme\][^{}]*\.theme-movement-na \{/);
  assert.match(rule("theme-movement-na"), /background: transparent !important;\s*border: 0 !important;\s*border-radius: 0 !important;\s*box-shadow: none !important;/);
  assert.match(rule("theme-movement-na"), /font-size: 12px;\s*font-weight: 400;\s*letter-spacing: 0;/);
  assert.match(rule("theme-movement-na"), /color: var\(--movement-na-text\) !important;/);
  assert.match(css, /--movement-na-text: #94a3b8;/);
  assert.match(css, /--movement-na-text: #475569;/);
  assert.match(sheet, /row.operation !== "swapping" \? \(\s*<div className="theme-movement-na/);
  assert.match(sheet, /<input value=\{row.replacedBy\} onChange=\{\(e\) => updateRow\(row.id, "replacedBy"/);
});

test("styling is scoped to this panel and leaves table editing and other windows alone", () => {
  assert.match(css, /--movement-panel: #0b1f33;/);
  assert.match(css, /--movement-panel: #edf2f7;/);
  assert.match(css, /--movement-line: #d7e2ee;/);
  assert.match(sheet, /<TrainMovementTypeSelect\s+value=\{row.operation\}/);
  assert.match(sheet, /onClick=\{\(\) => beginSwapCellEdit\(row.id, "tid"\)\}/);
  assert.match(sheet, /onClick=\{\(\) => setRowCurrentTime\(row.id\)\}/);
  assert.doesNotMatch(css, /theme-pst|theme-insertion|theme-request-type-summary|official-depot-excel-generator|theme-removal-log-output|theme-movement-type-popup/);
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim()).filter((selector) => !selector.startsWith("@") && !selector.startsWith("/*"));
  assert.ok(selectors.every((selector) => selector.includes('.theme-movement-sheet[data-movement-design="compact-slate"]')));
});

test("table controls stay static and accessible while type arrows keep their original motion and glow", () => {
  const typeIcon = css.match(/\.theme-movement-sheet-table tbody td:nth-child\(2\)::before \{([^}]*)\}/)?.[1];
  assert.doesNotMatch(typeIcon, /animation:|transform:|opacity:|will-change:|text-shadow:|font-weight:/);
  assert.match(baseCss, /\.theme-movement-sheet-table tbody td:nth-child\(2\)::before \{[^}]*font-weight: 900;[^}]*text-shadow: 0 0 7px var\(--movement-type-accent\);/);
  for (const accent of ["#fbbf24", "#4ade80", "#fb7185", "#d97706", "#16a34a", "#e11d48"]) {
    assert.ok(css.includes(`--movement-type-accent: ${accent};`), `${accent} keeps the original arrow glow colour`);
  }
  assert.match(baseCss, /\.theme-movement-sheet-table tbody td:nth-child\(2\)::before \{[^}]*animation: movement-type-swap 2\.8s ease-in-out infinite;/);
  assert.match(baseCss, /data-movement-type="insertion"\]\)::before \{\s*content: "→";\s*animation-name: movement-type-enter;/);
  assert.match(baseCss, /data-movement-type="removal"\]\)::before \{\s*content: "←";\s*animation-name: movement-type-exit;/);
  assert.match(rule("theme-movement-type-trigger"), /padding-left: 28px !important;/);
  assert.match(css, /:is\(\.theme-movement-delete-button, \.theme-movement-swap-edit, \.theme-movement-time-refresh\) \{[^}]*width: 24px;[^}]*height: 24px;[^}]*border-radius: 6px;[^}]*box-shadow: none !important;[^}]*cursor: pointer;/);
  assert.match(css, /:is\(\.theme-movement-delete-button, \.theme-movement-swap-edit, \.theme-movement-time-refresh\) svg \{[^}]*animation: none !important;[^}]*transform: none !important;/);
  assert.match(css, /:is\(\.theme-movement-delete-button, \.theme-movement-swap-edit, \.theme-movement-time-refresh\):focus-visible \{\s*outline: 2px solid var\(--movement-focus\);/);
});

test("status badges keep added, incomplete and draft meanings without pulsing", () => {
  assert.match(rule("theme-movement-status"), /font-weight: 500;/);
  assert.match(rule("theme-movement-status"), /animation: none !important;/);
  for (const status of ["added", "incomplete"]) {
    assert.match(css, new RegExp(`\\.theme-movement-status\\[data-status="${status}"\\] \\{\\s*background: var\\(--movement-${status}-bg\\) !important;`));
    assert.match(css, new RegExp(`--movement-${status}-text:`));
  }
  assert.match(sheet, /data-status=\{status.toLowerCase\(\)\}/);
  assert.match(sheet, /message=\{statusTooltip\}/);
  assert.match(sheet, /const validation = getMovementExcelValidation\(row\)/);
});
