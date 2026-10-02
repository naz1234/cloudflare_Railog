import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const groups = source.slice(source.indexOf("const renderGroupedRequestCard"), source.indexOf("const renderRequestGroupCards"));
const categories = source.slice(source.indexOf("{/* Requests List */}"), source.indexOf("{editingRequestGroup &&"));

test("modern request categories have matching icons without enclosed section cards or collapse controls", () => {
  for (const [key, icon] of Object.entries({ washing: "Droplet", pm: "TrainFront", cm: "Wrench", tlc: "BriefcaseMedical", atc: "Cog", workshop: "Building2", others: "FileText" })) {
    assert.match(source, new RegExp(`${key}: ${icon}`));
  }
  assert.match(source, /data-request-layout="modern"/);
  assert.match(categories, /className="theme-maintenance-category"/);
  assert.match(categories, /theme-maintenance-category-icon/);
  assert.match(categories, /renderRequestGroupCards\(category\.groups/);
  assert.doesNotMatch(categories, /<button|Chevron|collapsed|slice\(/);
});

test("group bars and train lines keep all controls without the old bordered card styling", () => {
  assert.match(groups, /theme-maintenance-request-bar/);
  assert.match(groups, /theme-maintenance-request-line/);
  assert.doesNotMatch(groups, /theme-maintenance-request-card|theme-train-rem-row-card|style=\{cardVisual\.card\}/);
  assert.match(groups, /toggleRequestGroupVisibility\(group\)/);
  assert.match(groups, /beginGroupTitleEdit\(group\)/);
  assert.match(groups, /beginGroupDelete\(group\)/);
  assert.match(groups, /group\.items\.map/);
  assert.match(groups, /onRemove\(req\.id\)/);
  assert.match(groups, /AlreadyStatusIcon/);
  assert.match(groups, /StillNotAtStablingIcon/);
});

test("tree guide lines and flat light-theme overrides prevent nested borders returning", () => {
  assert.match(css, /\.theme-maintenance-category \{\s*border: 0;/);
  assert.match(css, /\.theme-maintenance-category-body::before/);
  assert.match(css, /\.theme-maintenance-request-line::before/);
  assert.match(css, /request-group-eye-status \* \{\s*color: inherit !important;/);
  const flatOverrides = css.slice(css.indexOf("/* Keep the new tree rows flat"));
  assert.match(flatOverrides, /theme-maintenance-request-bar \{\s*border: 0 !important;/);
  assert.match(flatOverrides, /theme-maintenance-request-line \{\s*border: 0 !important;/);
  assert.match(flatOverrides, /box-shadow: none !important;/);
});
