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

test("PSS hides the live-sync banner without disabling cross-laptop sync", () => {
  assert.doesNotMatch(source, /Live shared page/);
  assert.doesNotMatch(source, />Live sync</);
  assert.match(source, /\{activeTab === "possession" && \([\s\S]*?<PossessionTabContent \/>/);
  assert.match(source, /const records = await entity\.filter\(\{ stateKey \}\)/);
  assert.match(source, /await entity\.update\(recordId, \{ stateKey, data: current, updatedAt: now \}\)/);
  assert.match(source, /intervalId = window\.setInterval\(\(\) => fetchRemote\(false\), POSSESSION_LIVE_SYNC_INTERVAL_MS\)/);
});

test("West and East PSS workspaces have distinct depot themes", () => {
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(source, /className="theme-possession-depot-workspace space-y-6" data-possession-depot=\{normalizePossessionDepot\(depot\)\}/);
  assert.match(source, /theme-possession-card/);
  assert.match(source, /theme-possession-input/);
  assert.match(css, /theme-possession-depot-workspace\[data-possession-depot="west"\][\s\S]*?--pss-depot-accent: #22d3ee/);
  assert.match(css, /theme-possession-depot-workspace\[data-possession-depot="east"\][\s\S]*?--pss-depot-accent: #c084fc/);
  assert.match(css, /theme-possession-depot-workspace \.theme-possession-header/);
  assert.match(css, /theme-possession-depot-workspace \.theme-possession-input:focus/);
});

test("each PSS Access Entry cycles through a distinct window theme", () => {
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(source, /const POSSESSION_ACCESS_ENTRY_THEME_COUNT = 6/);
  assert.match(source, /className="theme-possession-access-entry/);
  assert.match(source, /data-entry-theme=\{index % POSSESSION_ACCESS_ENTRY_THEME_COUNT\}/);
  assert.match(source, /theme-possession-access-entry-header/);
  assert.match(source, /theme-possession-access-entry-title/);

  for (let themeIndex = 0; themeIndex < 6; themeIndex += 1) {
    assert.match(css, new RegExp(`theme-possession-access-entry\\[data-entry-theme="${themeIndex}"\\]`));
  }
  assert.match(css, /html\[data-app-theme="light"\] \.theme-possession-access-entry\[data-entry-theme="0"\]/);
  assert.match(css, /--pss-entry-surface/);
  assert.match(css, /--pss-entry-header-start/);
  assert.match(css, /--pss-entry-accent/);
});
