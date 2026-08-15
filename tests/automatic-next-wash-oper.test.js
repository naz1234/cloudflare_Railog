import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import automaticExcelCompletedByPlugin from "../build/automaticExcelCompletedByPlugin.js";
import automaticNextWashOperPlugin from "../build/automaticNextWashOperPlugin.js";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const sourceId = "/repo/src/pages/DepotStabling.jsx";

function applyProductionTransforms() {
  const withoutCompletedBy = automaticExcelCompletedByPlugin().transform(source, sourceId).code;
  return automaticNextWashOperPlugin().transform(withoutCompletedBy, sourceId).code;
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

test("Automatic Next Wash title links to CMMS OPER in a new tab", () => {
  const transformed = applyProductionTransforms();

  assert.match(transformed, /Next Wash \(update status to OPER\)/);
  assert.match(
    transformed,
    /href="https:\/\/login\.flow-metro\.com\/adfs\/ls\/IdpInitiatedSignon\.aspx\?RelayState=RPID%3Dhttps%253A%252F%252Fcmms\.flow-metro\.com%26RelayState%3Dhttps%253A%252F%252Fcmms\.flow-metro\.com%252Fmaximo%252Fui%252Fmaximo\.jsp"/,
  );
  assert.match(transformed, /target="_blank"/);
  assert.match(transformed, /rel="noopener noreferrer"/);
});

test("Manual Area Next Wash remains optional", () => {
  const transformed = applyProductionTransforms();
  const manualStart = transformed.indexOf("const manualFlowSteps = [");
  const manualEnd = transformed.indexOf("const allFlowSteps", manualStart);
  const manualFlow = transformed.slice(manualStart, manualEnd);

  assert.match(manualFlow, /label: "Next Wash Optional",\s+optional: true,/);
});
