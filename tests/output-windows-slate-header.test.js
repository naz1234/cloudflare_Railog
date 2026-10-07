import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const generator = readFileSync(new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/outputWindowsSlate.css", import.meta.url), "utf8");
const component = (name) => {
  const start = page.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return page.slice(start, page.indexOf("\nfunction ", start + 1));
};
const summary = component("RequestedTrainActionSummary");
const output = component("RemovalLogOutputFromTrainRem");
const rule = (name) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1];

test("all three output windows opt in to shared Removal Summary-style headers and bodies", () => {
  assert.match(page, /import "\.\.\/outputWindowsSlate\.css";/);
  assert.match(generator, /import "\.\.\/outputWindowsSlate\.css";/);
  for (const [source, name] of [[summary, "Request Summary by Type"], [output, "Removal Log Output"], [generator, "Next Day Excel Generator"]]) {
    assert.match(source, /data-window-design="compact-slate"/);
    assert.ok(source.includes(`<h2 className="slate-window-title">${name}</h2>`));
    for (const name of ["slate-window-header", "slate-window-heading", "slate-window-title-icon", "slate-window-subtitle", "slate-window-body"]) {
      assert.ok(source.includes(name), `${name} present`);
    }
  }
});

test("frame, icon, title and subtitle use the same compact dimensions in both themes", () => {
  assert.match(css, /border-radius: 28px !important;/);
  assert.match(rule("slate-window-header"), /min-height: 70px;\s*padding: 12px 12px 10px;/);
  assert.match(rule("slate-window-title"), /font-size: 16px;\s*font-weight: 700;\s*letter-spacing: -\.035em;/);
  assert.match(rule("slate-window-title"), /text-transform: none;\s*text-shadow: none;/);
  assert.match(rule("slate-window-subtitle"), /font-size: 11px;\s*font-weight: 400;/);
  assert.match(rule("slate-window-title-icon"), /width: 30px;\s*height: 30px;/);
  assert.match(rule("slate-window-title-icon"), /border-radius: 9px;/);
  assert.match(css, /\.slate-window-title-icon :is\(svg, svg \*\) \{[^}]*width: 15px;[^}]*stroke-width: 1\.5;/);
  assert.match(rule("slate-window-heading"), /flex: 1 1 250px;/);
  assert.match(rule("slate-window-header"), /flex-wrap: wrap;/);
});

test("dark and light window surfaces stay flat slate without changing semantic controls or warnings", () => {
  for (const token of ["--window-panel: #0b1f33;", "--window-panel: #edf2f7;", "--window-line: #2b4f6b;", "--window-line: #d7e2ee;"]) assert.ok(css.includes(token));
  assert.match(css, /background: var\(--window-panel\) !important;\s*background-image: none !important;/);
  assert.match(css, /--official-panel: #061827;/);
  assert.match(css, /--official-panel: rgba\(255, 255, 255, 0\.86\);/);
  assert.doesNotMatch(css, /--official-warning|--official-accent|requested-summary-washing|depot-log-body/);
  const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim());
  assert.ok(selectors.every((selector) => selector.includes('[data-window-design="compact-slate"]')));
});

test("copy feedback, both removal output cards and their export payloads remain available", () => {
  assert.match(summary, /onClick=\{handleCopySummary\}/);
  assert.match(summary, /className="slate-window-action slate-copy-feedback/);
  assert.match(summary, /await copyWithFeedback\(summaryText\)/);
  assert.match(summary, /data-copy-state=\{copyStatuses.default \|\| "idle"\}/);
  assert.match(summary, /summaryGroups.map\(\(group\)/);
  assert.match(summary, /group.headingClass/);
  assert.match(summary, /\{line\}/);
  assert.equal((output.match(/<RemovalDepotLogCard/g) || []).length, 2);
  assert.match(output, /log=\{westLog\}/);
  assert.match(output, /log=\{eastLog\}/);
  for (const data of ["swappingRows", "actionOverviewRows", "getSwappingRows", "getActionOverviewRows", "stackMorningDepots"]) assert.ok(output.includes(data));
  assert.match(css, /:is\(\.slate-window-action, \.theme-removal-log-action\) \{[^}]*height: 30px;[^}]*font-size: 12px;[^}]*font-weight: 400;/);
  assert.match(css, /:hover:not\(:disabled\):not\(\[data-copy-state="copied"\]\)/);
});

test("Excel upload, controller, date selection, generation and preservation notice remain intact", () => {
  assert.match(generator, /type="file" accept="\.xlsx,application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange=\{handleFileChange\}/);
  assert.match(generator, /onChange=\{\(event\) => setControllerName\(event.target.value\)\}/);
  assert.match(generator, /\["today", "tomorrow"\].map/);
  assert.match(generator, /setTargetDay\(option\)/);
  assert.match(generator, /onClick=\{handleGenerate\}/);
  assert.match(generator, /disabled=\{isGenerating\}/);
  assert.match(generator, /Unrelated tabs preserved/);
  assert.match(generator, /Use the previous day’s Excel file to preserve/);
  assert.match(generator, /\{error &&/);
  assert.match(generator, /\{generatedFile &&/);
});
