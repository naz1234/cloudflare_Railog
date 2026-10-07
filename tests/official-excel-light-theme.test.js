import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url),
  "utf8",
);

test("Next Day Excel Generator uses light surfaces and dark text in light mode", () => {
  assert.match(generatorSource, /html\[data-app-theme="light"\] \.official-depot-excel-generator \{/);
  assert.match(generatorSource, /--official-bg-start: #edf2f7;/);
  assert.match(generatorSource, /--official-bg-end: #edf2f7;/);
  assert.match(generatorSource, /--official-border: #d7e2ee;/);
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

test("the source upload panel stays still without a pulse or glow in either theme", () => {
  assert.doesNotMatch(generatorSource, /official-upload-pulse|animation-play-state|transform-origin/);
  assert.match(generatorSource, /\.official-depot-excel-generator \.official-upload-panel \{\s*animation: none;\s*transform: none;\s*box-shadow: none;\s*will-change: auto;/);
  assert.match(generatorSource, /\.official-upload-panel \.official-input:focus-visible \{\s*outline: 2px solid var\(--official-accent\);\s*outline-offset: 2px;\s*box-shadow: none;/);
  const uploadPanel = generatorSource.slice(generatorSource.indexOf('<div className="official-panel official-upload-panel'), generatorSource.indexOf('<div className="official-panel rounded-lg', generatorSource.indexOf('<div className="official-panel official-upload-panel')));
  assert.doesNotMatch(uploadPanel, /transition|animate-/);
  assert.match(uploadPanel, /cursor-pointer/);
  assert.match(uploadPanel, /onClick=\{\(\) => fileInputRef.current\?\.click\(\)\}/);
  assert.match(uploadPanel, /onChange=\{handleFileChange\}/);
});
