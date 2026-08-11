import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkerSource = readFileSync(
  new URL("../src/components/depot/MaspoTrainMovementChecker.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);
const guideImage = readFileSync(
  new URL("../public/guides/maspo-zip-download-guide.png", import.meta.url),
);

test("ships the supplied MASPO ZIP download picture guide", () => {
  assert.deepEqual(
    [...guideImage.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  assert.ok(guideImage.byteLength > 100_000, "guide should contain the full readable image");
  assert.match(checkerSource, /src="\/guides\/maspo-zip-download-guide\.png"/);
});

test("places a contextual picture-guide action beneath the MASPO upload", () => {
  const uploadIndex = checkerSource.indexOf("Upload ZIP, RAR, or Excel");
  const guideIndex = checkerSource.indexOf("Need to download the MASPO folder?");
  const trainInputIndex = checkerSource.indexOf('id="maspo-train-query"');

  assert.ok(uploadIndex >= 0, "MASPO upload should exist");
  assert.ok(guideIndex > uploadIndex, "guide should follow the upload control");
  assert.ok(trainInputIndex > guideIndex, "guide should stay with the upload area before the train controls");
  assert.match(checkerSource, /View download guide/);
  assert.match(checkerSource, /OneDrive saves the folder as a ZIP file/);
});

test("opens the guide in an accessible responsive modal", () => {
  assert.match(checkerSource, /DialogPrimitive\.Portal/);
  assert.match(checkerSource, /DialogPrimitive\.Title/);
  assert.match(checkerSource, /DialogPrimitive\.Description/);
  assert.match(checkerSource, /DialogPrimitive\.Close/);
  assert.match(checkerSource, /Close MASPO ZIP download guide/);
  assert.match(checkerSource, /Picture guide showing steps 4 to 6/);
  assert.match(checkerSource, /min-w-\[920px\]/);
  assert.match(checkerSource, /Scroll sideways to read each step/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-guide-button/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-maspo-download-guide/);
});
