#!/usr/bin/env node
// Run: node scripts/preview-compact-slate.mjs. No production API connections.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const html = `<!doctype html><html lang="en" class="dark" data-app-theme="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Compact Slate — local preview</title>
</head><body><div id="root"></div><script type="module" src="/scripts/preview-compact-slate.jsx"></script></body></html>`;

const server = await createServer({
  root, configFile: false,
  resolve: { alias: [
    { find: /^.*(?:\/|^)base44Client(?:\.js)?$/, replacement: path.join(root, "scripts/preview-compact-slate-api.js") },
    { find: "@", replacement: path.join(root, "src") },
  ] },
  plugins: [{
    name: "local-slate-component", enforce: "pre",
    transform(code, id) {
      if (id.replaceAll("\\", "/").endsWith("/src/pages/DepotStabling.jsx")) {
        return `${code}\nexport { TrainRemPanel, buildDefaultTrainRemState, buildTrainRemDepotPayload, getTrainRemPresetConfig };`;
      }
    },
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, "http://127.0.0.1:4192");
        if (["/", "/compact-slate-preview"].includes(url.pathname)) {
          const transformed = await vite.transformIndexHtml(url.pathname, html);
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          response.end(transformed);
          return;
        }
        if (url.pathname.startsWith("/api/")) {
          response.writeHead(403, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Production APIs are disabled in this local preview." }));
          return;
        }
        next();
      });
    },
  }, react()],
  server: { host: "127.0.0.1", port: 4192, strictPort: true },
});
await server.listen();
console.log("Compact Slate local preview: http://127.0.0.1:4192/compact-slate-preview");
