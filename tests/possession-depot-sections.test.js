import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");

test("PSS exposes accessible West and East depot tabs", () => {
  assert.match(source, /role="tablist" aria-label="PSS depot"/);
  assert.match(source, /const depots = \["west", "east"\]/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected=\{selected\}/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /hidden=\{activeDepot !== depot\}/);
});

test("each PSS depot gets a complete workspace", () => {
  assert.match(source, /function PossessionDepotWorkspace\(\{ depot \}\)/);
  assert.match(source, /<PossessionLog depot=\{depot\} \/>/);
  assert.match(source, /<EPAFLog depot=\{depot\} \/>/);
  assert.match(source, /<SCSecurityMessage depot=\{depot\} \/>/);
  assert.match(source, /<SweepingLog depot=\{depot\} \/>/);
});

test("East PSS storage and live sync are isolated while West keeps legacy keys", () => {
  assert.match(source, /normalizePossessionDepot\(depot\) === "east" \? `\$\{baseKey\}_east` : baseKey/);
  assert.match(source, /normalizePossessionDepot\(depot\) === "east" \? `\$\{baseKey\}-east` : baseKey/);
  assert.match(source, /getPossessionLiveStateKey\("possession-log", depot\)/);
  assert.match(source, /getPossessionLiveStateKey\("possession-security-message", depot\)/);
  assert.match(source, /getPossessionLiveStateKey\("possession-epaf", depot\)/);
  assert.match(source, /getPossessionLiveStateKey\("possession-sweeping", depot\)/);
});

test("EPAF depot follows the selected PSS depot", () => {
  assert.match(source, /const depotLabel = getPossessionDepotLabel\(depot\)/);
  assert.match(source, /depot: depotLabel/);
  assert.match(source, /<POSSESSION_FIELD label="Depot"><div[^>]*>\{depotLabel\}<\/div><\/POSSESSION_FIELD>/);
});
