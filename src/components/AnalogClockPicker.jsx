import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";

// Draws an analog clock face for hour or minute selection
function ClockFace({ mode, value, onChange }) {
  const svgRef = useRef(null);
  const isDragging = useRef(false);

  const cx = 110, cy = 110, r = 90;
  const count = mode === "hour" ? 24 : 12;
  const innerR = mode === "hour" ? 58 : r; // inner ring for hours 13-23
  const outerR = r;

  function getAngleValue(e) {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left - (rect.width / 2);
    const y = clientY - rect.top - (rect.height / 2);
    let angle = Math.atan2(x, -y) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    if (mode === "hour") {
      // Determine inner (13-23, 0) vs outer (1-12) ring
      const dist = Math.sqrt(x * x + y * y) / (rect.width / 220);
      const isInner = dist < 74;
      const segment = Math.round(angle / 30) % 12;
      if (isInner) {
        // inner ring: 0 at top, then 13-23
        const h = segment === 0 ? 0 : segment + 12;
        onChange(h);
      } else {
        const h = segment === 0 ? 12 : segment;
        onChange(h);
      }
    } else {
      const m = Math.round(angle / 6) % 60;
      onChange(m);
    }
  }

  const handlePointerDown = (e) => { isDragging.current = true; getAngleValue(e); };
  const handlePointerMove = (e) => { if (isDragging.current) getAngleValue(e); };
  const handlePointerUp = () => { isDragging.current = false; };

  useEffect(() => {
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchend", handlePointerUp);
    return () => {
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, []);

  // Compute hand angle
  let handAngle;
  if (mode === "hour") {
    const h12 = value % 12;
    handAngle = h12 * 30;
  } else {
    handAngle = value * 6;
  }
  const rad = (handAngle - 90) * (Math.PI / 180);

  // Hand endpoint
  const isInnerHour = mode === "hour" && (value === 0 || value >= 13);
  const handR = mode === "hour" ? (isInnerHour ? 50 : 78) : 78;
  const hx = cx + handR * Math.cos(rad);
  const hy = cy + handR * Math.sin(rad);

  // Build tick marks
  const ticks = [];
  if (mode === "hour") {
    // Outer ring: 1-12
    for (let i = 1; i <= 12; i++) {
      const a = ((i * 30) - 90) * (Math.PI / 180);
      const tx = cx + outerR * 0.78 * Math.cos(a);
      const ty = cy + outerR * 0.78 * Math.sin(a);
      const active = value === i;
      ticks.push({ label: i, x: tx, y: ty, active, key: `o${i}` });
    }
    // Inner ring: 13-23, 0
    for (let i = 0; i <= 11; i++) {
      const h = i === 0 ? 0 : i + 12;
      const a = ((i * 30) - 90) * (Math.PI / 180);
      const tx = cx + innerR * 0.52 * Math.cos(a);
      const ty = cy + innerR * 0.52 * Math.sin(a);
      const active = value === h;
      ticks.push({ label: h === 0 ? "00" : h, x: tx, y: ty, active, key: `i${i}` });
    }
  } else {
    for (let i = 0; i < 60; i += 5) {
      const a = ((i * 6) - 90) * (Math.PI / 180);
      const tx = cx + outerR * 0.82 * Math.cos(a);
      const ty = cy + outerR * 0.82 * Math.sin(a);
      const active = value === i;
      ticks.push({ label: i === 0 ? "00" : i, x: tx, y: ty, active, key: `m${i}` });
    }
  }

  return (
    <svg
      ref={svgRef}
      width="220" height="220"
      className="cursor-pointer select-none touch-none"
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
    >
      {/* Face */}
      <circle cx={cx} cy={cy} r={r + 10} fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1.5" />

      {/* Hand */}
      <line x1={cx} y1={cy} x2={hx} y2={hy} stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill="#334155" />
      <circle cx={hx} cy={hy} r="5" fill="#334155" />

      {/* Ticks */}
      {ticks.map(({ label, x, y, active, key }) => (
        <g key={key}>
          {active && <circle cx={x} cy={y} r="13" fill="#334155" />}
          <text
            x={x} y={y}
            textAnchor="middle" dominantBaseline="central"
            fontSize={active ? "11" : "10"}
            fontWeight={active ? "700" : "500"}
            fill={active ? "white" : "#64748b"}
            fontFamily="Inter, sans-serif"
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function AnalogClockPicker({ value, onChange, placeholder = "Pick time" }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("hour"); // "hour" | "minute"
  const [hour, setHour] = useState(null);
  const [minute, setMinute] = useState(null);
  const ref = useRef(null);

  // Sync from value prop
  useEffect(() => {
    if (value) {
      const parts = value.split(":");
      setHour(parseInt(parts[0]));
      setMinute(parseInt(parts[1]));
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleHourSelect = (h) => {
    setHour(h);
    setMode("minute");
  };

  const handleMinuteSelect = (m) => {
    setMinute(m);
    const h = hour ?? 0;
    onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    setOpen(false);
    setMode("hour");
  };

  const displayValue = value
    ? value
    : "";

  const handleClear = (e) => {
    e.stopPropagation();
    setHour(null);
    setMinute(null);
    onChange("");
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setMode("hour"); }}
        className="w-full flex items-center gap-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-xs text-left focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#94a3b8] transition-all hover:bg-white"
      >
        <Clock className="w-3 h-3 text-[#94a3b8] flex-shrink-0" />
        <span className={displayValue ? "text-[#1e293b] font-semibold" : "text-[#cbd5e1]"}>
          {displayValue || placeholder}
        </span>
        {displayValue && (
          <span
            onClick={handleClear}
            className="ml-auto text-[#94a3b8] hover:text-red-400 cursor-pointer leading-none"
          >✕</span>
        )}
      </button>

      {/* Popup */}
      {open && (
        <div className="absolute z-50 mt-1.5 bg-white border border-[#e2e8f0] rounded-xl shadow-xl overflow-hidden"
          style={{ minWidth: 240 }}>
          {/* Mode tabs */}
          <div className="flex items-center justify-center gap-1 px-4 pt-3 pb-1">
            <button
              type="button"
              onClick={() => setMode("hour")}
              className={`px-4 py-1 rounded-md text-xs font-bold transition-all ${mode === "hour" ? "bg-[#334155] text-white" : "text-[#64748b] hover:bg-[#f1f5f9]"}`}
            >
              {hour !== null ? String(hour).padStart(2, "0") : "HH"}
            </button>
            <span className="text-[#94a3b8] font-bold text-sm">:</span>
            <button
              type="button"
              onClick={() => setMode("minute")}
              className={`px-4 py-1 rounded-md text-xs font-bold transition-all ${mode === "minute" ? "bg-[#334155] text-white" : "text-[#64748b] hover:bg-[#f1f5f9]"}`}
            >
              {minute !== null ? String(minute).padStart(2, "0") : "MM"}
            </button>
          </div>

          <div className="flex justify-center px-3 pb-3">
            {mode === "hour" ? (
              <ClockFace
                mode="hour"
                value={hour ?? 12}
                onChange={handleHourSelect}
              />
            ) : (
              <ClockFace
                mode="minute"
                value={minute ?? 0}
                onChange={handleMinuteSelect}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-[#e2e8f0] bg-[#f8fafc]">
            <span className="text-[10px] text-[#94a3b8]">
              {mode === "hour" ? "Select hour" : "Select minute"}
            </span>
            <button
              type="button"
              onClick={() => {
                if (hour !== null && minute !== null) {
                  onChange(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
                }
                setOpen(false);
                setMode("hour");
              }}
              className="px-3 py-1 rounded-md text-[10px] font-bold bg-[#334155] text-white hover:bg-[#1e293b] transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}