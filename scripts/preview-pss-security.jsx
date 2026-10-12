import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PossessionTabContent } from "virtual:pss-security.jsx";
import { base44 } from "./preview-compact-slate-api.js";
import "../src/index.css";

const fixtures = {
  west: [{ picName: "Jay Bigcas", picId: "FLOW_1113", issueTime: "13:02", accessAuthTime: "13:02", accessPoint: "GATE 03", scd: "No", accessDetails: [
    { accessNo: "303,004", description: "Replacement of the IRJ - SA09 - DNF-143-ED IRJ & Weld" },
    { accessNo: "303005", description: "GWS, 1 Yearly, Buffer Stops Inspection/Cleaning, Route 15" },
  ] }, { picName: "West Second PIC", picId: "FLOW_3333", accessNo: "303006", description: "West Depot second inspection", issueTime: "14:30", scd: "No", securityDetails: { phone: "0550000002", location: "WEST TRACK 2", gateNo: "06" } }],
  east: [{ picName: "East PIC", picId: "FLOW_2222", accessNo: "40001", description: "East Depot inspection", issueTime: "14:05", scd: "No" },
    { picName: "East Second PIC", accessNo: "40002", description: "East Depot second inspection", scd: "No", securityDetails: { phone: "0550000004", location: "EAST TRACK 4", gateNo: "08" } }],
};
for (const depot of ["west", "east"]) {
  const suffix = depot === "east" ? "_east" : "";
  localStorage.setItem(`possessionLog_v2${suffix}`, JSON.stringify(fixtures[depot]));
  localStorage.setItem(`scSecurityMessage_v1${suffix}`, JSON.stringify({
    picName: "Stale saved PIC — must not appear", accessNo: "999", description: "Stale activity",
    phone: depot === "west" ? "0501234567" : "0599876543", location: depot === "west" ? "West Depot" : "East Depot", gateNo: depot === "west" ? "03" : "04",
  }));
}
window.pssPreviewCopies = [];
Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
  writeText: async (text) => { window.pssPreviewCopies.push(text); console.log("[fixture-copy] " + text); },
} });

function Preview() {
  const [theme, setTheme] = useState("dark");
  return <main style={{ padding: 16 }}>
    <nav style={{ display: "flex", gap: 16, marginBottom: 16, color: theme === "dark" ? "#fff" : "#111" }}>
      <span>Local sample PSS only — no production connection</span>
      <button onClick={() => { const next = theme === "dark" ? "light" : "dark"; document.documentElement.dataset.appTheme = next; document.documentElement.classList.toggle("dark", next === "dark"); setTheme(next); }}>Switch to {theme === "dark" ? "light" : "dark"} mode</button>
      <button onClick={async () => {
        const [record] = await base44.entities.PossessionLive.filter({ stateKey: "possession-log-east" });
        await base44.entities.PossessionLive.update(record.id, { data: record.data.map((entry, i) => i === 1 ? { ...entry, picName: "Remote East Second PIC" } : entry), updatedAt: new Date().toISOString() });
      }}>Simulate East Entry 2 remote update</button>
    </nav>
    <PossessionTabContent />
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview />);
