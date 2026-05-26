import React, { useState, useEffect } from "react";

const WEEKDAY_EAST_ROWS = [
  { tid: 201, remark: "Late Rem", time: "05:24" },
  { tid: 202, remark: "ED", time: "05:27" },
  { tid: 203, remark: "Late Rem", time: "05:30" },
  { tid: 204, remark: "ED", time: "05:33" },
  { tid: 205, remark: "Late Rem", time: "05:36" },
  { tid: 206, remark: "ED", time: "05:39" },
  { tid: 207, remark: "ED (7pm)", time: "05:42" },
  { tid: 208, remark: "ED", time: "05:45" },
  { tid: 209, remark: "ED (7pm)", time: "05:48" },
  { tid: 210, remark: "ED", time: "05:51" },
  { tid: 211, remark: "ED (7pm)", time: "05:54" },
  { tid: 212, remark: "Early Rem", time: "05:57" },
  { tid: 213, remark: "Late Rem", time: "06:00" },
  { tid: 214, remark: "Early Rem", time: "06:03" },
  { tid: 215, remark: "Late Rem", time: "06:06" },
  { tid: 216, remark: "Early Rem", time: "06:09" },
  { tid: 217, remark: "Late Rem", time: "06:12" },
  { tid: 218, remark: "Early Rem", time: "06:15" },
  { tid: 219, remark: "Late Rem", time: "06:18" },
  { tid: 220, remark: "Early Rem", time: "06:21" },
  { tid: 121, time: "15:58" },
  { tid: 122, time: "16:04" },
  { tid: 123, time: "16:10" },
  { tid: 124, time: "16:16" },
  { tid: 125, time: "16:22" },
  { tid: 126, time: "16:28" },
  { tid: 127, time: "16:34" },
  { tid: 128, time: "16:40" },
  { tid: 129, time: "16:46" },
  { tid: 130, time: "16:52" },
];

const WEEKDAY_WEST_ROWS = [
  { tid: 101, remark: "Late Rem", time: "05:25" },
  { tid: 102, remark: "Early Rem", time: "05:28" },
  { tid: 103, remark: "Late Rem", time: "05:31" },
  { tid: 104, remark: "Early Rem", time: "05:34" },
  { tid: 105, remark: "Late Rem", time: "05:37" },
  { tid: 106, remark: "Early Rem", time: "05:40" },
  { tid: 107, remark: "Late Rem", time: "05:43" },
  { tid: 108, remark: "Early Rem", time: "05:46" },
  { tid: 109, remark: "Late Rem", time: "05:49" },
  { tid: 110, remark: "Early Rem", time: "05:52" },
  { tid: 111, remark: "Late Rem", time: "05:55" },
  { tid: 112, remark: "ED", time: "05:58" },
  { tid: 113, remark: "Late Rem", time: "06:01" },
  { tid: 114, remark: "ED", time: "06:04" },
  { tid: 115, remark: "Late Rem", time: "06:07" },
  { tid: 116, remark: "ED", time: "06:10" },
  { tid: 117, remark: "Late Rem", time: "06:13" },
  { tid: 118, remark: "ED", time: "06:16" },
  { tid: 119, remark: "Late Rem", time: "06:19" },
  { tid: 120, remark: "ED", time: "06:22" },
  { tid: 121, time: "15:58" },
  { tid: 122, time: "16:04" },
  { tid: 123, time: "16:10" },
  { tid: 124, time: "16:16" },
  { tid: 125, time: "16:22" },
  { tid: 126, time: "16:28" },
  { tid: 127, time: "16:34" },
  { tid: 128, time: "16:40" },
  { tid: 129, time: "16:46" },
  { tid: 130, time: "16:52" },
];

const SATURDAY_WEST_ROWS = [
  { tid: 101, time: "05:25" },
  { tid: 102, time: "05:31" },
  { tid: 103, time: "05:37" },
  { tid: 104, time: "05:43" },
  { tid: 105, time: "05:49" },
  { tid: 106, time: "05:55" },
  { tid: 107, time: "06:01" },
  { tid: 108, time: "06:07" },
  { tid: 109, time: "06:13" },
  { tid: 110, time: "06:19" },
];

