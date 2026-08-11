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

test("MASPO checker is centered below Automatic and Manual movement windows", () => {
  const automaticIndex = depotStablingSource.indexOf('renderTp1MovementWindow("automatic")');
  const manualIndex = depotStablingSource.indexOf('renderTp1MovementWindow("manual")', automaticIndex);
  const checkerIndex = depotStablingSource.indexOf("<MaspoTrainMovementChecker />", manualIndex);

  assert.ok(automaticIndex >= 0, "Automatic Area Movement window should exist");
  assert.ok(manualIndex > automaticIndex, "Manual Area Movement should follow Automatic Area Movement");
  assert.ok(checkerIndex > manualIndex, "MASPO checker should follow both movement windows");
  assert.match(
    depotStablingSource.slice(manualIndex, checkerIndex + 120),
    /col-span-full flex min-w-0 justify-center[\s\S]*?w-full min-w-0 max-w-\[980px\][\s\S]*?<MaspoTrainMovementChecker \/>/,
  );
});

test("checker exposes RAR, ZIP, and Excel upload with the requested title", () => {
  assert.match(checkerSource, /Check Train Maspo TR movement/);
  assert.match(checkerSource, /accept="\.zip,\.rar,\.xlsx,\.xls,\.xlsm,\.xlsb/);
  assert.match(checkerSource, /Files are analyzed in this browser and are not saved/);
  assert.match(checkerSource, /Movement ref/);
  assert.doesNotMatch(checkerSource, /authority to proceed/i);
});

test("train-set control explains equivalent 07 input formats", () => {
  assert.match(checkerSource, /placeholder="07 or TS07"/);
  assert.match(checkerSource, /aria-describedby="maspo-train-query-help"/);
  assert.match(checkerSource, /Search example: 07 &bull; 7 &bull; T07 &bull; TS07/);
  assert.doesNotMatch(checkerSource, /Search example:[^\n]*707/);
});

test("checker header follows the supplied summary and search-panel design", () => {
  assert.match(checkerSource, /theme-maspo-train-checker-summary/);
  assert.match(checkerSource, /parsedWorkbookCount === 1 \? "file" : "files"/);
  assert.match(checkerSource, /\{timeline\.length\} \{analysis\.train\}/);
  assert.match(checkerSource, /timeline\.length === 1 \? "entry" : "entries"/);
  assert.match(checkerSource, /<FileArchive className="h-5 w-5"/);
  assert.match(checkerSource, /<CloudDownload className="h-5 w-5"/);
  assert.match(checkerSource, /theme-maspo-train-checker-query/);
  assert.match(checkerSource, /aria-label="Clear train set"/);
  assert.match(checkerSource, /onClick=\{clearTrainQuery\}/);
});

test("MASPO typography matches the movement panel scale", () => {
  assert.match(depotStablingSource, /<h2 className="text-\[15px\] font-black leading-tight text-white">\{modeTitle\}<\/h2>/);
  assert.match(depotStablingSource, /<p className="mt-0\.5 text-\[9px\] font-semibold" style=\{\{ color: accent \}\}>\{modeSubtitle\}<\/p>/);
  assert.match(checkerSource, /<h2 className="text-\[15px\] font-black leading-tight text-white">Check Train Maspo TR movement<\/h2>/);
  assert.match(checkerSource, /<p className="mt-0\.5 text-\[9px\] font-semibold text-violet-200\/85">Upload MASPO Excel logs/);
  assert.match(checkerSource, /block truncate text-\[13px\] font-semibold text-white">\{archiveFile\?\.name \|\| "Upload ZIP, RAR, or Excel"\}<\/span>/);
  assert.match(checkerSource, /h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-\[13px\] font-semibold uppercase/);
  assert.match(checkerSource, /\{analysis\.train\} Movement Check<\/h3>/);
  assert.match(checkerSource, /theme-maspo-train-checker-history-row[^\n]*text-\[11px\]/);
  assert.doesNotMatch(checkerSource, /text-(?:base|lg|xl)|sm:text-(?:xs|sm|base|lg|xl)/);
});

test("MASPO controls use four equal plum movement cards", () => {
  assert.match(checkerSource, /grid auto-rows-fr gap-3 p-4 sm:p-5 md:grid-cols-2/);
  assert.equal(checkerSource.match(/min-h-\[96px\]/g)?.length, 4);
  assert.match(checkerSource, /theme-maspo-train-checker-upload[^\n]*md:col-start-1 md:row-start-1/);
  assert.match(checkerSource, /theme-maspo-train-checker-guide[^\n]*md:col-start-1 md:row-start-2/);
  assert.match(checkerSource, /theme-maspo-train-checker-controls[^\n]*md:col-start-2 md:row-start-1/);
  assert.match(checkerSource, /theme-maspo-train-checker-submit[^\n]*md:col-start-2 md:row-start-2/);
  assert.match(checkerSource, />1<\/span>[\s\S]*?Train set/);
  assert.match(checkerSource, />Current<\/span>/);
  assert.match(checkerSource, /border-violet-500\/70 bg-\[#100b1a\]/);
  assert.doesNotMatch(checkerSource, /pl-\[4\.25rem\]/);
  assert.match(themeStyles, /compact plum workspace/);
  assert.match(themeStyles, /background: #7c3aed !important/);
});

test("movement results use the reference-inspired latest card and chronological history table", () => {
  assert.match(checkerSource, /\{analysis\.train\} Movement Check/);
  assert.match(checkerSource, /theme-maspo-train-checker-results-reference/);
  assert.doesNotMatch(checkerSource, /theme-maspo-train-checker-results-compact/);
  assert.match(checkerSource, /id="maspo-latest-movement-heading"/);
  assert.match(checkerSource, /theme-maspo-train-checker-latest/);
  assert.match(checkerSource, /latest\.dateRangeDisplay/);
  assert.match(checkerSource, /latest\.timeRange/);
  assert.match(checkerSource, /latest\.areaDetail/);
  assert.match(checkerSource, /latest\.planStatus/);
  assert.match(checkerSource, /copyReference\(latest\.reference\)/);
  assert.match(checkerSource, />Movement History<\/h4>/);
  assert.match(checkerSource, /<table[\s\S]*?aria-label=\{`Chronological movement history/);
  assert.match(checkerSource, /min-w-\[880px\]/);
  assert.match(checkerSource, /<h3 className="text-\[15px\] font-black uppercase leading-tight text-white">/);
  assert.match(checkerSource, /h-12 w-12/);
  assert.match(checkerSource, /px-3 py-3\.5 text-center/);
  assert.match(checkerSource, /border-r border-\[#24343f\]/);
  assert.match(checkerSource, /timeline\.map\(\(record, index\) =>/);
  assert.match(checkerSource, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
  assert.match(checkerSource, /displaySourceName\(record\.fileName\)/);
  assert.match(checkerSource, /title=\{`Source: \$\{sourceLabel\}`\}/);
  assert.doesNotMatch(checkerSource, /theme-maspo-train-checker-history-source/);
  assert.match(checkerSource, /copyReference\(record\.reference\)/);
  assert.match(checkerSource, /Handover logs may provide supporting status/);
  assert.doesNotMatch(checkerSource, /theme-maspo-train-checker-flow-node/);
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
  assert.match(themeStyles, /\.theme-maspo-train-checker-summary/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-query-clear/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-submit/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-copy/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-latest/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-history-heading/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-history-row/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-ref-copy/);
  assert.match(themeStyles, /\.theme-maspo-train-checker-chronological/);
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
