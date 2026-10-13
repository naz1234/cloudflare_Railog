import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import SleepModeWorkspace from "../src/components/SleepModeWorkspace.jsx";
import { base44 } from "./preview-compact-slate-api.js";
import "../src/index.css";

const fixtureLogs = [
  ...[
    ["18:25", ["23"], "WD-ST15"],
    ["19:06", ["09"], "WD-ST14"],
    ["19:22", ["21"], "WD-ST15"],
    ["20:21", ["30", "26"], "WD-ST15"],
    ["20:21", ["47"], "WD-ST15"],
    ["20:49", ["20"], "WD-ST15"],
    ["21:23", ["16"], "WD-ST15"],
    ["21:29", ["46", "43"], "WD-ST13"],
    ["21:29", ["12"], "WD-ST12"],
  ].map(([time, trainIds, location], index) => ({ id: `fixture-west-${index}`, time, trainIds, location, mode: "sleep", createdAt: `2026-10-11T${time}:00Z` })),
  { id: "fixture-east-sleep", time: "19:25", trainIds: ["18"], location: "ED-ST02", mode: "sleep", createdAt: "2026-10-11T19:25:00Z" },
  { id: "fixture-east-wake", time: "22:10", trainIds: ["18"], location: "ED-ST02", mode: "wake", remark: "Ready for service", createdAt: "2026-10-11T22:10:00Z" },
];

async function seedFixtures() {
  await base44.entities.SleepModeLog.create({ recordKey: "sleep-mode-main", logs: fixtureLogs, updatedAt: new Date().toISOString() });
}

function Preview() {
  const [fixtureVersion, setFixtureVersion] = useState(0);
  const [theme, setTheme] = useState("dark");
  return (
    <main style={{ padding: 16 }}>
      <nav style={{ display: "flex", gap: 12, marginBottom: 16, color: theme === "dark" ? "#fff" : "#111" }}>
        <span>Local sample logs only — no production connection</span>
        <button onClick={async () => { await seedFixtures(); setFixtureVersion((value) => value + 1); }}>Reset test fixtures</button>
        <button onClick={() => {
          const next = theme === "dark" ? "light" : "dark";
          document.documentElement.dataset.appTheme = next;
          document.documentElement.classList.toggle("dark", next === "dark");
          setTheme(next);
        }}>Switch to {theme === "dark" ? "light" : "dark"} mode</button>
      </nav>
      <SleepModeWorkspace key={fixtureVersion} westData={{ "WD-ST15": [{ trainId: "26" }, { trainId: "30" }, { trainId: "23" }], "WD-ST14": [{ trainId: "29" }, { trainId: "09" }] }} eastData={{ "ED-ST02": [{ trainId: "18" }] }} />
    </main>
  );
}

await seedFixtures();
createRoot(document.getElementById("root")).render(<Preview />);
