import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mainSource = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/insertionLightCardContrast.css", import.meta.url), "utf8");

test("light-mode Insertion cards stay neutral while labels retain their colours", () => {
  assert.match(mainSource, /import '@\/insertionLightCardContrast\.css'/);

  assert.match(
    styles,
    /\.theme-insertion-card\.is-req-layout\.has-train[\s\S]*?#ffffff[\s\S]*?#f1f5f9[\s\S]*?1px solid #b7c4d1/,
  );
  assert.doesNotMatch(styles, /data-depot=/);
  assert.match(styles, /is-empty[\s\S]*?background: #e9eef3[\s\S]*?dashed #94a3b8/);
  assert.doesNotMatch(styles, /\.has-input:not\(/);
  assert.doesNotMatch(styles, /\.is-inserted:not\(/);
  assert.doesNotMatch(styles, /\.is-complete:not\(/);
  assert.doesNotMatch(styles, /\.is-sweeping:not\(/);
  assert.doesNotMatch(styles, /\.is-duplicate\s*\{/);
  assert.doesNotMatch(styles, /--insertion-card-reference-accent/);
  assert.match(styles, /\.theme-stabling-remark[\s\S]*?56%[\s\S]*?#ffffff 44%/);
  assert.match(styles, /is-search-match[\s\S]*?2px solid #ca8a04[\s\S]*?rgba\(202, 138, 4, 0\.26\)/);

  assert.doesNotMatch(styles, /html:not\(\[data-app-theme="light"\]\)/);
  assert.doesNotMatch(styles, /data-app-theme="dark"/);
});