const SATURDAY_EAST_ROWS = [
  { tid: 221, time: "05:24" },
  { tid: 222, time: "05:30" },
  { tid: 223, time: "05:36" },
  { tid: 224, time: "05:42" },
  { tid: 225, time: "05:48" },
  { tid: 226, time: "05:54" },
  { tid: 227, time: "06:00" },
  { tid: 228, time: "06:06" },
  { tid: 229, time: "06:12" },
  { tid: 230, time: "06:18" },
];

const FRIDAY_WEST_ROWS = [
  { tid: 101, time: "09:55" },
  { tid: 102, time: "10:01" },
  { tid: 103, time: "10:07" },
  { tid: 104, time: "10:13" },
  { tid: 105, time: "10:19" },
  { tid: 106, time: "10:25" },
  { tid: 107, time: "10:31" },
  { tid: 108, time: "10:37" },
  { tid: 109, time: "10:43" },
  { tid: 110, time: "10:49" },
];

const FRIDAY_EAST_ROWS = [
  { tid: 201, time: "09:54" },
  { tid: 202, time: "10:00" },
  { tid: 203, time: "10:06" },
  { tid: 204, time: "10:12" },
  { tid: 205, time: "10:18" },
  { tid: 206, time: "10:24" },
  { tid: 207, time: "10:30" },
  { tid: 208, time: "10:36" },
  { tid: 209, time: "10:42" },
  { tid: 210, time: "10:48" },
];

const SCHEDULES = {
  weekday: {
    label: "Weekday",
    west: WEEKDAY_WEST_ROWS,
    east: WEEKDAY_EAST_ROWS,
  },
  saturday: {
    label: "Saturday",
    west: SATURDAY_WEST_ROWS,
    east: SATURDAY_EAST_ROWS,
  },
  friday: {
    label: "Friday",
    west: FRIDAY_WEST_ROWS,
    east: FRIDAY_EAST_ROWS,
  },
};

const DEPOT_ACCENTS = {
  west: {
    accent: "#38bdf8",
    accentStrong: "#2563eb",
    accentSoft: "rgba(56, 189, 248, 0.14)",
    border: "rgba(56, 189, 248, 0.28)",
    glow: "rgba(56, 189, 248, 0.24)",
    text: "#93c5fd",
    headerGradient: "linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(37, 99, 235, 0.18))",
    rowGradient: "linear-gradient(90deg, rgba(14, 165, 233, 0.28) 0%, rgba(37, 99, 235, 0.14) 100%)",
  },
  east: {
    accent: "#c084fc",
    accentStrong: "#7c3aed",
    accentSoft: "rgba(192, 132, 252, 0.14)",
    border: "rgba(192, 132, 252, 0.28)",
    glow: "rgba(192, 132, 252, 0.24)",
    text: "#d8b4fe",
    headerGradient: "linear-gradient(135deg, rgba(192, 132, 252, 0.28), rgba(124, 58, 237, 0.18))",
    rowGradient: "linear-gradient(90deg, rgba(192, 132, 252, 0.28) 0%, rgba(124, 58, 237, 0.14) 100%)",
  },
};

function getTodayScheduleKey(date = new Date()) {
  const day = date.getDay();

  if (day === 5) return "friday";
  if (day === 6) return "saturday";

  return "weekday";
}

function getDefaultScheduleKey() {
  return getTodayScheduleKey(new Date());
}

function getRemarkStyle(remark) {
  if (remark === "Early Rem") return { backgroundColor: "rgba(34, 197, 94, 0.12)", color: "#4ade80", borderColor: "rgba(74, 222, 128, 0.28)" };
  if (remark === "Late Rem") return { backgroundColor: "rgba(245, 158, 11, 0.13)", color: "#fbbf24", borderColor: "rgba(251, 191, 36, 0.28)" };
  if (remark?.startsWith("ED")) return { backgroundColor: "rgba(248, 113, 113, 0.12)", color: "#f87171", borderColor: "rgba(248, 113, 113, 0.26)" };
  return { backgroundColor: "rgba(148, 163, 184, 0.10)", color: "#94a3b8", borderColor: "rgba(148, 163, 184, 0.20)" };
}

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function getNextIndex(rows, nowMinutes) {
  return rows.findIndex((r) => toMinutes(r.time) >= nowMinutes);
}

