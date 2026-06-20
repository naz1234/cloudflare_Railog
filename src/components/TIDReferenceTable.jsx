import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

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
  { tid: 221, time: "15:57" },
  { tid: 222, time: "16:03" },
  { tid: 223, time: "16:09" },
  { tid: 224, time: "16:15" },
  { tid: 225, time: "16:21" },
  { tid: 226, time: "16:27" },
  { tid: 227, time: "16:33" },
  { tid: 228, time: "16:39" },
  { tid: 229, time: "16:45" },
  { tid: 230, time: "16:51" },
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

function normalizeTimetableTypeKey(value = "weekday") {
  const text = String(value || "weekday").trim().toLowerCase();
  if (/fri/.test(text)) return "friday";
  if (/sat/.test(text)) return "saturday";
  if (/ph|public|holiday/.test(text)) return "ph";
  return "weekday";
}

function getTimetableTypeLabel(value = "weekday") {
  const key = normalizeTimetableTypeKey(value);
  if (key === "friday") return "Friday";
  if (key === "saturday") return "Saturday";
  if (key === "ph") return "PH";
  return "Weekday";
}

function getParsedTimetable(activeTimetable = null) {
  return activeTimetable?.parsedData || activeTimetable?.data || null;
}

function normalizeAssistRemark(value = "") {
  const text = String(value || "").trim();
  const compact = text.replace(/\s+/g, " ");

  if (/^early\s*rem$/i.test(compact)) return "Early Rem";
  if (/^late\s*rem$/i.test(compact)) return "Late Rem";
  if (/^ed\s*\(\s*7\s*pm\s*\)$/i.test(compact)) return "ED (7pm)";
  if (/^ed$/i.test(compact)) return "ED";

  return "";
}

function buildFallbackRemarkMap(typeKey = "weekday", depot = "west") {
  const depotKey = depot === "east" ? "east" : "west";
  const rows = SCHEDULES[typeKey]?.[depotKey] || SCHEDULES.weekday?.[depotKey] || [];

  return Object.fromEntries(
    rows
      .filter((row) => row?.tid && row?.remark)
      .map((row) => [String(row.tid), normalizeAssistRemark(row.remark) || row.remark])
  );
}

// Shared lookup so the insertion card and this reference table always use
// the same built-in TID assistance remark mapping.
export function getTidReferenceRemark(timetableType = "weekday", depot = "west", tid = "") {
  const typeKey = normalizeTimetableTypeKey(timetableType);
  if (typeKey !== "weekday") return "";

  const depotKey = depot === "east" ? "east" : "west";
  const oppositeDepotKey = depotKey === "west" ? "east" : "west";
  const cleanTid = Number(String(tid || "").replace(/\D/g, ""));
  if (!cleanTid) return "";

  const tidKey = String(cleanTid);
  return (
    buildFallbackRemarkMap(typeKey, depotKey)[tidKey] ||
    buildFallbackRemarkMap(typeKey, oppositeDepotKey)[tidKey] ||
    ""
  );
}

function buildDepotRowsFromUploadedTimetable(activeTimetable = null, depot = "west", typeKey = "weekday") {
  const parsed = getParsedTimetable(activeTimetable);
  const depotKey = depot === "east" ? "east" : "west";
  const entries = Array.isArray(parsed?.insertion?.[depotKey]?.entries)
    ? parsed.insertion[depotKey].entries
    : [];
  const fallbackRemarkMap = buildFallbackRemarkMap(typeKey, depotKey);

  return entries
    .map((entry) => {
      const tidText = String(entry?.tid ?? "").replace(/\D/g, "");
      const time = String(entry?.time ?? "").trim().replace(/\s*hrs\.?$/i, "");
      if (!tidText || !/^\d{1,2}:\d{2}$/.test(time)) return null;

      const remark = normalizeAssistRemark(entry?.assistRemark || entry?.displayRemark || entry?.remark) || fallbackRemarkMap[tidText] || "";
      return { tid: Number(tidText), remark, time };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aMinutes = toMinutes(a.time);
      const bMinutes = toMinutes(b.time);
      if (aMinutes !== bMinutes) return aMinutes - bMinutes;
      return Number(a.tid || 0) - Number(b.tid || 0);
    });
}

