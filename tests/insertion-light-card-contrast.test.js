import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mainSource = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/insertionLightCardContrast.css", import.meta.url), "utf8");

test("light-mode Insertion cards keep distinct depot and workflow colours", () => {
  assert.match(mainSource, /import '@\/insertionLightCardContrast\.css'/);

  assert.match(styles, /data-depot="west"[\s\S]*?#fff7ed[\s\S]*?#ea580c/);
  assert.match(styles, /data-depot="east"[\s\S]*?#ecfeff[\s\S]*?#0891b2/);
  assert.match(styles, /is-empty[\s\S]*?background: #e9eef3[\s\S]*?dashed #94a3b8/);
  assert.match(styles, /has-input:not\(\.is-inserted\)[\s\S]*?#fef9c3[\s\S]*?#eab308/);
  assert.match(styles, /is-inserted:not\(\.is-complete\)[\s\S]*?#f5f3ff[\s\S]*?#7c3aed/);
  assert.match(styles, /is-complete:not\(\.is-sweeping\)[\s\S]*?#ecfdf5[\s\S]*?#16a34a/);
  assert.match(styles, /is-sweeping:not\(\.is-duplicate\)[\s\S]*?#faf5ff[\s\S]*?#9333ea/);
  assert.match(styles, /is-duplicate[\s\S]*?#fef2f2[\s\S]*?#dc2626/);
  assert.match(styles, /\.theme-stabling-remark[\s\S]*?56%[\s\S]*?#ffffff 44%/);
  assert.match(styles, /is-search-match[\s\S]*?2px solid #ca8a04[\s\S]*?rgba\(202, 138, 4, 0\.26\)/);

  assert.doesNotMatch(styles, /html:not\(\[data-app-theme="light"\]\)/);
  assert.doesNotMatch(styles, /data-app-theme="dark"/);
});
