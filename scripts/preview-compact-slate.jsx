import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { TrainRemPanel, MaintenancePanelShell, buildDefaultTrainRemState, buildTrainRemDepotPayload, getTrainRemPresetConfig, collectTrainRemRowsForDepotCopy, collectTrainRemMainlineInServiceRows } from "../src/pages/DepotStabling";
import { splitRequestMaintenanceMap } from "../src/lib/requestGroupVisibility";
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
const sampleRequests = () => Object.entries(maintenanceMap).flatMap(([trainKey, items]) => (
  items.map((item, index) => ({
    id: `local-request-${trainKey}-${index}`,
    trainId: trainKey.slice(1).padStart(2, "0"),
    requestType: item.badgeText,
    typeKey: item.typeKey,
    customType: "",
    remark: "",
  }))
));
const sampleStablingLocations = Object.fromEntries([
  ...sampleWestStabling["WD-ST15"].map((row, index) => [row.trainId, [`West Depot STB 15 Block ${index + 1}`]]),
  ...sampleEastStabling["ED-ST02"].map((row, index) => [row.trainId, [`East Depot STB 02 Block ${index + 1}`]]),
]);

function Preview() {
  const [theme, setTheme] = useState("light");
  const [revision, setRevision] = useState(0);
  const [requests, setRequests] = useState(sampleRequests);
  const [removalState, setRemovalState] = useState(null);
  const requestMaps = useMemo(() => {
    const map = {};
    requests.forEach((request) => {
      const trainKey = `T${Number(request.trainId.replace(/^T/i, ""))}`;
      (map[trainKey] ||= []).push({
        badgeText: request.groupTitle || request.requestType,
        typeKey: request.typeKey || request.requestType,
        hiddenByRequestGroup: request.groupHidden === true,
      });
    });
    const { visible, hidden } = splitRequestMaintenanceMap(map);
    Object.entries(hiddenMaintenanceMap).forEach(([trainKey, items]) => {
      hidden[trainKey] = [...(hidden[trainKey] || []), ...items];
    });
    return { visible, hidden };
  }, [requests]);
  const updateGroup = (items, changes) => {
    const ids = new Set(items.map((item) => item.id));
    setRequests((current) => current.map((item) => ids.has(item.id) ? { ...item, ...changes } : item));
  };
  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return <main className="slate-preview-shell">
    <aside className="slate-preview-notes">
      <p className="slate-preview-eyebrow">LOCAL DESIGN PREVIEW</p>
      <h1>Compact Slate</h1>
      <p>The live-version Maintenance panel beside the compact Removal Summary. Both panels use local sample data.</p>
      <ul><li>Flat rows with subtle dividers</li><li>Clear West / East / Off Peak groups</li><li>Small ticks and eyes — hover for details</li><li>Coloured remark cards — click to read in full</li></ul>
      <div className="slate-preview-actions">
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Try light mode" : "Try dark mode"}</button>
        <button onClick={() => { seed(); setRequests(sampleRequests()); setRevision((value) => value + 1); }}>Reset samples</button>
      </div>
      <p className="slate-preview-disclaimer">Sample trains only. Try the presets, sorting and remarks. Edits stay in this preview; production is unchanged.</p>
    </aside>
    <div className="slate-preview-panels">
      <MaintenancePanelShell
        requests={requests}
        onAdd={async (item) => {
          const request = { ...item, id: crypto.randomUUID() };
          setRequests((current) => [...current, request]);
          return request;
        }}
        onRemove={async (id) => setRequests((current) => current.filter((item) => item.id !== id))}
        onRenameGroup={async (items, title) => updateGroup(items, { groupTitle: title })}
        onDeleteGroup={async (items) => {
          const ids = new Set(items.map((item) => item.id));
          setRequests((current) => current.filter((item) => !ids.has(item.id)));
        }}
        onToggleGroupHidden={async (items, hidden) => updateGroup(items, { groupHidden: hidden })}
        stabledTrainIds={sampleWestStabling["WD-ST15"].map((row) => row.trainId)}
        stabledTrainLocations={sampleStablingLocations}
        westRemovalRows={removalState ? collectTrainRemRowsForDepotCopy(removalState, "west", previewTimetable, { includeScheduleTiming: true }) : []}
        eastRemovalRows={removalState ? collectTrainRemRowsForDepotCopy(removalState, "east", previewTimetable, { includeScheduleTiming: true }) : []}
        offPeakRows={removalState ? collectTrainRemMainlineInServiceRows(removalState, previewTimetable) : []}
      />
      <div className="slate-preview-panel"><TrainRemPanel key={revision} maintenanceMap={requestMaps.visible} hiddenMaintenanceMap={requestMaps.hidden} westData={sampleWestStabling} eastData={sampleEastStabling} activeTimetable={previewTimetable} onTrainRemStateChange={setRemovalState} /></div>
    </div>
  </main>;
}
const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = previewRoot;
previewRoot.render(<Preview />);
