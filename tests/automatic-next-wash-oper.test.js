import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import manualArrivalTimePlugin from "../build/manualArrivalTimePlugin.js";
import manualUnplannedSrPlugin from "../build/manualUnplannedSrPlugin.js";
import automaticExcelCompletedByPlugin from "../build/automaticExcelCompletedByPlugin.js";
import automaticNextWashOperPlugin from "../build/automaticNextWashOperPlugin.js";
import manualNextWashMaintPlugin from "../build/manualNextWashMaintPlugin.js";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const themeStyles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const sourceId = "/repo/src/pages/DepotStabling.jsx";

function applyProductionTransforms() {
  let transformed = manualArrivalTimePlugin().transform(source, sourceId).code;
  transformed = manualUnplannedSrPlugin().transform(transformed, sourceId).code;
  transformed = automaticExcelCompletedByPlugin().transform(transformed, sourceId).code;
  transformed = automaticNextWashOperPlugin().transform(transformed, sourceId).code;
  return manualNextWashMaintPlugin().transform(transformed, sourceId).code;
}

test("Automatic Next Wash is required step 8 after CMMS", () => {
  const transformed = applyProductionTransforms();
  const automaticStart = transformed.indexOf("const automaticFlowSteps = [");
  const manualStart = transformed.indexOf("const manualFlowSteps = [", automaticStart);
  const automaticFlow = transformed.slice(automaticStart, manualStart);
  const stepBlocks = [...automaticFlow.matchAll(/\n      \{\n        key: "([^"]+)",[\s\S]*?\n      \},/g)];
  const requiredKeys = stepBlocks
    .filter((match) => !match[0].includes("optional: true"))
    .map((match) => match[1]);

  assert.deepEqual(requiredKeys, [
    "trainSet",
    "planStatus",
    "shunterName",
    "trAtTp1",
    "trLocalized",
    "automaticStablingRoad",
    "cmmsNumber",
    "nextWashText",
  ]);
  assert.equal(requiredKeys.indexOf("nextWashText") + 1, 8);
});

test("Automatic Next Wash action pill links to CMMS OPER in a new tab", () => {
  const transformed = applyProductionTransforms();
  const automaticStart = transformed.indexOf("const automaticFlowSteps = [");
  const manualStart = transformed.indexOf("const manualFlowSteps = [", automaticStart);
  const automaticFlow = transformed.slice(automaticStart, manualStart);

  assert.match(automaticFlow, /<span className="truncate">Next Wash<\/span>/);
  assert.match(automaticFlow, /theme-tp1-next-wash-action-pill/);
  assert.match(automaticFlow, /Update to OPER <span aria-hidden="true">↗<\/span>/);
  assert.match(
    automaticFlow,
    /href="https:\/\/login\.flow-metro\.com\/adfs\/ls\/IdpInitiatedSignon\.aspx\?RelayState=RPID%3Dhttps%253A%252F%252Fcmms\.flow-metro\.com%26RelayState%3Dhttps%253A%252F%252Fcmms\.flow-metro\.com%252Fmaximo%252Fui%252Fmaximo\.jsp"/,
  );
  assert.match(automaticFlow, /target="_blank"/);
  assert.match(automaticFlow, /rel="noopener noreferrer"/);
  assert.doesNotMatch(automaticFlow, /\bunderline\b|decoration-current|underline-offset/);
});

test("Planned Manual Area Next Wash is required step 7 after CMMS", () => {
  const transformed = applyProductionTransforms();
  const manualStart = transformed.indexOf("const manualFlowSteps = [");
  const manualEnd = transformed.indexOf("const allFlowSteps", manualStart);
  const manualFlow = transformed.slice(manualStart, manualEnd);
  const stepBlocks = [...manualFlow.matchAll(/\n      \{\n        key: "([^"]+)",[\s\S]*?\n      \},/g)];
  const plannedRequiredKeys = stepBlocks
    .filter((match) => !match[0].includes("optional: true") && match[1] !== "srNumber")
    .map((match) => match[1]);

  assert.deepEqual(plannedRequiredKeys, [
    "trainSet",
    "planStatus",
    "shunterName",
    "trAtTp1",
    "toManual",
    "cmmsNumber",
    "nextWashText",
  ]);
  assert.equal(plannedRequiredKeys.indexOf("nextWashText") + 1, 7);
});

test("Unplanned Manual Area keeps SR before required Next Wash", () => {
  const transformed = applyProductionTransforms();
  const manualStart = transformed.indexOf("const manualFlowSteps = [");
  const manualEnd = transformed.indexOf("const allFlowSteps", manualStart);
  const manualFlow = transformed.slice(manualStart, manualEnd);
  const stepBlocks = [...manualFlow.matchAll(/\n      \{\n        key: "([^"]+)",[\s\S]*?\n      \},/g)];
  const unplannedRequiredKeys = stepBlocks
    .filter((match) => !match[0].includes("optional: true"))
    .map((match) => match[1]);

  assert.equal(unplannedRequiredKeys.at(-2), "srNumber");
  assert.equal(unplannedRequiredKeys.at(-1), "nextWashText");
});

test("Manual Next Wash action pill links to CMMS MAINT in a new tab", () => {
  const transformed = applyProductionTransforms();
  const manualStart = transformed.indexOf("const manualFlowSteps = [");
  const manualEnd = transformed.indexOf("const allFlowSteps", manualStart);
  const manualFlow = transformed.slice(manualStart, manualEnd);

  assert.match(manualFlow, /<span className="truncate">Next Wash<\/span>/);
  assert.match(manualFlow, /theme-tp1-next-wash-action-pill/);
  assert.match(manualFlow, /Update to MAINT <span aria-hidden="true">↗<\/span>/);
  assert.match(
    manualFlow,
    /href="https:\/\/login\.flow-metro\.com\/adfs\/ls\/IdpInitiatedSignon\.aspx\?RelayState=RPID%3Dhttps%253A%252F%252Fcmms\.flow-metro\.com%26RelayState%3Dhttps%253A%252F%252Fcmms\.flow-metro\.com%252Fmaximo%252Fui%252Fmaximo\.jsp"/,
  );
  assert.match(manualFlow, /target="_blank"/);
  assert.match(manualFlow, /rel="noopener noreferrer"/);
  assert.doesNotMatch(manualFlow, /\bunderline\b|decoration-current|underline-offset/);
  assert.doesNotMatch(manualFlow, /label: "Next Wash Optional",\s+optional: true,/);
  assert.match(manualFlow, /label: "If No need update",\s+optional: true,/);
});

test("Next Wash links disable underlines and use the glowing pill style", () => {
  assert.match(
    themeStyles,
    /\.theme-tp1-next-wash-link,[\s\S]*?\.theme-tp1-next-wash-link:hover,[\s\S]*?\.theme-tp1-next-wash-link:focus \{[\s\S]*?text-decoration: none !important;/,
  );
  assert.match(themeStyles, /\.theme-tp1-next-wash-action-pill \{[\s\S]*?border-color: rgba\(79, 142, 247, 0\.78\);[\s\S]*?0 0 10px rgba\(79, 142, 247, 0\.22\);/);
  assert.match(themeStyles, /\.theme-tp1-next-wash-link:hover \.theme-tp1-next-wash-action-pill,[\s\S]*?transform: translateY\(-1px\);/);
});

test("both final Next Wash cards keep a static attention state after completion", () => {
  const transformed = applyProductionTransforms();
  const automaticStart = transformed.indexOf("const automaticFlowSteps = [");
  const manualStart = transformed.indexOf("const manualFlowSteps = [", automaticStart);
  const manualEnd = transformed.indexOf("const allFlowSteps", manualStart);
  const automaticFlow = transformed.slice(automaticStart, manualStart);
  const manualFlow = transformed.slice(manualStart, manualEnd);

  assert.match(automaticFlow, /key: "nextWashText",\s+persistentAttention: true,/);
  assert.match(manualFlow, /key: "nextWashText",\s+persistentAttention: true,/);
  assert.match(transformed, /const isAttentionStep = Boolean\(step\.persistentAttention\) \|\| isCurrent;/);
  assert.match(transformed, /const cardState = isAttentionStep \? "is-current" : step\.complete \? "is-complete" : "is-pending";/);
  assert.match(transformed, /data-movement-step-state=\{isAttentionStep \? "current" : step\.complete \? "complete" : "pending"\}/);
  assert.match(transformed, /\{step\.complete \? \([\s\S]*?aria-label="Completed"/);
  assert.doesNotMatch(transformed, /persistentPulse|is-persistent-pulse/);
  assert.doesNotMatch(themeStyles, /tp1-persistent-step-pulse|is-persistent-pulse/);
});
