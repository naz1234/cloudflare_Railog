import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const checkerSource = readFileSync(
  new URL("../src/components/depot/MaspoTrainMovementChecker.jsx", import.meta.url),
  "utf8",
);
const archiveReaderSource = readFileSync(
  new URL("../src/lib/maspoArchiveReader.js", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);
const deployedNotices = readFileSync(
  new URL("../public/THIRD_PARTY_NOTICES.txt", import.meta.url),
  "utf8",
);

test("MASPO checker is full-width below Automatic and Manual movement windows", () => {
  const automaticIndex = depotStablingSource.indexOf('renderTp1MovementWindow("automatic")');
  const manualIndex = depotStablingSource.indexOf('renderTp1MovementWindow("manual")', automaticIndex);
  const checkerIndex = depotStablingSource.indexOf("<MaspoTrainMovementChecker />", manualIndex);

  assert.ok(automaticIndex >= 0, "Automatic Area Movement window should exist");
  assert.ok(manualIndex > automaticIndex, "Manual Area Movement should follow Automatic Area Movement");
  assert.ok(checkerIndex > manualIndex, "MASPO checker should follow both movement windows");
  assert.match(
    depotStablingSource.slice(manualIndex, checkerIndex + 80),
    /col-span-full min-w-0[\s\S]*?<MaspoTrainMovementChecker \/>/,
  );
});

test("checker exposes RAR, ZIP, and Excel upload with the requested title", () => {
  assert.match(checkerSource, /Check Train Maspo TR movement/);
  assert.match(checkerSource, /accept="\.zip,\.rar,\.xlsx,\.xls,\.xlsm,\.xlsb/);
  assert.match(checkerSource, /Files are analyzed in this browser and are not saved/);
  assert.match(checkerSource, /Reference number/);
  assert.doesNotMatch(checkerSource, /authority to proceed/i);
});

test("archive reader lazy-loads raw RAR extraction and applies size limits", () => {
  assert.match(archiveReaderSource, /await import\("unrarit"\)/);
  assert.match(archiveReaderSource, /unrarRaw\(bytes\)/);
  assert.match(archiveReaderSource, /MAX_ARCHIVE_BYTES/);
  assert.match(archiveReaderSource, /MAX_SPREADSHEET_BYTES/);
  assert.match(archiveReaderSource, /MAX_TOTAL_EXTRACTED_BYTES/);
  assert.match(archiveReaderSource, /MAX_WORKBOOK_PACKAGE_BYTES/);
  assert.match(archiveReaderSource, /MAX_ANALYSIS_CELLS/);
  assert.match(archiveReaderSource, /Solid RAR archives are not supported/);
  assert.match(archiveReaderSource, /rar\?\.dispose\?\.\(\)/);
});

test("MASPO checker has scoped light-theme surfaces and primary actions", () => {
  assert.match(themeStyles, /html\[data-app-theme="light"\][\s\S]*?\.theme-maspo-train-checker \{/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-header/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-submit/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-copy/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-record/);
  assert.match(themeStyles, /\.theme-maspo-train-checker input:focus-visible/);
});

test("checker invalidates stale async results and publishes complete RAR notices", () => {
  assert.match(checkerSource, /analysisRequestRef = useRef\(0\)/);
  assert.match(checkerSource, /analysisRequestRef\.current !== requestId/);
  assert.match(checkerSource, /aria-busy=\{working\}/);
  assert.match(checkerSource, /THIRD_PARTY_NOTICES\.txt/);
  assert.match(deployedNotices, /Copyright \(c\) 2014 Josh Wolfe/);
  assert.match(deployedNotices, /Copyright \(c\) 2019 Gregg Tavares/);
  assert.match(deployedNotices, /UnRAR source code may be used in any software/);
});
