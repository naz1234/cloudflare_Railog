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

test("light-theme guide lines and row dividers remain visible against white without changing dark mode", () => {
  const guideBlock = css.match(/html\[data-app-theme="light"\] \.theme-maintenance-category-body \{([^}]*)\}/)?.[1] || "";
  const rowBlock = css.match(/html\[data-app-theme="light"\] \.theme-maintenance-panel \.theme-maintenance-category \.theme-maintenance-request-line \{([^}]*)\}/)?.[1] || "";
  const guideColor = guideBlock.match(/--maintenance-tree-line:\s*(#[\da-f]{6})/i)?.[1];
  const dividerColor = rowBlock.match(/border-bottom:\s*1px solid (#[\da-f]{6})/i)?.[1];
  assert.ok(guideColor, "light guide lines use a solid, readable color");
  assert.ok(dividerColor, "light row dividers use a solid, readable color");

  const contrastAgainstWhite = (hex) => {
    const channels = hex.slice(1).match(/../g).map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return 1.05 / (luminance + 0.05);
  };
  assert.ok(contrastAgainstWhite(guideColor) >= 3);
  assert.ok(contrastAgainstWhite(dividerColor) >= 2);
  assert.match(css, /\.theme-maintenance-category-body \{[\s\S]*?--maintenance-tree-line: rgba\(125, 175, 205, 0\.25\);/);
  assert.match(css, /border-bottom: 1px solid rgba\(125, 175, 205, 0\.08\);/);
});
