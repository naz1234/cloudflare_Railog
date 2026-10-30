// Preview the actual PSS source with in-memory records; never connect to production.
import { createServer, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const pss = source.slice(source.indexOf("function parsePossessionTimeTo24"), source.indexOf("function TimetableHeaderControl("));
const virtualId = "\0virtual:pss-security.jsx";
const server = await createServer({
  root, configFile: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  optimizeDeps: { entries: ["scripts/preview-pss-security.jsx"] },
  plugins: [{
    name: "isolated-pss-preview",
    resolveId(id) { if (id === "virtual:pss-security.jsx") return virtualId; },
    async load(id) {
      if (id !== virtualId) return;
      const code = `import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
        import { FileText, Shield, Trash2, X, Plus, Copy, ClipboardCheck, Wind, Zap, UsersRound, Undo2, Clock3, BarChart3, Layers, TrainFront } from "lucide-react";
        import PossessionEntryPicker from "/src/components/depot/PossessionEntryPicker.jsx";
        import PossessionAccessSearch from "/src/components/depot/PossessionAccessSearch.jsx";
        import { base44 } from "/scripts/preview-compact-slate-api.js";
        import { buildPossessionCombinedOutput, buildPossessionDashboard, buildPossessionEntryOutput, buildPossessionSecurityMessage, getPossessionAccessDetails, getPossessionEntryPendingStatus, getPossessionSecurityDetails, normalizePossessionAccessEntry, removePossessionAccessEntry } from "/src/lib/possessionAccessLog.js";
        ${pss}
        export { PossessionTabContent };`;
      return (await transformWithEsbuild(code, "PSSPreview.jsx", { loader: "jsx", jsx: "automatic" })).code;
    },
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, "http://127.0.0.1:4194");
        if (url.pathname === "/") {
          const html = await vite.transformIndexHtml("/", `<!doctype html><html lang="en" class="dark" data-app-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PSS linked outputs — local samples</title></head><body><div id="root"></div><script type="module" src="/scripts/preview-pss-security.jsx"></script></body></html>`);
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }
        if (url.pathname.startsWith("/api/")) {
          response.writeHead(403); response.end("Production APIs disabled in preview."); return;
        }
        next();
      });
    },
  }, react()],
  server: { host: "127.0.0.1", port: 4194, strictPort: true },
});
await server.listen();
console.log("PSS local samples: http://127.0.0.1:4194/");