function buildSchedules(activeTimetable = null, activeTimetableType = "weekday") {
  const typeKey = normalizeTimetableTypeKey(activeTimetableType || getParsedTimetable(activeTimetable)?.timetableType || "weekday");
  const dynamicWest = buildDepotRowsFromUploadedTimetable(activeTimetable, "west", typeKey);
  const dynamicEast = buildDepotRowsFromUploadedTimetable(activeTimetable, "east", typeKey);
  const nextSchedules = { ...SCHEDULES };

  if (typeKey === "ph" && !nextSchedules.ph) {
    nextSchedules.ph = { label: "PH", west: [], east: [] };
  }

  if (dynamicWest.length || dynamicEast.length) {
    const fallback = nextSchedules[typeKey] || { label: getTimetableTypeLabel(typeKey), west: [], east: [] };
    nextSchedules[typeKey] = {
      ...fallback,
      label: getTimetableTypeLabel(typeKey),
      west: dynamicWest.length ? dynamicWest : fallback.west,
      east: dynamicEast.length ? dynamicEast : fallback.east,
      source: "uploaded",
    };
  }

  return nextSchedules;
}

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
  const normalized = normalizeAssistRemark(remark) || String(remark || "").trim();

  if (normalized === "Early Rem") {
    return {
      backgroundColor: "rgba(34, 197, 94, 0.17)",
      color: "#86efac",
      borderColor: "rgba(134, 239, 172, 0.36)",
      rowBackground: "linear-gradient(90deg, rgba(34, 197, 94, 0.20) 0%, rgba(34, 197, 94, 0.07) 100%)",
      sideColor: "#22c55e",
    };
  }

  if (normalized === "Late Rem") {
    return {
      backgroundColor: "rgba(250, 204, 21, 0.17)",
      color: "#fde68a",
      borderColor: "rgba(250, 204, 21, 0.40)",
      rowBackground: "linear-gradient(90deg, rgba(250, 204, 21, 0.20) 0%, rgba(250, 204, 21, 0.07) 100%)",
      sideColor: "#facc15",
    };
  }

  if (normalized === "ED (7pm)") {
    return {
      backgroundColor: "rgba(244, 114, 182, 0.18)",
      color: "#f9a8d4",
      borderColor: "rgba(251, 207, 232, 0.38)",
      rowBackground: "linear-gradient(90deg, rgba(244, 114, 182, 0.20) 0%, rgba(244, 114, 182, 0.07) 100%)",
      sideColor: "#f472b6",
    };
  }

  if (normalized === "ED") {
    return {
      backgroundColor: "rgba(248, 113, 113, 0.18)",
      color: "#fecaca",
      borderColor: "rgba(252, 165, 165, 0.38)",
      rowBackground: "linear-gradient(90deg, rgba(248, 113, 113, 0.20) 0%, rgba(248, 113, 113, 0.07) 100%)",
      sideColor: "#f87171",
    };
  }

  return {
    backgroundColor: "rgba(148, 163, 184, 0.10)",
    color: "#94a3b8",
    borderColor: "rgba(148, 163, 184, 0.20)",
    rowBackground: "",
    sideColor: "transparent",
  };
}

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

const TID_SOUND_ENABLED_KEY = "insertionTidSoundEnabled_v1";
const TID_SOUND_SETTINGS_KEY = "insertionTidSoundSettings_v2";
const DEFAULT_TID_SOUND_SETTINGS = { east: false, west: false };
const DEPOT_SOUND_CONFIG = {
  east: { label: "ED", frequency: 660, color: "#d8b4fe", readyColor: "#f0abfc", glow: "rgba(168, 85, 247, 0.24)" },
  west: { label: "WD", frequency: 880, color: "#67e8f9", readyColor: "#7dd3fc", glow: "rgba(14, 165, 233, 0.24)" },
};