function getActiveIndex(rows, nowMinutes) {
  const nextIndex = getNextIndex(rows, nowMinutes);
  return nextIndex === -1 ? rows.length - 1 : nextIndex;
}

function ClockIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M12 7v5l3.2 2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarningTriangleIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l9.4 16.3A1.2 1.2 0 0 1 20.4 21H3.6a1.2 1.2 0 0 1-1-1.7L12 3z" fill="rgba(248, 113, 113, 0.22)" stroke={color} strokeWidth="2" />
      <path d="M12 8v5" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="1.2" fill={color} />
    </svg>
  );
}

function TrainIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3" width="14" height="14" rx="3" stroke={color} strokeWidth="2" />
      <path d="M8 8h8M8 12h8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M9 17l-2 3M15 17l2 3M8 20h8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HashIcon({ size = 13, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 9h14M4 15h14M10 4L8 20M16 4l-2 16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TimerIcon({ size = 13, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="13" r="7" stroke={color} strokeWidth="2" />
      <path d="M12 13l3-2M9 2h6M12 2v3" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function formatDate(now) {
  return now.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatDay(now) {
  return now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
}

function HeaderCard({ now, scheduleKey, setScheduleKey, todayScheduleKey, isScheduleOverride }) {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const currentTimeStr = `${hh}:${mm}`;

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        borderRadius: 14,
        padding: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        flexWrap: "wrap",
        background: "linear-gradient(135deg, rgba(12, 46, 74, 0.88), rgba(7, 27, 44, 0.78))",
        border: "1px solid rgba(125, 184, 224, 0.18)",
        boxShadow: "0 10px 28px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255,255,255,0.08)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#7dd3fc",
            background: "linear-gradient(145deg, rgba(14,165,233,0.22), rgba(37,99,235,0.12))",
            border: "1px solid rgba(125, 211, 252, 0.28)",
            boxShadow: "0 0 22px rgba(14,165,233,0.12)",
            flexShrink: 0,
          }}
        >
          <ClockIcon size={17} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: "#7eb8e0",
              fontSize: 8,
              lineHeight: "10px",
              fontWeight: 400,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Today
          </div>
          <div
            style={{
              color: "#e0f2fe",
              fontSize: 13,
              lineHeight: "16px",
              fontWeight: 400,
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
            }}
          >
            {formatDay(now)}
          </div>
          <div
            style={{
              color: "#8aa6bd",
              fontSize: 9,
              lineHeight: "11px",
              fontWeight: 400,
              letterSpacing: "0.03em",
              whiteSpace: "nowrap",
            }}
          >
            {formatDate(now)}
          </div>
        </div>
      </div>

      <div
        style={{
          color: "#ffffff",
          fontSize: 22,
          lineHeight: "25px",
          fontWeight: 400,
          letterSpacing: "0.04em",
          fontVariantNumeric: "tabular-nums",
          textShadow: "0 0 18px rgba(125, 211, 252, 0.18)",
        }}
      >
        {currentTimeStr}
      </div>

      <div
        style={{
          display: "flex",
          gap: 3,
          padding: 2,
          borderRadius: 10,
          background: "rgba(6, 24, 39, 0.72)",
          border: "1px solid rgba(125, 184, 224, 0.16)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {Object.entries(SCHEDULES).map(([key, schedule]) => {
          const isActive = key === scheduleKey;
          const isWrongActiveTab = isActive && isScheduleOverride && key !== todayScheduleKey;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setScheduleKey(key)}
              style={{
                position: "relative",
                border: "1px solid",
                borderColor: isWrongActiveTab
                  ? "rgba(251, 146, 60, 0.95)"
                  : isActive
                    ? "rgba(125, 211, 252, 0.70)"
                    : "rgba(125, 184, 224, 0.20)",
                background: isWrongActiveTab
                  ? "linear-gradient(135deg, rgba(220, 38, 38, 0.92) 0%, rgba(245, 158, 11, 0.88) 100%)"
                  : isActive
                    ? "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)"
                    : "linear-gradient(180deg, rgba(10, 30, 46, 0.95), rgba(7, 24, 40, 0.95))",
                color: isActive ? "#ffffff" : "#9fb8cb",
                fontSize: 9,
                fontWeight: 400,
                padding: isWrongActiveTab ? "5px 7px 10px" : "5px 6px",
                borderRadius: 8,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                boxShadow: isWrongActiveTab
                  ? "0 0 0 2px rgba(251, 146, 60, 0.20), 0 8px 22px rgba(248, 113, 113, 0.28)"
                  : isActive
                    ? "0 8px 22px rgba(14, 165, 233, 0.28)"
                    : "none",
                transition: "all 160ms ease",
              }}
            >
              <span style={{ display: "block" }}>{schedule.label}</span>
              {isWrongActiveTab && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: -8,
                    transform: "translateX(-50%)",
                    padding: "1px 5px",
                    borderRadius: 999,
                    fontSize: 7,
                    lineHeight: "9px",
                    fontWeight: 400,
                    letterSpacing: "0.04em",
                    color: "#7c2d12",
                    background: "linear-gradient(180deg, #fde68a, #f59e0b)",
                    border: "1px solid rgba(251, 191, 36, 0.88)",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.24)",
                    whiteSpace: "nowrap",
                  }}
                >
                  OVERRIDE
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleWarningBanner({ selectedLabel, todayLabel, onSwitchToToday }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 13,
        background: "linear-gradient(135deg, rgba(127, 29, 29, 0.92), rgba(67, 20, 7, 0.88))",
        border: "1px solid rgba(248, 113, 113, 0.92)",
        boxShadow: "0 12px 30px rgba(127, 29, 29, 0.28), inset 0 1px 0 rgba(255,255,255,0.10)",
        color: "#fff7ed",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "#fb7185",
            background: "rgba(248, 113, 113, 0.13)",
            border: "1px solid rgba(248, 113, 113, 0.32)",
          }}
        >
          <WarningTriangleIcon size={20} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              lineHeight: "15px",
              fontWeight: 400,
              letterSpacing: "0.02em",
            }}
          >
            ⚠ Viewing <span style={{ color: "#fbbf24" }}>{selectedLabel.toUpperCase()}</span> schedule while today is <span style={{ color: "#fbbf24" }}>{todayLabel.toUpperCase()}</span>
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 9,
              lineHeight: "12px",
              fontWeight: 400,
              color: "#fed7aa",
            }}
          >
            Please switch to today’s schedule to avoid using the wrong TID reference.
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSwitchToToday}
        style={{
          flexShrink: 0,
          border: "1px solid rgba(253, 186, 116, 0.80)",
          background: "linear-gradient(135deg, rgba(220, 38, 38, 0.88), rgba(180, 83, 9, 0.88))",
          color: "#ffffff",
          fontSize: 10,
          lineHeight: "13px",
          fontWeight: 400,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          padding: "7px 9px",
          borderRadius: 9,
          cursor: "pointer",
          boxShadow: "0 8px 18px rgba(127, 29, 29, 0.30)",
          whiteSpace: "nowrap",
        }}
      >
        Switch to {todayLabel.toUpperCase()} ↔
      </button>
    </div>
  );
}

