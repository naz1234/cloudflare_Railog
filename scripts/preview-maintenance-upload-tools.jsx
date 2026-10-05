import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import MaintenancePanel from "../src/components/MaintenancePanel";
import "../src/index.css";
import "./preview-maintenance-upload-tools.css";

const sampleRequests = () => Array.from({ length: 43 }, (_, index) => ({
  id: `local-${index + 1}`,
  trainId: String(index + 1).padStart(2, "0"),
  requestType: ["RST PM 05-OCT", "Wash 6-Oct", "INBOUND (G to C)"][index % 3],
  customType: "", remark: "",
}));

export default function Preview() {
  const [requests, setRequests] = useState(sampleRequests);
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.body.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <main className="local-maintenance-preview">
      <aside className="local-maintenance-notes">
        <p className="local-maintenance-eyebrow">LOCAL PREVIEW ONLY</p>
        <h1>More space for requests.</h1>
        <p>Hover over <strong>Wash Excel</strong> or <strong>Req. Image</strong> to reveal the upload cards.</p>
        <p>Click once to keep them open; click again to close. Keyboard focus also opens them, and Escape closes an idle panel.</p>
        <p>Selected files stay visible until <strong>Clear All</strong>. Your review is never lost when the panels hide.</p>
        <div className="local-maintenance-actions">
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Try light mode" : "Try dark mode"}</button>
          <a href="/sample-wash.xlsx" download>Sample wash Excel</a>
        </div>
        <p className="local-maintenance-disclaimer">Excel parsing is real. Image review uses sample results here. Requests are stored only in memory; nothing is saved or sent to production.</p>
      </aside>
      <section className="local-maintenance-demo" aria-label="Interactive maintenance sidebar">
        <MaintenancePanel
          requests={requests}
          onAdd={async (item) => setRequests((current) => [...current, { ...item, id: crypto.randomUUID() }])}
          onRemove={async (id) => setRequests((current) => current.filter((item) => item.id !== id))}
          onClearAll={() => setRequests([])}
          stabledTrainIds={["07", "12", "19", "24", "28"]}
        />
      </section>
    </main>
  );
}

const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = previewRoot;
previewRoot.render(<Preview />);
