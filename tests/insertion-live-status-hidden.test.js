import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");

test("Insertion live status is hidden without disabling synchronization", () => {
  assert.match(
    source,
    /\{insertionLiveStatusText && \(\s*<div\s+hidden\s+aria-hidden="true"\s+className=\{`theme-insertion-live-status/
  );

  assert.match(
    source,
    /refreshInsertionLiveFromDb\(\{ showStatus: true \}\);/
  );
  assert.match(
    source,
    /setInterval\(\(\) => \{\s*refreshInsertionLiveFromDb\(\{ showStatus: true \}\);\s*\}, INSERTION_LIVE_SYNC_INTERVAL_MS\)/
  );
  assert.match(source, /scheduleInsertionLiveSave\(payload\);/);
});
