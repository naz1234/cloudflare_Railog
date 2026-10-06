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

const isOffPeakPreview = window.location.pathname === "/off-peak-preview";
const sampleOffPeakRequests = () => ["06", "19", "25", "32", "10", "12"].map((trainId, index) => ({
  id: `local-off-peak-${trainId}`, trainId,
  requestType: index < 4 ? "RST PM 05-OCT" : index === 4 ? "Wash 6-Oct" : "TLC Comms",
  customType: "", remark: "",
}));

export default function Preview() {
  const [requests, setRequests] = useState(isOffPeakPreview ? sampleOffPeakRequests : sampleRequests);
  const [theme, setTheme] = useState("dark");
  const [moveOffPeakToWest, setMoveOffPeakToWest] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.body.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <main className={`local-maintenance-preview${isOffPeakPreview ? " local-off-peak-preview" : ""}`}>
      <aside className="local-maintenance-notes">
        <p className="local-maintenance-eyebrow">LOCAL PREVIEW ONLY</p>
        {isOffPeakPreview ? (
          <>
            <h1>Off-peak, clearly marked.</h1>
            <p>Hover over the purple <strong>ⓘ</strong> beside <strong>T25</strong> or <strong>T32</strong> to see <strong>Off-peak train</strong> and its TID.</p>
            <p>The icon stays the same size and position. West stays cyan, East stays red, and the status tick / hourglass stays unchanged.</p>
            <p>Only trains listed in the active off-peak list get this icon. T12 demonstrates HDW off-peak information without a TID.</p>
          </>
        ) : (
          <>
            <h1>More space for requests.</h1>
            <p>Hover over <strong>Wash Excel</strong> or <strong>Req. Image</strong> to reveal the upload cards.</p>
            <p>Click once to keep them open; click again to close. Keyboard focus also opens them, and Escape closes an idle panel.</p>
            <p>Selected files stay visible until <strong>Clear All</strong>. Your review is never lost when the panels hide.</p>
          </>
        )}
        <div className="local-maintenance-actions">
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Try light mode" : "Try dark mode"}</button>
          {isOffPeakPreview ? (
            <button type="button" onClick={() => setMoveOffPeakToWest(!moveOffPeakToWest)}>
              {moveOffPeakToWest ? "Return T25 to off-peak" : "Move T25 to West removal"}
            </button>
          ) : <a href="/sample-wash.xlsx" download>Sample wash Excel</a>}
        </div>
        <p className="local-maintenance-disclaimer">{isOffPeakPreview ? "Sample trains and TIDs only. " : "Excel parsing is real. Image review uses sample results here. "}Requests are stored only in memory; nothing is saved or sent to production.</p>
      </aside>
      <section className="local-maintenance-demo" aria-label="Interactive maintenance sidebar">
        <MaintenancePanel
          requests={requests}
          onAdd={async (item) => setRequests((current) => [...current, { ...item, id: crypto.randomUUID() }])}
          onRemove={async (id) => setRequests((current) => current.filter((item) => item.id !== id))}
          onClearAll={() => setRequests([])}
          stabledTrainIds={isOffPeakPreview ? ["06", "19"] : ["07", "12", "19", "24", "28"]}
          westRemovalRows={isOffPeakPreview ? [
            { trainId: "06", tid: "216", timing: "09:15" },
            ...(moveOffPeakToWest ? [{ trainId: "25", tid: "220", timing: "09:27" }] : []),
          ] : []}
          eastRemovalRows={isOffPeakPreview ? [{ trainId: "19", tid: "218", timing: "09:21" }] : []}
          offPeakRows={isOffPeakPreview ? [
            ...(!moveOffPeakToWest ? [{ trainId: "25", tid: "237" }] : []),
            { trainId: "32", tid: "238" },
            { trainId: "12", tid: "" },
          ] : []}
        />
      </section>
    </main>
  );
}

const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = previewRoot;
previewRoot.render(<Preview />);
