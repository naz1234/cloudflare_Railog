import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url),
  "utf8",
);

test("Next Day Excel Generator uses light surfaces and dark text in light mode", () => {
  assert.match(generatorSource, /html\[data-app-theme="light"\] \.official-depot-excel-generator \{/);
  assert.match(generatorSource, /--official-bg-start: #f0fdfa;/);
  assert.match(generatorSource, /--official-panel: rgba\(255, 255, 255, 0\.86\);/);
  assert.match(generatorSource, /--official-input: #ffffff;/);
  assert.match(generatorSource, /--official-text: #0f2733;/);
  assert.match(generatorSource, /--official-muted: #425f6b;/);
});

test("warning and generate action retain accessible contrast", () => {
  assert.match(generatorSource, /--official-warning-bg: #fffbeb;/);
  assert.match(generatorSource, /--official-warning-text: #78350f;/);
  assert.match(generatorSource, /\.official-warning :is\(p, span\)/);
  assert.match(generatorSource, /className="official-generate-button/);
  assert.match(generatorSource, /\.official-generate-button \{\s*color: #ffffff !important;/);
});
