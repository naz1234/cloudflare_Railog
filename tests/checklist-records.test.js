import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildChecklistScopeKey,
  createChecklistItem,
  normalizeChecklistItems,
  normalizeChecklistShift,
  selectLatestChecklistRecord,
} from "../src/lib/checklistRecords.js";

test("checklist scope keeps the selected duty date and shift", () => {
  assert.equal(buildChecklistScopeKey("2026-08-10", "night"), "2026-08-10:night");
  assert.equal(normalizeChecklistShift("unknown"), "late");
});
test("new checklist items trim their note and start incomplete", () => {
  assert.deepEqual(
    createChecklistItem("  Review removal plan  ", {
      id: "item-1",
      now: "2026-08-10T10:00:00.000Z",
    }),
    {
      id: "item-1",
      text: "Review removal plan",
      completed: false,
      createdAt: "2026-08-10T10:00:00.000Z",
      updatedAt: "2026-08-10T10:00:00.000Z",
    },
  );
});

test("normalization removes empty and duplicate checklist items", () => {
  assert.deepEqual(
    normalizeChecklistItems([
      { id: "a", text: "First" },
      { id: "a", text: "Duplicate" },
      { id: "b", text: "  " },
    ]).map((item) => item.text),
    ["First"],
  );
});

test("latest checklist record is selected only for the active duty scope", () => {
  const records = [
    { id: "old", scopeKey: "2026-08-10:late", updatedAt: "2026-08-10T10:00:00.000Z" },
    { id: "other", scopeKey: "2026-08-10:night", updatedAt: "2026-08-10T13:00:00.000Z" },
    { id: "new", scopeKey: "2026-08-10:late", updatedAt: "2026-08-10T12:00:00.000Z" },
  ];
  assert.equal(selectLatestChecklistRecord(records, "2026-08-10:late")?.id, "new");
});

test("checklist page is wired to the protected route and Cloudflare entity", () => {
  const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const depotSource = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  const clientSource = readFileSync(new URL("../src/api/base44Client.js", import.meta.url), "utf8");
  const entityFunctionSource = readFileSync(
    new URL("../functions/api/entities/[[path]].js", import.meta.url),
    "utf8",
  );

  assert.match(appSource, /path="\/checklist"/);
  assert.match(depotSource, /PROTECTED_SHORTCUT_KEYS[^;]+"checklist"/);
  assert.match(clientSource, /'ChecklistRecord'/);
  assert.match(entityFunctionSource, /'ChecklistRecord'/);
});
