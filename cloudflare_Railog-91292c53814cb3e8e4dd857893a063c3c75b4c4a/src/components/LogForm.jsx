import { useState } from "react";
import { Train, Clock, Pencil, Plus, Check } from "lucide-react";

export default function LogForm({ onAdd }) {
  const [trainId, setTrainId] = useState("");
  const [operation, setOperation] = useState("inserted");
  const [depot, setDepot] = useState("West Depot");
  const [notes, setNotes] = useState("");
  const [useNow, setUseNow] = useState(true);
  const [customTime, setCustomTime] = useState("");
  const [swapReason, setSwapReason] = useState("");
  const [replacementTrainId, setReplacementTrainId] = useState("");

  const getTime = () => {
    if (!useNow && customTime) return customTime;
    return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: undefined, hour12: false }).slice(0, 5);
  };

  const formatTrainId = (value) => {
    const clean = value.trim().toUpperCase();
    if (!clean) return "";
    const withoutT = clean.startsWith("T") ? clean.slice(1) : clean;
    const num = withoutT.replace(/\D/g, "");
    const padded = num ? num.padStart(2, "0") : withoutT;
    return `T${padded}`;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!trainId.trim()) return;
    if (operation === "swapped") {
      if (!swapReason.trim()) return;
      if (!replacementTrainId.trim()) return;
    }
    const time = getTime();
    const formattedTrainId = formatTrainId(trainId);
    const formattedReplacementTrainId = formatTrainId(replacementTrainId);
    let line = "";
    if (operation === "inserted") {
      line = `${time} hrs - ${formattedTrainId} inserted from ${depot} to mainline.`;
    } else if (operation === "removed") {
      line = `${time} hrs - ${formattedTrainId} removed from mainline to ${depot}.`;
    } else {
      line = `${time} hrs - ${formattedTrainId} removed from mainline to ${depot} stabling due to ${swapReason.trim()}. Replaced by ${formattedReplacementTrainId}.`;
    }
    onAdd({ trainId: formattedTrainId, operation, depot: depot === "West Depot" ? "west" : "east", notes, line });
    setTrainId("");
    setNotes("");
    setSwapReason("");
    setReplacementTrainId("");
  };

  const TickButton = ({ active, children, onClick }) => (
    <button type="button" onClick={onClick}
      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
        active ? "border-[#4f8ef7] bg-[#0f2d4a] text-[#c8d8ea]" : "border-[#1e3a56] bg-[#0a1e2e] text-[#7a91b0] hover:border-[#2b4f6b] hover:text-[#c8d8ea]"
      }`}>
      <span>{children}</span>
      <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${active ? "border-[#4f8ef7] bg-[#4f8ef7] text-white" : "border-[#2b4f6b] text-transparent"}`}>
        <Check className="w-2.5 h-2.5" />
      </span>
    </button>
  );

  const OperationButton = ({ active, children, onClick }) => (
    <button type="button" onClick={onClick}
      className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
        active ? "bg-[#1a3a5c] text-[#c8d8ea] shadow-sm" : "text-[#4a6a8a] hover:bg-[#0f2d4a] hover:text-[#c8d8ea]"
      }`}>
      {children}
    </button>
  );

  const inputCls = "w-full rounded-lg border border-[#1e3a56] bg-[#071828] px-3 py-2 text-xs text-[#c8d8ea] outline-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] transition-all placeholder:text-[#2b4f6b]";
  const labelCls = "block text-[10px] font-semibold text-[#4a8ab5] tracking-widest uppercase mb-1";
  const timeSelectCls = "bg-[#071828] text-[#c8d8ea] outline-none text-xs font-medium cursor-pointer rounded-md px-1 py-0.5 [color-scheme:dark]";
  const timeOptionStyle = { backgroundColor: "#071828", color: "#c8d8ea" };

  return (
    <div className="bg-[#0b1f33] rounded-xl border border-[#2b4f6b] shadow-md overflow-hidden">
      <div className="border-b border-[#1a3a56] px-4 py-3" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
            <Train className="w-3.5 h-3.5 text-[#4f8ef7]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Add insertion, removal, or swapping</h2>
            <p className="text-[12px] text-[#4a8ab5]">Add Train Movement</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
        <div>
          <label className={labelCls}>Train ID</label>
          <div className="flex rounded-lg border border-[#1e3a56] overflow-hidden bg-[#071828] focus-within:ring-1 focus-within:ring-[#4f8ef7] focus-within:border-[#4f8ef7] transition-all">
            <span className="px-3 py-2 text-xs text-[#4a8ab5] border-r border-[#1e3a56] font-medium">T</span>
            <input value={trainId} onChange={(e) => setTrainId(e.target.value)} placeholder="e.g. 12"
              className="w-full bg-transparent px-3 py-2 text-xs outline-none text-[#c8d8ea] placeholder:text-[#2b4f6b]" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Timing</label>
          <div className="flex gap-1.5 mb-1.5">
            <button type="button" onClick={() => setUseNow(true)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${useNow ? "bg-[#1a3a5c] text-[#c8d8ea] border border-[#4f8ef7]" : "bg-[#0a1e2e] border border-[#1e3a56] text-[#4a6a8a] hover:border-[#2b4f6b] hover:text-[#c8d8ea]"}`}>
              <Clock className="w-3 h-3" /> Now
            </button>
            <button type="button" onClick={() => setUseNow(false)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!useNow ? "bg-[#1a3a5c] text-[#c8d8ea] border border-[#4f8ef7]" : "bg-[#0a1e2e] border border-[#1e3a56] text-[#4a6a8a] hover:border-[#2b4f6b] hover:text-[#c8d8ea]"}`}>
              <Pencil className="w-3 h-3" /> Custom
            </button>
          </div>
          {!useNow && (
            <div className="flex items-center gap-1 rounded-lg border border-[#1e3a56] bg-[#071828] px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-[#4f8ef7] transition-all">
              <Clock className="w-3 h-3 text-[#4a8ab5] flex-shrink-0" />
              <select
                value={customTime ? customTime.split(":")[0] : ""}
                onChange={(e) => {
                  const h = e.target.value;
                  const m = customTime ? customTime.split(":")[1] || "00" : "00";
                  if (h) setCustomTime(`${h}:${m}`);
                  else setCustomTime("");
                }}
                className={timeSelectCls}
                style={{ colorScheme: "dark" }}
              >
                <option value="" style={timeOptionStyle}>HH</option>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={String(i).padStart(2, "0")} style={timeOptionStyle}>
                    {String(i).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className="text-[#4a8ab5] font-bold text-xs">:</span>
              <select
                value={customTime ? customTime.split(":")[1] || "" : ""}
                onChange={(e) => {
                  const m = e.target.value;
                  const h = customTime ? customTime.split(":")[0] || "00" : "00";
                  if (m) setCustomTime(`${h}:${m}`);
                  else setCustomTime("");
                }}
                className={timeSelectCls}
                style={{ colorScheme: "dark" }}
              >
                <option value="" style={timeOptionStyle}>MM</option>
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={String(i).padStart(2, "0")} style={timeOptionStyle}>
                    {String(i).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
          )}
          {useNow && (
            <div className="flex items-center gap-1.5 rounded-lg bg-[#0a1e2e] border border-[#1e3a56] px-5 py-1.5 text-[10px] text-[#4a8ab5]">
              <Clock className="w-3 h-3" /> {getTime()} hrs (current)
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Operation</label>
          <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-[#050f1a] border border-[#1e3a56] p-0.5">
            <OperationButton active={operation === "inserted"} onClick={() => setOperation("inserted")}>Insertion</OperationButton>
            <OperationButton active={operation === "removed"} onClick={() => setOperation("removed")}>Removal</OperationButton>
            <OperationButton active={operation === "swapped"} onClick={() => setOperation("swapped")}>Swapping</OperationButton>
          </div>
        </div>

        <div>
          <label className={labelCls}>Depot</label>
          <div className="grid grid-cols-2 gap-1.5">
            <TickButton active={depot === "West Depot"} onClick={() => setDepot("West Depot")}>West Depot</TickButton>
            <TickButton active={depot === "East Depot"} onClick={() => setDepot("East Depot")}>East Depot</TickButton>
          </div>
        </div>

        {operation === "swapped" && (
          <div className="space-y-3.5">
            <div>
              <label className={labelCls}>Due To</label>
              <input value={swapReason} onChange={(e) => setSwapReason(e.target.value)} placeholder="e.g. HVAC Testing Train" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Replaced By</label>
              <div className="flex rounded-lg border border-[#1e3a56] overflow-hidden bg-[#071828] focus-within:ring-1 focus-within:ring-[#4f8ef7] transition-all">
                <span className="px-3 py-2 text-xs text-[#4a8ab5] border-r border-[#1e3a56] font-medium">T</span>
                <input value={replacementTrainId} onChange={(e) => setReplacementTrainId(e.target.value)} placeholder="e.g. 08" className="w-full bg-transparent px-3 py-2 text-xs outline-none text-[#c8d8ea] placeholder:text-[#2b4f6b]" />
              </div>
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>Notes <span className="normal-case font-normal text-[#2b4f6b]">(optional)</span></label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional remarks..." rows={2}
            className="w-full min-h-[56px] rounded-lg border border-[#1e3a56] bg-[#071828] px-3 py-2 text-xs text-[#c8d8ea] outline-none resize-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] transition-all placeholder:text-[#2b4f6b]" />
        </div>

        <button type="submit"
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#1a3a5c] hover:bg-[#1e4d72] border border-[#2b4f6b] text-[#c8d8ea] font-bold text-xs py-2.5 shadow-sm transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add to Log
        </button>
      </form>
    </div>
  );
}