function formatClockTime(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getLocalDateKey(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadTidSoundSettings() {
  try {
    const saved = localStorage.getItem(TID_SOUND_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        east: Boolean(parsed?.east),
        west: Boolean(parsed?.west),
      };
    }

    // Migrate old single ON/OFF sound setting. If user had sound ON before,
    // keep both depot sounds ON instead of silently disabling it.
    if (localStorage.getItem(TID_SOUND_ENABLED_KEY) === "true") {
      return { east: true, west: true };
    }
  } catch {}

  return { ...DEFAULT_TID_SOUND_SETTINGS };
}

function saveTidSoundSettings(value) {
  try {
    localStorage.setItem(
      TID_SOUND_SETTINGS_KEY,
      JSON.stringify({ east: Boolean(value?.east), west: Boolean(value?.west) })
    );
  } catch {}
}

function isAnyTidSoundEnabled(soundSettings = DEFAULT_TID_SOUND_SETTINGS) {
  return Boolean(soundSettings?.east || soundSettings?.west);
}

function buildDueTidList(activeSchedule = {}, currentTime = "", soundSettings = DEFAULT_TID_SOUND_SETTINGS) {
  const entries = [];

  [
    ["east", "East", activeSchedule?.east],
    ["west", "West", activeSchedule?.west],
  ].forEach(([depotKey, depotLabel, rows]) => {
    if (!soundSettings?.[depotKey]) return;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (row?.time === currentTime) entries.push({ depot: depotKey, text: `${depotLabel} TID ${row.tid}` });
    });
  });

  return entries;
}

function playTidMatchBeep(audioContextRef, depotType = "west", startDelay = 0) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  const context = audioContextRef.current || new AudioContextClass();
  audioContextRef.current = context;

  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }

  const soundConfig = DEPOT_SOUND_CONFIG[depotType] || DEPOT_SOUND_CONFIG.west;
  const baseTime = context.currentTime + 0.03 + startDelay;
  [0, 0.24, 0.48].forEach((offset) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(soundConfig.frequency, baseTime + offset);
    gain.gain.setValueAtTime(0.0001, baseTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.24, baseTime + offset + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, baseTime + offset + 0.16);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(baseTime + offset);
    oscillator.stop(baseTime + offset + 0.18);
  });

  return true;
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

