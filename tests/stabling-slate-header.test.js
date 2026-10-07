import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/stablingSlate.css", import.meta.url), "utf8");
const section = page.slice(page.indexOf("function StablingSection("), page.indexOf("function SectionTitle("));
const header = page.slice(page.indexOf("function SectionTitle("), page.indexOf("function EmptyCornerCell("));
const rule = (selector) => css.match(new RegExp(`\\.${selector} \\{([^}]*)\\}`))?.[1];

test("both main stabling depots opt into the slate header without changing their export titles", () => {
  assert.match(page, /import "\.\.\/stablingSlate\.css";/);
  assert.match(section, /data-stabling-design="compact-slate"/);
  assert.match(section, /title=\{`\$\{depotLabel\} stabling`\}/);
  assert.match(section, /downloadStablingPicturePdf\(\{\s*title,/);
  assert.match(header, /<span>TRN<\/span>\s*<strong>\{count\}<\/strong>/);
  assert.match(section, /subtitle=\{`Train locations in \$\{depotLabel\}`\}/);
  assert.match(header, /<p className="theme-stabling-subtitle">\{subtitle\}<\/p>/);
  assert.doesNotMatch(header, /Train locations across 7 blocks/);
  assert.match(header, /aria-label=\{`\$\{count\} \$\{count === 1 \? "train" : "trains"\}`\}/);
});

test("title, icon and train count match the compact Maintenance and Removal Summary sizing", () => {
  assert.match(rule("theme-stabling-title"), /font-size: 16px;[\s\S]*font-weight: 700;/);
  assert.match(rule("theme-stabling-title"), /letter-spacing: -\.035em;/);
  assert.match(rule("theme-stabling-title-icon"), /width: 30px;\s*height: 30px;\s*border-radius: 9px;/);
  assert.match(rule("theme-stabling-count"), /margin-left: 8px;/);
  assert.match(rule("theme-stabling-count"), /border-left: 1px solid var\(--stabling-line\) !important;/);
  assert.match(css, /\.theme-stabling-count > strong \{[^}]*font-size: 24px;[^}]*font-weight: 650;/);
  assert.match(css, /border-radius: 28px;/);
});

test("slate actions stay neutral and accessible while retaining copy, PDF and clear confirmation", () => {
  assert.match(rule("theme-stabling-action"), /background: var\(--stabling-control\) !important;/);
  assert.match(rule("theme-stabling-action"), /height: 30px;/);
  assert.match(rule("theme-stabling-action"), /box-shadow: none !important;/);
  assert.match(rule("theme-stabling-action"), /cursor: pointer;/);
  assert.match(css, /\.theme-stabling-action:focus-visible \{\s*outline: 2px solid var\(--stabling-focus\);/);
  assert.match(css, /\.theme-stabling-action\.is-done \{/);
  assert.match(css, /\.theme-stabling-action\.is-confirming \{/);
  assert.match(css, /\.theme-stabling-action:hover:not\(:disabled\):not\(\.is-done\):not\(\.is-confirming\)/);
  assert.match(section, /onClick=\{handleCopyStabling\}/);
  assert.match(section, /onClick=\{handleDownloadPdf\}/);
  assert.match(section, /<ClearAllStablingButton onClearAll=\{onClearAll\}/);
});

test("stabling actions share the title header instead of adding a separate toolbar height", () => {
  assert.match(header, /<header className="theme-stabling-header">[\s\S]*\{action\}[\s\S]*className="theme-stabling-count"[\s\S]*<\/header>/);
  assert.doesNotMatch(header, /<\/header>\s*\{action\}/);
  assert.match(rule("theme-stabling-action-row"), /margin-left: auto;/);
  assert.match(rule("theme-stabling-action-row"), /margin-bottom: 0;/);
  assert.match(rule("theme-stabling-action-row"), /flex-shrink: 0;/);
});

test("slate styling is scoped away from the operational grids and insertion or PST panels", () => {
  assert.doesNotMatch(css, /theme-stabling-grid-cell|theme-stabling-train-card|theme-stabling-remark|theme-insertion|theme-pst/);
  assert.match(css, /--stabling-panel: #0b1f33;/);
  assert.match(css, /--stabling-panel: #edf2f7;/);
  assert.match(section, /<RoadRow[\s\S]*blockIndices=\{blockIndices\}/);
  assert.match(section, /onUpdate=\{\(bi, val\) => onUpdate\(road, bi, val\)\}/);
  assert.match(section, /allDepots\.forEach/);
});
