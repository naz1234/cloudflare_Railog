#!/usr/bin/env node
// Local UI review only: uploads and request changes never reach production.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = fileURLToPath(new URL("../", import.meta.url));
const html = `<!doctype html><html lang="en" class="dark" data-app-theme="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Maintenance tools — local preview</title>
</head><body><div id="root"></div><script type="module" src="/scripts/preview-maintenance-upload-tools.jsx"></script></body></html>`;

const server = await createServer({
  root,
  configFile: false,
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { host: "127.0.0.1", port: 4191, strictPort: true },
  plugins: [react(), {
    name: "local-maintenance-preview",
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, "http://127.0.0.1:4191");
        if (["/", "/maintenance-preview", "/off-peak-preview"].includes(url.pathname)) {
          const transformed = await vite.transformIndexHtml(url.pathname, html);
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          response.end(transformed);
          return;
        }
        if (url.pathname === "/sample-wash.xlsx") {
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
            { "Train Number": "T19", "Next Wash": "2026-10-06" },
            { "Train Number": "T24", "Next Wash": "2026-10-07" },
            { "Train Number": "T28", "Next Wash": "2026-10-08" },
          ]), "Wash");
          response.writeHead(200, {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": "attachment; filename=local-sample-wash.xlsx",
          });
          response.end(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
          return;
        }
        if (url.pathname.startsWith("/api/")) {
          if (url.pathname !== "/api/maintenance-image" || request.method !== "POST") {
            response.writeHead(404, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ success: false, error: "Production APIs are disabled in this local preview." }));
            return;
          }
          // Consume and discard the image; this fixture tests the review UI, not OCR.
          for await (const _chunk of request) { /* never save uploaded content */ }
          await new Promise((resolve) => setTimeout(resolve, 1200));
          response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          response.end(JSON.stringify({
            success: true,
            extraction: { eveningDate: "05-OCT", morningDate: "06-OCT", eveningGToC: ["19", "24"], morningGToC: ["28"], eveningPM: ["07"], morningPM: ["12"] },
          }));
          return;
        }
        next();
      });
    },
  }],
});

await server.listen();
console.log("Local maintenance preview: http://127.0.0.1:4191/maintenance-preview");
console.log("Local off-peak icon preview: http://127.0.0.1:4191/off-peak-preview");
