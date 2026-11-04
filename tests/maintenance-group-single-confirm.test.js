import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
const saveCode = source.slice(source.indexOf("  const saveGroupTitle = async"), source.indexOf("  const toggleRequestGroupVisibility ="));
const helpers = ["normalizeTrainCompareKey", "cleanRequestLabel", "normalizeRequestIdentity", "getRequestDisplayLabel"].map((name) => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}).join("\n");
const plain = (value) => JSON.parse(JSON.stringify(value));
const first = { id: "r1", trainId: "01", requestType: "Other", customType: "RST PM 04-NOV", remark: "Keep original", groupTitle: "PM today", groupHidden: true };
const group = { key: "PM TODAY", label: "PM today", items: [first], hidden: true };
function harness(options = {}) {
  const events = [];
  const state = { key: group.key, snapshot: group, title: options.title ?? group.label, draft: options.draft ?? "", error: "", message: {}, saving: "" };
  const context = vm.createContext({
    console: { error() {} },
    editingRequestGroup: options.group ?? group,
    groupTitleDraft: state.title,
    groupTrainDraft: state.draft,
    regularRequestGroups: options.groups ?? [group],
    requests: options.requests ?? [first],
    groupEditorBusy: Boolean(options.busy),
    groupSaveInFlightRef: { current: false },
    onRenameGroup: options.rename === null ? undefined : async (...args) => { events.push(["rename", ...plain(args)]); return options.rename?.(...args); },
    onAdd: options.add === null ? undefined : async (payload) => { events.push(["add", plain(payload)]); return options.add?.(payload); },
    setSavingGroupKey: (value) => { state.saving = value; },
    setGroupEditError: (value) => { state.error = value; },
    setGroupTrainMessage: (value) => { state.message = plain(value); },
    setEditingGroupSnapshot: (value) => { state.snapshot = value; },
    setEditingGroupKey: (value) => { state.key = value; },
    setGroupTitleDraft: (value) => { state.title = value; },
    setGroupTrainDraft: (value) => { state.draft = value; },
    cancelGroupTitleEdit: () => { state.key = ""; state.snapshot = null; state.draft = ""; },
  });
  vm.runInContext(`${helpers}\nconst displayType = (request) => getRequestDisplayLabel(request) || "Request";\n${saveCode}\nthis.save = saveGroupTitle;`, context);
  return { context, events, state, save: () => context.save({ preventDefault() {} }) };
}

test("one confirmation renames the heading and adds canonical train IDs using the saved title", async () => {
  const h = harness({ title: "  PM   tomorrow  ", draft: "T15, 15 015 T28 28" });
  await h.save();
  assert.equal(h.events[0][0], "rename");
  assert.equal(h.events[0][2], "PM tomorrow");
  assert.deepEqual(h.events.slice(1).map((event) => event[1]), ["15", "28"].map((trainId) => ({
    trainId, requestType: "Other", customType: first.customType, remark: first.remark, groupTitle: "PM tomorrow", groupHidden: true,
  })));
  assert.equal(h.state.key, "");
  assert.equal(h.state.draft, "");
  assert.equal(h.state.saving, "");
});

test("unchanged titles still add trains; an empty train draft still supports title-only changes", async () => {
  const adding = harness({ draft: "15 28" });
  await adding.save();
  assert.deepEqual(adding.events.map((event) => event[0]), ["add", "add"]);
  assert.equal(adding.events[0][1].groupTitle, group.label);
  const titleOnly = harness({ title: "Renamed" });
  await titleOnly.save();
  assert.deepEqual(titleOnly.events.map((event) => event[0]), ["rename"]);
});

test("existing trains are skipped across T/zero prefixes without blocking a requested title edit", async () => {
  const h = harness({ title: "Renamed", draft: "T01 001 01 15" });
  await h.save();
  assert.deepEqual(h.events.map((event) => event[0]), ["rename", "add"]);
  assert.equal(h.events[1][1].trainId, "15");
  const noChanges = harness({ draft: "T01 01" });
  await noChanges.save();
  assert.equal(noChanges.events.length, 0);
  assert.equal(noChanges.state.key, "");
});

test("all validation happens before writes and preserves the user's drafts", async () => {
  for (const options of [
    { title: " ", draft: "15" },
    { title: "Taken", draft: "15", groups: [group, { key: "TAKEN", label: "Taken", items: [{ id: "other" }] }] },
    { title: "Renamed", draft: "15", add: null },
    { title: "Renamed", draft: "15", rename: null },
    { title: "Renamed", draft: "15", group: { ...group, items: [] } },
  ]) {
    const h = harness(options);
    await h.save();
    assert.equal(h.events.length, 0);
    assert.equal(h.state.draft, "15");
    assert.ok(h.state.error || h.state.message.text);
    assert.equal(h.state.key, group.key);
  }
});