function HeaderCard({ now, schedules, scheduleKey, setScheduleKey, todayScheduleKey, isScheduleOverride, soundSettings = DEFAULT_TID_SOUND_SETTINGS, soundReady = false, onToggleDepotSound }) {
  const currentTimeStr = formatClockTime(now);

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
        {Object.entries(schedules).map(([key, schedule]) => {
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

      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 2,
          borderRadius: 10,
          background: "rgba(6, 24, 39, 0.60)",
          border: "1px solid rgba(125, 184, 224, 0.14)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {["east", "west"].map((depotKey) => {
          const config = DEPOT_SOUND_CONFIG[depotKey];
          const enabled = Boolean(soundSettings?.[depotKey]);

          return (
            <button
              key={depotKey}
              type="button"
              onClick={() => onToggleDepotSound(depotKey)}
              style={{
                border: "1px solid",
                borderColor: enabled
                  ? soundReady
                    ? `${config.readyColor}99`
                    : "rgba(251, 191, 36, 0.62)"
                  : "rgba(125, 184, 224, 0.20)",
                background: enabled
                  ? soundReady
                    ? `linear-gradient(135deg, ${config.glow}, rgba(6, 24, 39, 0.76))`
                    : "linear-gradient(135deg, rgba(245, 158, 11, 0.28), rgba(120, 53, 15, 0.24))"
                  : "linear-gradient(180deg, rgba(10, 30, 46, 0.95), rgba(7, 24, 40, 0.95))",
                color: enabled ? (soundReady ? config.readyColor : "#fde68a") : "#9fb8cb",
                fontSize: 9,
                fontWeight: 400,
                padding: "6px 8px",
                borderRadius: 8,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: enabled && soundReady ? `0 0 16px ${config.glow}` : "none",
                transition: "all 160ms ease",
              }}
              title={enabled ? `Click to turn off ${config.label} time sound` : `Click to enable ${config.label} time sound`}
            >
              {config.label} Sound {enabled ? "ON" : "OFF"}
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
                : remark
                  ? remarkStyle.rowBackground
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
                      borderLeft: isActive ? `3px solid ${accent.accent}` : `3px solid ${remark ? remarkStyle.sideColor : "transparent"}`,
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

export default function TIDReferenceTable({ withinSchedule = true, activeTimetable = null, activeTimetableType = "weekday" }) {
  const [now, setNow] = useState(new Date());
  const [soundSettings, setSoundSettings] = useState(loadTidSoundSettings);
  const [soundReady, setSoundReady] = useState(false);
  const audioContextRef = useRef(null);
  const lastSoundKeyRef = useRef("");
  const selectedScheduleKey = normalizeTimetableTypeKey(activeTimetableType);
  const schedules = useMemo(
    () => buildSchedules(activeTimetable, selectedScheduleKey),
    [activeTimetable, selectedScheduleKey]
  );
  const [scheduleKey, setScheduleKey] = useState(() => selectedScheduleKey || getDefaultScheduleKey());
  const activeSchedule = schedules[scheduleKey] || schedules[selectedScheduleKey] || schedules[getDefaultScheduleKey()] || schedules.weekday;
  const todayScheduleKey = getTodayScheduleKey(now);
  const todaySchedule = schedules[todayScheduleKey] || SCHEDULES[todayScheduleKey] || schedules.weekday;
  const isScheduleOverride = scheduleKey !== todayScheduleKey;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isWeekday = scheduleKey === "weekday";

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    saveTidSoundSettings(soundSettings);
  }, [soundSettings]);

  const handleToggleDepotSound = useCallback(async (depotType) => {
    const depotKey = depotType === "east" ? "east" : "west";

    if (soundSettings?.[depotKey]) {
      setSoundSettings((prev) => ({ ...DEFAULT_TID_SOUND_SETTINGS, ...prev, [depotKey]: false }));
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        alert("Sound is not supported in this browser.");
        return;
      }

      const context = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = context;
      if (context.state === "suspended") await context.resume();

      setSoundSettings((prev) => ({ ...DEFAULT_TID_SOUND_SETTINGS, ...prev, [depotKey]: true }));
      setSoundReady(context.state === "running");
      playTidMatchBeep(audioContextRef, depotKey);
    } catch (error) {
      console.error("Unable to enable depot TID sound:", error);
      alert("Unable to enable sound. Please click the page once and try again.");
    }
  }, [soundSettings]);

  useEffect(() => {
    if (!isAnyTidSoundEnabled(soundSettings) || !activeSchedule) return;

    const currentTime = formatClockTime(now);
    const dueTidList = buildDueTidList(activeSchedule, currentTime, soundSettings);
    if (!dueTidList.length) return;

    const soundKey = `${getLocalDateKey(now)}|${scheduleKey}|${currentTime}|${dueTidList.map((item) => item.text).join(",")}`;
    if (lastSoundKeyRef.current === soundKey) return;
    lastSoundKeyRef.current = soundKey;

    let played = false;
    [...new Set(dueTidList.map((item) => item.depot))].forEach((depotKey, index) => {
      if (playTidMatchBeep(audioContextRef, depotKey, index * 0.82)) played = true;
    });

    if (played) {
      const context = audioContextRef.current;
      setSoundReady(Boolean(context && context.state === "running"));
    }
  }, [now, soundSettings, activeSchedule, scheduleKey]);

  useEffect(() => {
    if (schedules[selectedScheduleKey]) setScheduleKey(selectedScheduleKey);
  }, [selectedScheduleKey, schedules]);

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
        schedules={schedules}
        scheduleKey={scheduleKey}
        setScheduleKey={setScheduleKey}
        todayScheduleKey={todayScheduleKey}
        isScheduleOverride={isScheduleOverride}
        soundSettings={soundSettings}
        soundReady={soundReady}
        onToggleDepotSound={handleToggleDepotSound}
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
