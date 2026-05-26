import { useState } from "react";
import { Train, Plus, Clock } from "lucide-react";

function TimeInput({ value, onChange }) {
  const [hour, setHour] = useState(value ? value.split(":")[0] : "");
  const [minute, setMinute] = useState(value ? value.split(":")[1] : "");

  const update = (h, m) => {
    if (h !== "" && m !== "") {
      onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    } else {
      onChange("");
    }
  };

  const selectCls = "bg-[#071828] outline-none text-xs text-[#c8d8ea] font-medium cursor-pointer rounded-md px-1 py-0.5";
  const optionStyle = {
    backgroundColor: "#071828",
    color: "#c8d8ea",
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-[#1e3a56] bg-[#071828] px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-[#4f8ef7] transition-all">
      <Clock className="w-3 h-3 text-[#4a8ab5] flex-shrink-0" />
      <select
        value={hour}
        onChange={(e) => { setHour(e.target.value); update(e.target.value, minute); }}
        className={selectCls}
      >
        <option value="" style={optionStyle}>HH</option>
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={String(i).padStart(2, "0")} style={optionStyle}>
            {String(i).padStart(2, "0")}
          </option>
        ))}
      </select>
      <span className="text-[#4a8ab5] font-bold text-xs">:</span>
      <select
        value={minute}
        onChange={(e) => { setMinute(e.target.value); update(hour, e.target.value); }}
        className={selectCls}
      >
        <option value="" style={optionStyle}>MM</option>
        {Array.from({ length: 60 }, (_, i) => (
          <option key={i} value={String(i).padStart(2, "0")} style={optionStyle}>
            {String(i).padStart(2, "0")}
          </option>
        ))}
      </select>
    </div>
  );
}

function parseIdList(input) {
  const result = [];
  const parts = input.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      for (let i = start; i <= end; i++) result.push(String(i));
    } else {
      result.push(part);
    }
  }
  return result;
}

function formatTrainId(value) {
  const clean = value.trim().toUpperCase();
  if (!clean) return "";
  const withoutT = clean.startsWith("T") ? clean.slice(1) : clean;
  const num = withoutT.replace(/[^0-9]/g, "");
  const padded = num ? num.padStart(2, "0") : withoutT;
  return `T${padded}`;
}

function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const OperationButton = ({ active, children, onClick }) => (
  <button type="button" onClick={onClick}
    className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
      active ? "bg-[#1a3a5c] text-[#c8d8ea] shadow-sm" : "text-[#4a6a8a] hover:bg-[#0f2d4a] hover:text-[#c8d8ea]"
    }`}>
    {children}
  </button>
);

export default function AverageTimingForm({ onAdd }) {
  const [tids, setTids] = useState("");
  const [trainIds, setTrainIds] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [operation, setOperation] = useState("removed");
  const [depot, setDepot] = useState("West Depot");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    const tidList = parseIdList(tids);
    const trainIdList = parseIdList(trainIds);
    if (!tids.trim()) return setError("Please enter TIDs.");
    if (!trainIds.trim()) return setError("Please enter Train IDs.");
    if (!startTime) return setError("Please enter a start time.");
    if (!endTime) return setError("Please enter an end time.");
    if (tidList.length === 0) return setError("No valid TIDs found.");
    if (trainIdList.length === 0) return setError("No valid Train IDs found.");
    if (tidList.length !== trainIdList.length) return setError(`TID count (${tidList.length}) must match Train ID count (${trainIdList.length}).`);

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    const count = tidList.length;
    const interval = count > 1 ? Math.round((endMin - startMin) / (count - 1)) : 0;

    for (let i = 0; i < count; i++) {
      const mins = startMin + interval * i;
      const time = minutesToTime(mins);
      const formattedTrain = formatTrainId(trainIdList[i]);
      const tid = tidList[i];
      let line = "";
      if (operation === "inserted") {
        line = `${time} hrs – ${formattedTrain} (TID ${tid}) inserted from ${depot} to mainline.`;
      } else {
        line = `${time} hrs – ${formattedTrain} (TID ${tid}) removed from mainline to ${depot}.`;
      }
      onAdd({ line, operation, notes: "", depot: depot === "West Depot" ? "west" : "east" });
    }

    setTids("");
    setTrainIds("");
    setStartTime("");
    setEndTime("");
  };

  const inputCls = "w-full rounded-lg border border-[#1e3a56] bg-[#071828] px-3 py-2 text-xs text-[#c8d8ea] outline-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] transition-all placeholder:text-[#2b4f6b]";
  const labelCls = "block text-[10px] font-semibold text-[#4a8ab5] tracking-widest uppercase mb-1";

  return (
    <div className="bg-[#0b1f33] rounded-xl border border-[#2b4f6b] shadow-md overflow-hidden">
      <div className="border-b border-[#1a3a56] px-4 py-3" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
            <Train className="w-3.5 h-3.5 text-[#4f8ef7]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Batch Timing Entry</h2>
            <p className="text-[10px] text-[#4a8ab5]">Multiple train movement logs automatically</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
        <div>
          <label className={labelCls}>TIDs</label>
          <input value={tids} onChange={(e) => setTids(e.target.value)} placeholder="e.g. 217,203,113 or 101-110" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Train IDs</label>
          <input value={trainIds} onChange={(e) => setTrainIds(e.target.value)} placeholder="e.g. 34,66,44,43" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Start Time</label>
            <TimeInput key={`start-${startTime === "" ? "reset" : "set"}`} value={startTime} onChange={setStartTime} />
          </div>
          <div>
            <label className={labelCls}>End Time</label>
            <TimeInput key={`end-${endTime === "" ? "reset" : "set"}`} value={endTime} onChange={setEndTime} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Operation</label>
          <div className="flex gap-0.5 rounded-lg bg-[#050f1a] border border-[#1e3a56] p-0.5">
            <OperationButton active={operation === "inserted"} onClick={() => setOperation("inserted")}>Insertion</OperationButton>
            <OperationButton active={operation === "removed"} onClick={() => setOperation("removed")}>Removal</OperationButton>
          </div>
        </div>
        <div>
          <label className={labelCls}>Depot</label>
          <div className="grid grid-cols-2 gap-1.5">
            {["West Depot", "East Depot"].map((d) => (
              <button key={d} type="button" onClick={() => setDepot(d)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                  depot === d ? "border-[#4f8ef7] bg-[#0f2d4a] text-[#c8d8ea]" : "border-[#1e3a56] bg-[#0a1e2e] text-[#7a91b0] hover:border-[#2b4f6b] hover:text-[#c8d8ea]"
                }`}>
                <span>{d}</span>
                <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${depot === d ? "border-[#4f8ef7] bg-[#4f8ef7]" : "border-[#2b4f6b]"}`}>
                  {depot === d && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                </span>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-[10px] text-red-400 bg-red-950/40 border border-red-800/60 rounded-md px-2.5 py-1.5">{error}</p>}
        <button type="submit"
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#1a3a5c] hover:bg-[#1e4d72] border border-[#2b4f6b] text-[#c8d8ea] font-bold text-xs py-2.5 shadow-sm transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add to Log
        </button>
      </form>
    </div>
  );
}