function DepotCard({ depotType, title, dayLabel, rows, nowMinutes, withinSchedule, isScheduleOverride }) {
  const accent = DEPOT_ACCENTS[depotType];
  const activeIndex = getActiveIndex(rows, nowMinutes);
  const isWeekday = dayLabel === "Weekday";
  const displayDayLabel = isScheduleOverride ? `${dayLabel} Override` : dayLabel;

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        borderRadius: 14,
        overflow: "hidden",
        background: "linear-gradient(180deg, rgba(7, 27, 44, 0.92), rgba(6, 24, 39, 0.98))",
        border: `1px solid ${accent.border}`,
        boxShadow: `0 10px 28px rgba(0,0,0,0.26), 0 0 18px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,0.07)`,
        backdropFilter: "blur(18px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 9px 7px",
          background: accent.headerGradient,
          borderBottom: `1px solid ${accent.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: accent.accent,
              background: accent.accentSoft,
              border: `1px solid ${accent.border}`,
              boxShadow: `0 0 20px ${accent.glow}`,
              flexShrink: 0,
            }}
          >
            <TrainIcon size={16} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: "#e5f3ff",
                fontSize: 12,
                lineHeight: "15px",
                fontWeight: 400,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>
            <div
              style={{
                color: isScheduleOverride ? "#fbbf24" : accent.text,
                fontSize: 8,
                lineHeight: "12px",
                fontWeight: 400,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                marginTop: 1,
                textShadow: isScheduleOverride ? "0 0 12px rgba(251, 191, 36, 0.20)" : "none",
              }}
            >
              {displayDayLabel}
            </div>
          </div>
        </div>

        <div
          style={{
            color: isScheduleOverride ? "#fbbf24" : accent.accent,
            fontSize: 8,
            fontWeight: 400,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            padding: "4px 6px",
            borderRadius: 999,
            background: isScheduleOverride ? "rgba(245, 158, 11, 0.16)" : accent.accentSoft,
            border: isScheduleOverride ? "1px solid rgba(251, 191, 36, 0.38)" : `1px solid ${accent.border}`,
            whiteSpace: "nowrap",
          }}
        >
          {title.split(" ")[0]} • {displayDayLabel}
        </div>
      </div>

      <div style={{ padding: 7 }}>
        <table
          style={{
            width: "100%",
            tableLayout: "fixed",
            borderCollapse: "separate",
            borderSpacing: 0,
            overflow: "hidden",
            borderRadius: 10,
            border: "1px solid rgba(125, 184, 224, 0.16)",
            background: "rgba(6, 24, 39, 0.74)",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  width: "68%",
                  padding: "6px 5px",
                  textAlign: "center",
                  color: accent.text,
                  fontSize: 10,
                  fontWeight: 400,
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                  background: "linear-gradient(180deg, rgba(12,46,74,0.94), rgba(7,30,51,0.96))",
                  borderBottom: "1px solid rgba(125, 184, 224, 0.16)",
                  borderRight: "1px solid rgba(125, 184, 224, 0.12)",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <HashIcon size={10} /> TID
                </span>
              </th>
              <th
                style={{
                  width: "32%",
                  padding: "6px 5px",
                  textAlign: "center",
                  color: accent.text,
                  fontSize: 10,
                  fontWeight: 400,
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                  background: "linear-gradient(180deg, rgba(12,46,74,0.94), rgba(7,30,51,0.96))",
                  borderBottom: "1px solid rgba(125, 184, 224, 0.16)",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <TimerIcon size={10} /> TIME
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map(({ tid, remark, time }, idx) => {
              const isActive = idx === activeIndex;
              const isPast = withinSchedule && idx < activeIndex;
              const remarkStyle = getRemarkStyle(remark || "");

              const rowBackground = isActive
                ? accent.rowGradient
                : idx % 2 === 0
                  ? "rgba(8, 32, 52, 0.58)"
                  : "rgba(6, 24, 39, 0.68)";

              const commonCellStyle = {
                padding: isWeekday ? "3px 6px" : "1px 6px",
                textAlign: "center",
                background: rowBackground,
                borderBottom: idx === rows.length - 1 ? "none" : "1px solid rgba(125, 184, 224, 0.13)",
                opacity: isPast && !isActive ? 0.46 : 1,
                transition: "all 180ms ease",
              };

              return (
                <tr key={tid}>
                  <td
                    style={{
                      ...commonCellStyle,
                      textAlign: isWeekday ? "left" : "center",
                      borderLeft: isActive ? `3px solid ${accent.accent}` : "3px solid transparent",
                      borderRight: "1px solid rgba(125, 184, 224, 0.10)",
                      boxShadow: isActive ? `inset 10px 0 20px ${accent.glow}` : "none",
                    }}
                  >
                    <div
                      style={{
                        display: isWeekday ? "flex" : "inline-flex",
                        alignItems: "center",
                        justifyContent: isWeekday ? "flex-start" : "center",
                        gap: 5,
                        width: isWeekday ? "100%" : "auto",
                        maxWidth: "100%",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        style={{
                          color: isActive ? "#ffffff" : "#e0f2fe",
                          fontSize: 12,
                          lineHeight: "14px",
                          fontWeight: 400,
                          letterSpacing: "0.05em",
                          fontVariantNumeric: "tabular-nums",
                          minWidth: isWeekday ? 24 : "auto",
                          textAlign: isWeekday ? "right" : "center",
                        }}
                      >
                        {tid}
                      </span>

                      {remark && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "1px 5px",
                            borderRadius: 999,
                            fontSize: isWeekday ? 12 : 7,
                            lineHeight: isWeekday ? "14px" : "9px",
                            fontWeight: 400,
                            letterSpacing: "0.03em",
                            color: remarkStyle.color,
                            background: remarkStyle.backgroundColor,
                            border: `1px solid ${remarkStyle.borderColor}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {remark}
                        </span>
                      )}
                    </div>
                  </td>

                  <td
                    style={{
                      ...commonCellStyle,
                      color: isActive ? accent.accent : "#dbeafe",
                      fontSize: 12,
                      lineHeight: "14px",
                      fontWeight: 400,
                      letterSpacing: "0.06em",
                      fontVariantNumeric: "tabular-nums",
                      textShadow: isActive ? `0 0 14px ${accent.glow}` : "none",
                    }}
                  >
                    {time}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TIDReferenceTable({ withinSchedule = true }) {
  const [now, setNow] = useState(new Date());
  const [scheduleKey, setScheduleKey] = useState(getDefaultScheduleKey);
  const activeSchedule = SCHEDULES[scheduleKey];
  const todayScheduleKey = getTodayScheduleKey(now);
  const todaySchedule = SCHEDULES[todayScheduleKey];
  const isScheduleOverride = scheduleKey !== todayScheduleKey;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isWeekday = scheduleKey === "weekday";

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        width: isWeekday ? "clamp(500px, 48vw, 620px)" : isScheduleOverride ? "clamp(300px, 32vw, 430px)" : "clamp(240px, 25vw, 300px)",
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: 8,
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        gap: 9,
        alignItems: "stretch",
        color: "#dbeafe",
        background: "linear-gradient(180deg, #071b2c 0%, #061827 100%)",
        border: "1px solid rgba(125, 184, 224, 0.14)",
        boxShadow: "0 14px 42px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        backdropFilter: "blur(18px)",
        flexShrink: 0,
      }}
    >
      {isScheduleOverride && (
        <ScheduleWarningBanner
          selectedLabel={activeSchedule.label}
          todayLabel={todaySchedule.label}
          onSwitchToToday={() => setScheduleKey(todayScheduleKey)}
        />
      )}

      <HeaderCard
        now={now}
        scheduleKey={scheduleKey}
        setScheduleKey={setScheduleKey}
        todayScheduleKey={todayScheduleKey}
        isScheduleOverride={isScheduleOverride}
      />

      {isWeekday ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 9,
            alignItems: "start",
          }}
        >
          <DepotCard
            depotType="east"
            title="East Depot"
            dayLabel={activeSchedule.label}
            rows={activeSchedule.east}
            nowMinutes={nowMinutes}
            withinSchedule={withinSchedule}
            isScheduleOverride={isScheduleOverride}
          />

          <DepotCard
            depotType="west"
            title="West Depot"
            dayLabel={activeSchedule.label}
            rows={activeSchedule.west}
            nowMinutes={nowMinutes}
            withinSchedule={withinSchedule}
            isScheduleOverride={isScheduleOverride}
          />
        </div>
      ) : (
        <>
          <DepotCard
            depotType="west"
            title="West Depot"
            dayLabel={activeSchedule.label}
            rows={activeSchedule.west}
            nowMinutes={nowMinutes}
            withinSchedule={withinSchedule}
            isScheduleOverride={isScheduleOverride}
          />

          <DepotCard
            depotType="east"
            title="East Depot"
            dayLabel={activeSchedule.label}
            rows={activeSchedule.east}
            nowMinutes={nowMinutes}
            withinSchedule={withinSchedule}
            isScheduleOverride={isScheduleOverride}
          />
        </>
      )}
    </div>
  );
}
