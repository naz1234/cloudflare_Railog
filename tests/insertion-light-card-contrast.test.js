import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mainSource = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const baseStyles = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/insertionLightCardContrast.css", import.meta.url), "utf8");

test("light-mode Insertion cards stay neutral while labels retain their colours", () => {
  assert.match(mainSource, /import '@\/insertionLightCardContrast\.css'/);

  assert.match(
    styles,
    /\.theme-insertion-card\.is-req-layout\.has-train[\s\S]*?#ffffff[\s\S]*?#f1f5f9[\s\S]*?1px solid #b7c4d1/,
  );
  assert.match(
    baseStyles,
    /data-depot="west"[\s\S]*?has-train:not\(\.has-input\):not\(\.is-inserted\):not\(\.is-complete\)[\s\S]*?border-top: 2px solid var\(--insertion-west\)/,
  );
  assert.match(
    styles,
    /data-depot="west"[\s\S]*?data-depot="east"[\s\S]*?--insertion-card-border: #b7c4d1[\s\S]*?border-top: 1px solid #b7c4d1 !important/,
  );
  assert.match(styles, /is-empty[\s\S]*?background: #e9eef3[\s\S]*?dashed #94a3b8/);
  assert.doesNotMatch(styles, /\.has-input:not\(/);
  assert.doesNotMatch(styles, /\.is-inserted:not\(/);
  assert.doesNotMatch(styles, /\.is-complete:not\(/);
  assert.doesNotMatch(styles, /\.is-sweeping:not\(/);
  assert.match(
    styles,
    /\.theme-insertion-card\.is-req-layout\.has-train\.is-duplicate \{[\s\S]*?background: linear-gradient\(145deg, #ffffff 0%, #f7f2ff 100%\) !important;[\s\S]*?background-image: linear-gradient\(145deg, #ffffff 0%, #f7f2ff 100%\) !important;/,
  );
  assert.match(
    styles,
    /\.theme-insertion-card\.is-req-layout\.has-train\.is-duplicate:not\(\.is-search-match\) \{[\s\S]*?border: 2px solid #a855f7 !important;[\s\S]*?rgba\(76, 29, 149, 0\.14\)[\s\S]*?!important;/,
  );
  assert.doesNotMatch(styles, /--insertion-card-reference-accent/);
  assert.match(styles, /\.theme-stabling-remark[\s\S]*?56%[\s\S]*?#ffffff 44%/);
  assert.match(styles, /is-search-match[\s\S]*?2px solid #ca8a04[\s\S]*?rgba\(202, 138, 4, 0\.26\)/);

  assert.doesNotMatch(styles, /html:not\(\[data-app-theme="light"\]\)/);
  assert.doesNotMatch(styles, /data-app-theme="dark"/);
});

test("duplicate TID detection marks both depot cards and keeps search priority", () => {
  assert.match(
    pageSource,
    /const isDuplicateInsertedTid = Boolean\([\s\S]*?isWeekdayActive[\s\S]*?insertedTid[\s\S]*?duplicateTidKeys\?\.has\?\.\(String\(insertedTid\)\)[\s\S]*?\);/,
  );
  assert.match(pageSource, /\$\{isDuplicateInsertedTid \? "is-duplicate" : ""\}/);
  assert.equal(
    (pageSource.match(/duplicateTidKeys=\{insertionAssistDuplicateTidKeySet\}/g) || []).length,
    2,
    "West and East stabling sections must receive the shared duplicate set",
  );

  const neutralRule = styles.indexOf(".theme-insertion-card.is-req-layout.has-train {");
  const duplicateRule = styles.indexOf(".theme-insertion-card.is-req-layout.has-train.is-duplicate {");
  const searchRule = styles.indexOf(".theme-insertion-card.is-search-match {");
  assert.ok(duplicateRule > neutralRule, "duplicate styling must override the neutral card");
  assert.ok(searchRule > duplicateRule, "search outline must remain higher priority than duplicate styling");
  assert.match(styles, /\.is-duplicate:not\(\.is-search-match\)/);
});
