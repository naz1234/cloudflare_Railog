import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TrainRemPanel, buildDefaultTrainRemState, buildTrainRemDepotPayload, getTrainRemPresetConfig } from "../src/pages/DepotStabling";
import { seedPreviewRecords } from "./preview-compact-slate-api";
import "../src/index.css";
import "../src/removalSummarySlate.css";
import "./preview-compact-slate.css";

const sampleTrains = [6, 19, 25, 32, 7, 12, 28, 35, 11, 3, 14, 21, 33, 9, 24, 38, 40, 16, 22, 29, 5, 8, 15, 17, 18, 20, 23, 26, 27, 30, 31, 34, 36, 37, 39, 41, 42, 43, 44, 45, 1, 2, 4, 10, 13];
// Exercise the same active-timetable path as production, using its built-in schedule.
const previewTimetable = {
  id: "local-weekday-timetable",
  timetableType: "weekday",
  parsedData: {
    removal: Object.fromEntries(["west", "east"].map((depot) => [depot, {
      entries: ["9am", "7pm", "12am"].flatMap((label) => {
        const config = getTrainRemPresetConfig(depot, label);
        return config.tids.flatMap((tid) => {
          const time = config.timeMap[tid];
          return time ? [{ tid: String(tid), time, timetableTime: time }] : [];
        });
      }),
    }])),
  },
};
function seed() {
  const state = buildDefaultTrainRemState();
  state.selectedPreset = { west: "7pm", east: "7pm" };
  state.sortMode = { west: "color", east: "color" };
  for (const depot of ["west", "east"]) {
    for (const [label, rows] of Object.entries(state.presetRows[depot])) {
      rows.forEach((row, index) => {
        row.trainId = row.tid || label === "HDW 40"
          ? String(sampleTrains[index % sampleTrains.length]).padStart(2, "0")
          : "";
      });
    }
    state.rows[depot] = state.presetRows[depot][state.selectedPreset[depot]];
  }
  state.updatedAt = new Date().toISOString();
  localStorage.setItem("trainRemState_v1", JSON.stringify(state));
  localStorage.removeItem("trainRemStateDirty_v1");
  seedPreviewRecords(["west", "east"].map((depot) => ({
    ...buildTrainRemDepotPayload(state, depot), id: `preview-${depot}`, updated_date: state.updatedAt,
  })));
}
seed();
const maintenanceMap = Object.fromEntries(sampleTrains.map((train, index) => [`T${train}`, [
  { badgeText: ["RST PM 06-OCT", "Wash 6-Oct", "TLC Comms", "INBOUND (G to C)", "RST PM 06-OCT, inspection before release", "Deep Clean"][index % 6], typeKey: ["RST PM", "Wash", "TLC", "INBOUND", "RST PM", "Deep Clean"][index % 6] },
]]));
const hiddenMaintenanceMap = {
  T6: [{ badgeText: "PM inspection note", hiddenByRequestGroup: true }],
  T19: [{ badgeText: "Previous wash remark", hiddenByRequestGroup: true }],
  T27: [{ badgeText: "Workshop handover note", hiddenByRequestGroup: true }],
  T34: [{ badgeText: "Previous maintenance note", hiddenByRequestGroup: true }],
  T20: [{ badgeText: "Previous wash remark", hiddenByRequestGroup: true }],
};
const sampleWestStabling = { "WD-ST15": [23, 27, 6, 19, 12, 35].map((trainId) => ({ trainId: String(trainId).padStart(2, "0") })) };
const sampleEastStabling = { "ED-ST02": [18, 20].map((trainId) => ({ trainId: String(trainId).padStart(2, "0") })) };

function Preview() {
  const [theme, setTheme] = useState("light");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return <main className="slate-preview-shell">
    <aside className="slate-preview-notes">
      <p className="slate-preview-eyebrow">LOCAL DESIGN PREVIEW</p>
      <h1>Compact Slate</h1>
      <p>Location shows West Depot, East Depot and Off Peak groups. Try TID sorting to see the WD / ED / OP badges.</p>
      <ul><li>Flat rows with subtle dividers</li><li>Clear West / East / Off Peak groups</li><li>Small ticks and eyes — hover for details</li><li>Coloured remark cards — click to read in full</li></ul>
      <div className="slate-preview-actions">
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Try light mode" : "Try dark mode"}</button>
        <button onClick={() => { seed(); setRevision((value) => value + 1); }}>Reset samples</button>
      </div>
      <p className="slate-preview-disclaimer">Sample trains only. Try the presets, sorting and remarks. Edits stay in this preview; production is unchanged.</p>
    </aside>
    <div className="slate-preview-panel"><TrainRemPanel key={revision} maintenanceMap={maintenanceMap} hiddenMaintenanceMap={hiddenMaintenanceMap} westData={sampleWestStabling} eastData={sampleEastStabling} activeTimetable={previewTimetable} /></div>
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview />);
