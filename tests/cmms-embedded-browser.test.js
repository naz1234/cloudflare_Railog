import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const movementSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const cmmsBrowserSource = readFileSync(
  new URL("../src/components/depot/CmmsEmbeddedBrowser.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("the shared CMMS browser sits below both movement windows and above MASPO", () => {
  const automaticWindow = movementSource.indexOf('renderTp1MovementWindow("automatic")');
  const manualWindow = movementSource.indexOf('renderTp1MovementWindow("manual")', automaticWindow);
  const cmmsBrowser = movementSource.indexOf("<CmmsEmbeddedBrowser />", manualWindow);
  const maspoChecker = movementSource.indexOf("<MaspoTrainMovementChecker />", cmmsBrowser);

  assert.ok(automaticWindow >= 0);
  assert.ok(manualWindow > automaticWindow);
  assert.ok(cmmsBrowser > manualWindow);
  assert.ok(maspoChecker > cmmsBrowser);
  assert.match(movementSource, /import CmmsEmbeddedBrowser from "\.\.\/components\/depot\/CmmsEmbeddedBrowser";/);
});

test("CMMS browser supports embedded access, reload, and an external fallback", () => {
  assert.match(cmmsBrowserSource, /export const CMMS_PORTAL_URL = "https:\/\/login\.flow-metro\.com\/adfs\//);
  assert.match(cmmsBrowserSource, /<iframe[\s\S]*?src=\{CMMS_PORTAL_URL\}[\s\S]*?title="FLOW CMMS"/);
  assert.match(cmmsBrowserSource, /onClick=\{\(\) => setFrameKey\(\(current\) => current \+ 1\)\}/);
  assert.match(cmmsBrowserSource, /href=\{CMMS_PORTAL_URL\}[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/);
  assert.match(cmmsBrowserSource, /If your login page is blocked inside this panel/);
});

test("the CMMS panel has explicit readable light-mode surfaces", () => {
  assert.match(
    themeStyles,
    /html\[data-app-theme="light"\] \.theme-train-movement-page \.theme-cmms-browser\s*\{[\s\S]*?background: #f8fafc !important;[\s\S]*?border-color: #64748b !important;/,
  );
  assert.match(
    themeStyles,
    /html\[data-app-theme="light"\] \.theme-train-movement-page \.theme-cmms-browser-primary\s*\{[\s\S]*?color: #064e3b !important;[\s\S]*?background: #d1fae5 !important;/,
  );
});
