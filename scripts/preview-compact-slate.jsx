import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TrainRemPanel, MaintenancePanelShell, StablingSection, TrainMovementExcelSheet, RemovalLogOutputFromTrainRem, RequestedTrainActionSummary, getDuplicates, getWestStablingKeys, getMainStablingLocations, buildStablingMoveState, buildDefaultTrainRemState, buildTrainRemDepotPayload, getTrainRemPresetConfig, collectTrainRemRowsForDepotCopy, collectTrainRemMainlineInServiceRows, buildTrainRemRemovalLog, createTrainMovementExcelRow, buildTrainMovementExcelLivePayload, saveTrainMovementExcelRows, saveTrainMovementExcelLogRows, saveTrainMovementExcelLocalUpdatedAt, saveTrainMovementExcelDirty } from "../src/pages/DepotStabling";
import OfficialEastExcelGenerator from "../src/components/OfficialEastExcelGenerator";
import { RemovalScanPage } from "../src/components/depot/RemovalScan";
import { splitRequestMaintenanceMap } from "../src/lib/requestGroupVisibility";
import { seedPreviewRecords, seedPreviewMovementRecord } from "./preview-compact-slate-api";
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
  const movementRows = [
    { id: "preview-swapping", operation: "swapping", depot: "west", trainId: "23", tid: "213", replacedBy: "42", time: "19:00", reason: "TLC Comms", swapAutoFillTrainKey: "23" },
    { id: "preview-insertion", operation: "insertion", depot: "east", trainId: "18", tid: "209", road: "ED-ST02", from: "ED-ST02", time: "19:50", reason: "PM completed" },
    { id: "preview-removal", operation: "removal", depot: "west", trainId: "06", tid: "101", time: "19:26", reason: "RST PM 06-OCT" },
  ].map(createTrainMovementExcelRow);
  saveTrainMovementExcelRows(movementRows);
  saveTrainMovementExcelLogRows([]);
  saveTrainMovementExcelLocalUpdatedAt(Date.now());
  saveTrainMovementExcelDirty(false);
  seedPreviewMovementRecord({
    ...buildTrainMovementExcelLivePayload({ rows: movementRows, logRows: [], updatedAt: state.updatedAt }),
    id: "preview-movement", updated_date: state.updatedAt,
  });
  return state;
}
const initialRemovalState = seed();
const previewPanelLinks = [
  ["movement", "Movement Log"],
  ["removal-output", "Removal Output"],
  ["request-summary", "Request Summary"],
  ["excel-generator", "Excel Generator"],
];
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
const previewDepots = [
  { depot: "west", depotLabel: "West Depot", roads: ["WD-ST15", "WD-ST14", "WD-ST13", "WD-ST12"], blockLabels: ["BLOCK 7", "BLOCK 6", "BLOCK 5", "BLOCK 4", "BLOCK 3", "BLOCK 2", "BLOCK 1"], blockIndices: [6, 5, 4, 3, 2, 1, 0], labelSide: "left" },
  { depot: "east", depotLabel: "East Depot", roads: ["ED-ST02", "ED-ST03"], blockLabels: ["BLOCK 1", "BLOCK 2", "BLOCK 3", "BLOCK 4", "BLOCK 5", "BLOCK 6", "BLOCK 7"], blockIndices: [0, 1, 2, 3, 4, 5, 6], labelSide: "right" },
];
const sampleStabling = {
  west: { "WD-ST15": [23, 27, 6, 19, 12, 35, 0], "WD-ST14": [25, 32, 7, 28, 11, 3, 0], "WD-ST13": [14, 21, 33, 9, 24, 38, 0], "WD-ST12": [40, 16, 22, 29, 5, 8, 0] },
  east: { "ED-ST02": [18, 20, 15, 17, 26, 30, 0], "ED-ST03": [31, 34, 36, 37, 39, 41, 0] },
};
const createStablingSamples = () => Object.fromEntries(Object.entries(sampleStabling).map(([depot, roads]) => [
  depot, Object.fromEntries(Object.entries(roads).map(([road, trains]) => [
    road, trains.map((trainId) => ({ trainId: trainId ? String(trainId).padStart(2, "0") : "" })),
  ])),
]));
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
function Preview() {
  const [theme, setTheme] = useState("light");
  const [revision, setRevision] = useState(0);
  const [requests, setRequests] = useState(sampleRequests);
  const [stabling, setStabling] = useState(createStablingSamples);
  const [removalState, setRemovalState] = useState(initialRemovalState);
  const cellRefs = useRef({});
  const workspaceRef = useRef(null);
  const panelRefs = useRef({});
  const allDepots = useMemo(() => previewDepots.map((config) => ({ ...config, data: stabling[config.depot] })), [stabling]);
  const duplicates = useMemo(() => getDuplicates(stabling.west, stabling.east), [stabling]);
  const stablingLocations = useMemo(() => getMainStablingLocations(stabling.west, stabling.east), [stabling]);
  const updateStabling = (depot, road, blockIndex, value, commit = false) => {
    setStabling((current) => {
      if (commit) {
        const { nextWest, nextEast } = buildStablingMoveState({ westData: current.west, eastData: current.east, depot, road, blockIndex, trainId: value });
        return { west: nextWest, east: nextEast };
      }
      return {
        ...current,
        [depot]: { ...current[depot], [road]: current[depot][road].map((block, index) => index === blockIndex ? { ...block, trainId: value } : block) },
      };
    });
  };
  const handleCellKeyDown = (event, depot, roadIndex, visualIndex, totalRows, totalCols) => {
    const directions = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const row = Math.max(0, Math.min(totalRows - 1, roadIndex + direction[0]));
    const column = Math.max(0, Math.min(totalCols - 1, visualIndex + direction[1]));
    const input = cellRefs.current[`${depot}-${row}-${column}`];
    input?.focus();
    input?.select();
  };
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
  const jumpToPanel = (id) => {
    const workspace = workspaceRef.current;
    const panel = panelRefs.current[id];
    if (!workspace || !panel) return;
    workspace.scrollTo({
      top: workspace.scrollTop + panel.getBoundingClientRect().top - workspace.getBoundingClientRect().top,
      left: 0,
      behavior: "smooth",
    });
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
      <p>Stabling, Maintenance, Removal Summary and the four log/export panels — using the same components as the live page.</p>
      <div className="slate-preview-actions">
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Try light mode" : "Try dark mode"}</button>
        <button onClick={() => { setRemovalState(seed()); setRequests(sampleRequests()); setStabling(createStablingSamples()); setRevision((value) => value + 1); }}>Reset samples</button>
      </div>
      <p className="slate-preview-disclaimer">Sample trains only. Edits and sync stay in this preview; production is unchanged. Scroll sideways to see the side panels.</p>
      <nav className="slate-preview-jump-links" aria-label="Preview panel shortcuts">
        {previewPanelLinks.map(([id, label]) => <button key={id} type="button" onClick={() => jumpToPanel(id)}>{label}</button>)}
      </nav>
    </aside>
    <div className="slate-preview-workspace-scroll" ref={workspaceRef} role="region" aria-label="Local stabling and removal workspace" tabIndex={0}>
    <div className="slate-preview-workspace">
    <div className="slate-preview-depots">
      {allDepots.map((config) => <StablingSection
        key={`${config.depot}-${revision}`}
        {...config}
        activeTimetableType="weekday"
        title={`${config.depotLabel.toUpperCase()} STABLING`}
        duplicates={duplicates}
        maintenanceMap={requestMaps.visible}
        hiddenMaintenanceMap={requestMaps.hidden}
        cellRefs={cellRefs}
        onCellKeyDown={handleCellKeyDown}
        onUpdate={(road, blockIndex, value) => updateStabling(config.depot, road, blockIndex, value)}
        onCommit={(road, blockIndex, value) => updateStabling(config.depot, road, blockIndex, value, true)}
        onClearAll={() => setStabling((current) => ({ ...current, [config.depot]: Object.fromEntries(config.roads.map((road) => [road, Array.from({ length: 7 }, () => ({ trainId: "" }))])) }))}
        allDepots={allDepots}
      />)}
      <div className="slate-preview-live-window" ref={(element) => { panelRefs.current.movement = element; }}>
        <TrainMovementExcelSheet
          key={`movement-${revision}`}
          requests={requests}
          trainRemState={removalState}
          activeTimetable={previewTimetable}
          activeTimetableType="weekday"
          stabledTrainLocations={stablingLocations}
        />
      </div>
      <div className="slate-preview-live-window" ref={(element) => { panelRefs.current["removal-output"] = element; }}>
        <RemovalLogOutputFromTrainRem
          trainRemState={removalState}
          maintenanceMap={requestMaps.visible}
          requests={requests}
          westData={stabling.west} eastData={stabling.east}
          activeTimetable={previewTimetable}
          activeTimetableType="weekday"
        />
      </div>
      <div className="slate-preview-live-window" ref={(element) => { panelRefs.current["request-summary"] = element; }}>
        <RequestedTrainActionSummary requests={requests} />
      </div>
      <div className="slate-preview-live-window" ref={(element) => { panelRefs.current["excel-generator"] = element; }}>
        <OfficialEastExcelGenerator
          key={`excel-generator-${revision}`}
          eastRemovalLog={buildTrainRemRemovalLog(removalState, "east", requestMaps.visible, previewTimetable, stabling.east)}
          westRemovalLog={buildTrainRemRemovalLog(removalState, "west", requestMaps.visible, previewTimetable, stabling.west)}
        />
      </div>
    </div>
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
        stabledTrainIds={Array.from(getWestStablingKeys(stabling.west))}
        stabledTrainLocations={stablingLocations}
        westRemovalRows={removalState ? collectTrainRemRowsForDepotCopy(removalState, "west", previewTimetable, { includeScheduleTiming: true }) : []}
        eastRemovalRows={removalState ? collectTrainRemRowsForDepotCopy(removalState, "east", previewTimetable, { includeScheduleTiming: true }) : []}
        offPeakRows={removalState ? collectTrainRemMainlineInServiceRows(removalState, previewTimetable) : []}
      />
      <div className="slate-preview-panel"><TrainRemPanel key={revision} maintenanceMap={requestMaps.visible} hiddenMaintenanceMap={requestMaps.hidden} westData={stabling.west} eastData={stabling.east} activeTimetable={previewTimetable} onTrainRemStateChange={setRemovalState} /></div>
    </div>
    </div>
    </div>
  </main>;
}
const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = previewRoot;
previewRoot.render(window.location.hash.startsWith("#/removal-scan") ? <RemovalScanPage /> : <Preview />);
