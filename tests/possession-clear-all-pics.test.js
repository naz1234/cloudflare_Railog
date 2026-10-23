import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import postcss from "postcss";
import { normalizePossessionAccessEntry, buildPossessionCombinedOutput, buildPossessionDashboard, buildPossessionSecurityMessage, getPossessionSecurityDetails } from "../src/lib/possessionAccessLog.js";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const log = source.slice(source.indexOf("function PossessionLog("), source.indexOf("// ── Section 2: Station Controller Security Message"));
const clearSource = log.slice(log.indexOf("  const clear = () => {"), log.indexOf("  const output ="));
const blankSecurity = { picName: "", phone: "", accessNo: "", description: "", location: "", gateNo: "" };

function clearHarness(depot, confirmed) {
  const suffix = depot === "east" ? "_east" : "";
  const storageKey = `possessionLog_v2${suffix}`;
  const securityStorageKey = `scSecurityMessage_v1${suffix}`;
  const storage = new Map([
    ["possessionLog_v2", "West PICs"], ["possessionLog_v2_east", "East PICs"],
    ["scSecurityMessage_v1", "West legacy details"], ["scSecurityMessage_v1_east", "East legacy details"],
    ["epafLog_v1", "West EPAF"], ["epafLog_v1_east", "East EPAF"],
    ["sweepingLog_v1", "West sweeping"], ["sweepingLog_v1_east", "East sweeping"],
  ]);
  const state = { entries: [normalizePossessionAccessEntry({ picName: "Old PIC", accessNo: "306989", issueTime: "16:05" })],
    legacySecurity: { ...blankSecurity, phone: "555", gateNo: "10", location: "Old location" }, selected: "old-pic", view: "security" };
  const calls = [];
  const context = vm.createContext({
    depot, storageKey, securityStorageKey, defaultSC: blankSecurity,
    window: { confirm: (message) => { calls.push(message); return confirmed; } },
    getPossessionDepotLabel: (value) => value === "east" ? "East Depot" : "West Depot",
    defaultEntry: () => normalizePossessionAccessEntry({ entryId: "new-pic", securityDetails: {} }),
    setEntries: (value) => { state.entries = value; },
    setLegacySecurity: (value) => { state.legacySecurity = value; },
    setMobileEntryId: (value) => { state.selected = value; },
    setMobileAccessView: (value) => { state.view = value; },
    localStorage: { removeItem: (key) => storage.delete(key) },
  });
  vm.runInContext(`${clearSource}\nthis.clearAll = clear;`, context);
  return { clear: context.clearAll, state, storage, calls, storageKey, securityStorageKey };
}

for (const depot of ["west", "east"]) {
  test(`${depot} clear-all cancellation leaves PICs, security details and all saved data untouched`, () => {
    const harness = clearHarness(depot, false);
    const before = JSON.stringify(harness.state);
    const storageBefore = [...harness.storage];
    harness.clear();
    assert.equal(JSON.stringify(harness.state), before);
    assert.deepEqual([...harness.storage], storageBefore);
    assert.equal(harness.calls.length, 1);
    assert.match(harness.calls[0], new RegExp(`Clear all PICs, access details and generated logs for ${depot === "west" ? "West" : "East"} Depot`));
  });

  test(`${depot} confirmed clear-all resets every PIC and output, without touching the other depot, EPAF or sweeping`, () => {
    const harness = clearHarness(depot, true);
    const storageBefore = new Map(harness.storage);
    harness.clear();
    assert.equal(harness.state.entries.length, 1);
    assert.equal(harness.state.entries[0].entryId, "new-pic");
    assert.equal(harness.state.entries[0].picName, "");
    assert.equal(harness.state.entries[0].accessDetails[0].accessNo, "");
    assert.equal(harness.state.selected, "new-pic");
    assert.equal(harness.state.view, "details");
    assert.equal(JSON.stringify(harness.state.legacySecurity), JSON.stringify(blankSecurity));
    assert.equal(buildPossessionCombinedOutput(harness.state.entries, (value) => value ? `${value} hrs` : ""), "");
    const dashboard = buildPossessionDashboard(harness.state.entries);
    assert.equal(dashboard.pics, 0);
    assert.equal(dashboard.issued, 0);
    assert.equal(dashboard.waitingForHandback, 0);
    assert.equal(buildPossessionSecurityMessage(harness.state.entries[0], harness.state.legacySecurity), "");
    assert.equal(harness.storage.has(harness.storageKey), false);
    assert.equal(harness.storage.has(harness.securityStorageKey), false);
    for (const [key, value] of storageBefore) {
      if ([harness.storageKey, harness.securityStorageKey].includes(key)) continue;
      assert.equal(harness.storage.get(key), value, key);
    }
    const nextPic = { ...harness.state.entries[0], picName: "New PIC", accessNo: "123", accessDetails: [{ accessNo: "123", description: "New work" }] };
    const newSecurity = getPossessionSecurityDetails(nextPic, harness.state.legacySecurity);
    assert.equal(newSecurity.phone, "");
    assert.equal(newSecurity.gateNo, "");
    assert.equal(newSecurity.location, "");
  });
}

test("the toolbar clear action stays visible in mobile and desktop themes and uses the same confirmed handler", () => {
  assert.match(log, /className="pss-clear-all-pics" onClick=\{clear\}/);
  assert.match(log, /className="req-mobile-only pss-clear-all-inline"[\s\S]*?onClick=\{clear\}/);
  for (const file of ["possessionDesktop.css", "possessionMobile.css"]) {
    const sheet = postcss.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
    let visible = false;
    let themedForLight = false;
    sheet.walkRules((rule) => {
      if (!rule.selector.endsWith(" .pss-clear-all-pics")) return;
      rule.walkDecls("display", (decl) => { visible ||= decl.value === "inline-flex"; });
      themedForLight ||= rule.selector.startsWith('html[data-app-theme="light"]');
    });
    assert.equal(visible, true, file);
    assert.equal(themedForLight, true, file);
  }
});
