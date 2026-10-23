import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import { createAuthMiddleware } from "../functions/_middleware.js";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/components/ATSWorkspace.jsx", import.meta.url), "utf8");
const workspaceModule = { exports: {} };
const compiled = ts.transpileModule(workspaceSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  fileName: "ATSWorkspace.jsx",
}).outputText;
const atsRequire = createRequire(import.meta.url);
new Function("require", "module", "exports", compiled)((name) => name === "lucide-react" ? icons : atsRequire(name), workspaceModule, workspaceModule.exports);
const ATSWorkspace = workspaceModule.exports.default;

test("ATS is the seventh protected page, using the existing hidden-navigation filter", () => {
  const protectedKeys = source.match(/const PROTECTED_SHORTCUT_KEYS = new Set\(\[([^\]]+)\]\)/)?.[1];
  assert.ok(protectedKeys);
  const keys = [...protectedKeys.matchAll(/"([^\"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(keys).size, 7);
  assert.ok(keys.includes("ats"));
  assert.match(source, /\{ key: "ats", label: "ATS", code: "ATS", to: "\/ats" \}/);
  const filterExpression = source.match(/\.filter\(\(\{ key \}\) => (!PROTECTED_SHORTCUT_KEYS\.has\(key\) \|\| areProtectedShortcutsUnlocked)\)/)?.[1];
  assert.ok(filterExpression);
  const filter = new Function("PROTECTED_SHORTCUT_KEYS", "areProtectedShortcutsUnlocked", `return ({ key }) => ${filterExpression};`);
  const navigation = [{ key: "stabling" }, ...keys.map((key) => ({ key }))];
  assert.deepEqual(navigation.filter(filter(new Set(keys), false)).map(({ key }) => key), ["stabling"]);
  assert.equal(navigation.filter(filter(new Set(keys), true)).length, 8);
});

test("ATS has an authenticated route and resolves to its own tab", () => {
  const protectedRoutes = appSource.slice(appSource.indexOf("<Route element={<ProtectedRoute />}>") , appSource.indexOf("{/* Add your page Route elements here */}"));
  assert.match(protectedRoutes, /<Route path="\/ats" element=\{<DepotStabling \/>\} \/>/);
  const start = source.indexOf("  const getTabFromPath =");
  const end = source.indexOf("  const [activeTab, setActiveTab]", start);
  const context = vm.createContext({});
  vm.runInContext(`${source.slice(start, end)}\nthis.getTab = getTabFromPath;`, context);
  assert.equal(context.getTab("/ats"), "ats");
  assert.equal(context.getTab("/checklist"), "checklist");
  assert.equal(context.getTab("/about"), "about");
});

test("direct ATS access remains locked and does not render its workspace before unlocking", () => {
  const html = renderToStaticMarkup(React.createElement(ATSWorkspace));
  assert.match(html, /Protected page · ATS/);
  assert.match(html, /Unlock protected pages/);
  assert.doesNotMatch(html, /ATS workspace|ready for ATS features|Protected pages unlocked/);
  assert.doesNotMatch(html, /<iframe|\/ats\/line3\//);
  let requestedUnlock = false;
  const element = ATSWorkspace({ unlocked: false, onUnlock: () => { requestedUnlock = true; } });
  const button = React.Children.toArray(element.props.children).find((child) => child.type === "button");
  assert.equal(button.props.type, "button");
  button.props.onClick();
  assert.equal(requestedUnlock, true);
});

test("unlocked ATS embeds the local diagram with fullscreen support and a standalone link", () => {
  const html = renderToStaticMarkup(React.createElement(ATSWorkspace, { unlocked: true }));
  assert.match(html, /id="ats-heading"/);
  assert.match(html, /ATS · Track Explorer/);
  assert.match(html, /No live ATS connection or train controls are configured\./);
  assert.equal((html.match(/<iframe\b/g) || []).length, 1);
  assert.match(html, /src="\/ats\/line3\/index\.html"/);
  assert.match(html, /title="Line 3 interactive ATS track diagram"/);
  assert.match(html, /allow="fullscreen"/);
  assert.match(html, /allowfullscreen=""/i);
  assert.match(html, /href="\/ats\/line3\/index\.html" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /ready for ATS features|Unlock protected pages|chatgpt\.site/);
  assert.doesNotMatch(workspaceSource, /fetch\(|base44|useEffect|WebSocket/);
});

test("the bundled diagram resolves its own assets and retains the transcribed identifiers", () => {
  const root = new URL("../public/ats/line3/", import.meta.url);
  const html = readFileSync(new URL("index.html", root), "utf8");
  const resources = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((match) => match[1]);
  assert.ok(resources.includes("assets-data.js"));
  for (const resource of resources) {
    assert.doesNotMatch(resource, /^(?:https?:)?\/\//);
    assert.ok(existsSync(new URL(resource, root)), `Missing diagram asset: ${resource}`);
  }
  const context = vm.createContext({ window: {} });
  for (const resource of ["data.js", "assets-data.js"]) {
    vm.runInContext(readFileSync(new URL(resource, root), "utf8"), context);
  }
  assert.equal(context.window.LINE3_STATIONS.length, 22);
  assert.equal(context.window.LINE3_STATIONS.find((station) => station.name === "Dhahrat Al Badiah").code, "3D3");
  const sectors = context.window.LINE3_ASSETS;
  assert.equal(sectors.length, 22);
  assert.ok(sectors[3].lower.includes("0415A"));
  assert.ok(sectors[3].lower.includes("0415B"));
  assert.ok(sectors[0].signalsUpper.includes("MV0116"));
  assert.ok(sectors[21].connections.some((connection) => connection.upper.id === "26" && connection.lower.id === "31"));
});

test("ATS shares the protected-page unlock and relock behavior, with no separate credentials", () => {
  assert.match(source, /activeTab === "ats"[\s\S]*?<ATSWorkspace\s+unlocked=\{areProtectedShortcutsUnlocked\}/);
  assert.match(source, /activeTab === "ats"[\s\S]*?setIsProtectedShortcutLoginOpen\(true\)/);
  assert.match(source, /if \(PROTECTED_SHORTCUT_KEYS\.has\(activeTab\)\) \{\s*setActiveTab\("stabling"\)/);
  assert.doesNotMatch(source, /ATS_LOGIN_|atsCredentials|isAtsUnlocked/);
});

test("diagram files remain protected by the existing session middleware", async () => {
  let served = false;
  const middleware = createAuthMiddleware({
    resolveMode: () => "custom_pin",
    authorizeCustom: async () => ({ authorized: false, reason: "missing_session", status: 401 }),
  });
  for (const path of ["/ats/line3/", "/ats/line3/index.html", "/ats/line3/app.js", "/ats/line3/assets-data.js", "/ats/line3/style.css"]) {
    const response = await middleware({
      data: {}, env: {},
      request: new Request(`https://railog.example.com${path}`),
      next: async () => { served = true; return new Response("private file"); },
    });
    assert.equal(response.status, 401, path);
  }
  assert.equal(served, false);
});
