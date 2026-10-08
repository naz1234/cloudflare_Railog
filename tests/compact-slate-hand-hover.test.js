import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = readSource("src/pages/DepotStabling.jsx");
const stablingCss = readSource("src/stablingSlate.css");
const movementCss = readSource("src/movementLogSlate.css");
const scanCss = readSource("src/components/depot/RemovalScan.css");
const generator = readSource("src/components/OfficialEastExcelGenerator.jsx");
const scan = readSource("src/components/depot/RemovalScan.jsx");
const tooltip = readSource("src/components/ActionTooltip.jsx");

test("both stabling TRN counts and movement Added count show the hand cursor with their existing tooltips", () => {
  assert.match(stablingCss, /\.theme-stabling-count \{[^}]*cursor: pointer;/);
  assert.match(movementCss, /\.slate-movement-count \{[^}]*cursor: pointer;/);
  assert.match(page, /<ActionTooltip asChild message=\{`\$\{count\} \$\{count === 1 \? "train" : "trains"\} in/);
  assert.match(page, /<ActionTooltip asChild message=\{`\$\{readyCount\} movements added to the log`\} align="end" triggerProps=\{\{ tabIndex: 0 \}\}/);
});

test("added movement row badges retain their accessible tooltips and use a hand cursor", () => {
  assert.match(page, /message=\{statusTooltip\}/);
  assert.match(movementCss, /\.theme-movement-status\[data-status="added"\] \{[^}]*cursor: pointer;/);
  assert.match(page, /wrapperClassName=\{`\$\{status === "Added" \? "cursor-pointer" : "cursor-help"\}/);
  assert.match(page, /"aria-label": `\$\{status\}\. \$\{statusTooltip\.replace/);
  assert.match(page, /const statusTooltip = status === "Added"\s*\? "This movement has been added to the log\."/);
});

test("movement header actions and all requested log copy actions explicitly use the hand cursor", () => {
  for (const className of [
    "theme-movement-sheet-action theme-movement-add-row-attention",
    "theme-movement-sheet-action slate-copy-feedback",
    "theme-movement-sheet-clear",
    "theme-movement-log-copy slate-copy-feedback",
    "theme-removal-log-action slate-copy-feedback",
    "slate-window-action slate-copy-feedback",
  ]) {
    assert.ok(page.includes(`${className} cursor-pointer`), `${className} needs a pointer cursor`);
  }
  assert.match(page, /theme-movement-log-copy[^"\n]*cursor-pointer[^"\n]*disabled:cursor-not-allowed/);
  assert.match(page, /theme-removal-log-action slate-copy-feedback[^"\n]*cursor-pointer[^"\n]*disabled:cursor-not-allowed/);
});

test("QR icon inherits the trigger cursor and disabled QR is unavailable", () => {
  assert.match(scanCss, /\.removal-scan-trigger \{[^}]*cursor: pointer;/);
  assert.match(scanCss, /\.removal-scan-trigger:disabled \{ cursor: not-allowed; \}/);
  assert.match(scanCss, /\.removal-scan-trigger \* \{ cursor: inherit; \}/);
});

test("official Excel generate button shows a hand when ready and keeps the busy cursor", () => {
  assert.match(generator, /official-generate-button cursor-pointer[^"\n]*disabled:cursor-wait/);
  assert.match(generator, /onClick=\{handleGenerate\}\s+disabled=\{isGenerating\}/);
});

test("all requested controls use matching popup tooltips without adding layout wrappers", () => {
  assert.match(tooltip, /asChild = false/);
  assert.match(tooltip, /\{asChild \? children : \(/);
  assert.match(tooltip, /TooltipPrimitive\.Portal/);
  assert.match(tooltip, /delayDuration=\{150\}/);
  for (const message of [
    "Add a new swapping, insertion or removal row.",
    "Copy all movement rows to the clipboard.",
    "Clear all movement rows (confirmation required).",
    "Copy the request summary by type to the clipboard.",
  ]) assert.ok(page.includes(message), `Missing popup for ${message}`);
  assert.match(page, /<ActionTooltip asChild message=\{hasRows \? `\$\{log.copyLabel\} to the clipboard\.`/);
  assert.match(page, /<ActionTooltip asChild message=\{hasEntries \? `\$\{log.copyLabel\} to the clipboard\.`/);
  assert.match(scan, /<ActionTooltip asChild message="Open a QR code to scan a train photo and update Removal summary\."/);
  assert.match(generator, /<ActionTooltip asChild message=\{isGenerating \? "Generating the official Excel workbook\.\.\."/);
});

test("both removal output PDF buttons use the same bubble tooltip instead of a native title", () => {
  const start = page.indexOf("function RemovalDepotLogCard(");
  const card = page.slice(start, page.indexOf("\nfunction ", start + 1));
  const message = "Download one-page PDF: West and East stacked left, Requested Train right";
  assert.ok(card.includes(`<ActionTooltip asChild message="${message}">`));
  assert.doesNotMatch(card, /title="Download one-page PDF/);
  assert.match(card, /<ActionTooltip asChild[^>]*>\s*<button\s+type="button"\s+onClick=\{handleDownloadPdf\}/);
  assert.match(card, /theme-removal-log-action cursor-pointer[^"\n]*disabled:cursor-not-allowed/);
  assert.match(card, /downloadCombinedRemovalPdf\(westLog, eastLog/);
});
