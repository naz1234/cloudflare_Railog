import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const preview = readFileSync(new URL("../scripts/preview-compact-slate.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../scripts/preview-compact-slate.mjs", import.meta.url), "utf8");
const css = readFileSync(new URL("../scripts/preview-compact-slate.css", import.meta.url), "utf8");

test("local preview reuses production stabling sections with the live road and block orientations", () => {
  assert.match(server, /export \{[^}]*StablingSection/);
  assert.match(preview, /allDepots\.map\(\(config\) => <StablingSection/);
  assert.match(preview, /roads: \["WD-ST15", "WD-ST14", "WD-ST13", "WD-ST12"\]/);
  assert.match(preview, /blockIndices: \[6, 5, 4, 3, 2, 1, 0\], labelSide: "left"/);
  assert.match(preview, /roads: \["ED-ST02", "ED-ST03"\]/);
  assert.match(preview, /blockIndices: \[0, 1, 2, 3, 4, 5, 6\], labelSide: "right"/);
});

test("local stabling edits use production move rules and update both compact panels", () => {
  assert.match(preview, /useState\(createStablingSamples\)/);
  assert.match(preview, /buildStablingMoveState\(\{ westData: current\.west, eastData: current\.east/);
  assert.match(preview, /getMainStablingLocations\(stabling\.west, stabling\.east\)/);
  assert.match(preview, /stabledTrainIds=\{Array\.from\(getWestStablingKeys\(stabling\.west\)\)\}/);
  assert.match(preview, /westData=\{stabling\.west\} eastData=\{stabling\.east\}/);
  assert.match(preview, /setStabling\(createStablingSamples\(\)\)/);
  assert.doesNotMatch(preview, /base44\.entities|fetch\(/);
});

test("stabling is stacked beside the compact panels without shrinking their production widths", () => {
  assert.match(css, /\.slate-preview-workspace \{[^}]*display: flex;[^}]*align-items: flex-start;/);
  assert.match(css, /\.slate-preview-depots \{[^}]*flex-direction: column;/);
  assert.match(css, /\.slate-preview-panel \{ width: 314px;/);
  assert.match(css, /\.slate-preview-workspace-scroll \{[^}]*overflow: auto;/);
  assert.match(preview, /role="region" aria-label="Local stabling and removal workspace" tabIndex=\{0\}/);
  assert.match(server, /Production APIs are disabled in this local preview/);
});