test("a failed rename never adds trains or closes the dialog", async () => {
  const h = harness({ title: "Renamed", draft: "15 28", rename: () => { throw new Error("Rename unavailable"); } });
  await h.save();
  assert.deepEqual(h.events.map((event) => event[0]), ["rename"]);
  assert.equal(h.state.error, "Rename unavailable");
  assert.equal(h.state.title, "Renamed");
  assert.equal(h.state.draft, "15 28");
  assert.equal(h.state.key, group.key);
  assert.equal(h.state.saving, "");
});

test("partial additions keep the saved heading open and retain only failed trains for retry", async () => {
  const h = harness({ title: "Renamed", draft: "15 28", add: ({ trainId }) => { if (trainId === "28") throw new Error("Offline"); } });
  await h.save();
  assert.equal(h.state.key, "RENAMED");
  assert.equal(h.state.snapshot.label, "Renamed");
  assert.equal(h.state.draft, "28");
  assert.match(h.state.message.text, /Title saved\. Added 1 train\. Could not add: 28/);
  assert.equal(h.state.saving, "");
  const retry = harness({ title: "Renamed", draft: h.state.draft, group: h.state.snapshot, groups: [h.state.snapshot], requests: [{ ...first, groupTitle: "Renamed" }, { ...first, id: "r15", trainId: "15", groupTitle: "Renamed" }] });
  await retry.save();
  assert.deepEqual(retry.events.map((event) => event[0]), ["add"]);
  assert.equal(retry.events[0][1].trainId, "28");
  assert.equal(retry.state.key, "");
});

test("double confirmation cannot start a second batch while saving", async () => {
  let resolve;
  const gate = new Promise((done) => { resolve = done; });
  const h = harness({ title: "Renamed", draft: "15", rename: () => gate });
  const pending = h.save();
  await h.save();
  assert.equal(h.events.length, 1);
  resolve();
  await pending;
  assert.deepEqual(h.events.map((event) => event[0]), ["rename", "add"]);
});

test("headings with a fallback group identity remain open if an addition fails", async () => {
  const h = harness({ title: "---", draft: "28", add: () => { throw new Error("Offline"); } });
  await h.save();
  assert.equal(h.state.key, "---");
  assert.equal(h.state.snapshot.label, "---");
  assert.equal(h.state.draft, "28");
});

test("a partially renamed heading retains original members and may retry its own target group", async () => {
  const renamed = { ...first, id: "r2", trainId: "02", groupTitle: "Renamed" };
  const original = { ...group, items: [first, { ...renamed, groupTitle: group.label }] };
  const groups = [group, { key: "RENAMED", label: "Renamed", items: [renamed] }];
  const selection = source.slice(source.indexOf("  const editingGroupSource ="), source.indexOf("  const connectedRequestGroup ="));
  const context = vm.createContext({ editingGroupKey: group.key, editingGroupSnapshot: original, regularRequestGroups: groups, requests: [first, renamed] });
  vm.runInContext(`${helpers}\nconst displayType = getRequestDisplayLabel;\n${selection}\nthis.group = editingRequestGroup;`, context);
  assert.deepEqual(plain(context.group.items).map((item) => item.id), ["r1", "r2"]);
  const h = harness({ group: plain(context.group), groups, requests: [first, renamed], title: "Renamed" });
  await h.save();
  assert.equal(h.state.error, "");
  assert.equal(h.events[0][0], "rename");
  assert.equal(h.events[0][1].length, 2);
});

test("the popup has one combined submit and no separate Add/Enter-only mutation", () => {
  const popup = source.slice(source.indexOf('aria-labelledby="request-group-edit-title"'));
  assert.match(popup, /onSubmit=\{saveGroupTitle\}/);
  assert.match(popup, /Save title & add trains/);
  assert.equal((popup.match(/type="submit"/g) || []).length, 1);
  assert.doesNotMatch(source, /addTrainsToEditingGroup|addingGroupTrains/);
  const trainInput = popup.slice(popup.indexOf('id="request-group-add-trains"'), popup.indexOf('placeholder="Example: T15, T28"'));
  assert.doesNotMatch(trainInput, /onKeyDown/);
});
