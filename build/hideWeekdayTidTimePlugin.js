// Hide the visible TIME row only when the page's active timetable is Weekday.
function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`[hide-weekday-tid-time] Unable to update ${label}`);
  }
  return next;
}

export default function hideWeekdayTidTimePlugin() {
  return {
    name: 'railog-hide-weekday-tid-time',
    enforce: 'pre',
    transform(source, id) {
      const normalizedId = id.replace(/\\/g, '/');

      if (!normalizedId.endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      // Use the same load/save path as the top active-timetable selector. This avoids
      // child reference tables, render order, and component-layout assumptions.
      let code = replaceRequired(
        source,
        /function loadActiveTimetableType\(\) \{/,
        `function publishInsertionTidSchedule(type) {
  const normalizedType = normalizeTimetableType(type);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.insertionTidSchedule = normalizedType;
  }
  return normalizedType;
}

function loadActiveTimetableType() {`,
        'active timetable publisher helper'
      );

      code = replaceRequired(
        code,
        /return storedType === "ph" \? "ph" : getCurrentDayTimetableType\(\);/,
        'return publishInsertionTidSchedule(storedType === "ph" ? "ph" : getCurrentDayTimetableType());',
        'loaded active timetable marker'
      );

      code = replaceRequired(
        code,
        /(\} catch \{\r?\n\s*)return getCurrentDayTimetableType\(\);/,
        '$1return publishInsertionTidSchedule(getCurrentDayTimetableType());',
        'fallback active timetable marker'
      );

      code = replaceRequired(
        code,
        /function saveActiveTimetableType\(type\) \{\r?\n  try \{ localStorage\.setItem\(ACTIVE_TIMETABLE_TYPE_KEY, normalizeTimetableType\(type\)\); \} catch \{\}\r?\n\}/,
        `function saveActiveTimetableType(type) {
  const normalizedType = publishInsertionTidSchedule(type);
  try { localStorage.setItem(ACTIVE_TIMETABLE_TYPE_KEY, normalizedType); } catch {}
}`,
        'saved active timetable marker'
      );

      let timePanelMatches = 0;
      code = code.replace(
        /<div className="grid w-full grid-cols-\[34px_minmax\(0,1fr\)\] items-center gap-x-1 gap-y-0\.5">/g,
        () => {
          timePanelMatches += 1;
          return `<div
                        className="grid w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-x-1 gap-y-0.5"
                        data-weekday-active-tid-time={
                          (
                            (Number(insertedTid) >= 101 && Number(insertedTid) <= 120) ||
                            (Number(insertedTid) >= 201 && Number(insertedTid) <= 220)
                          )
                            ? "true"
                            : undefined
                        }
                      >`;
        }
      );

      if (timePanelMatches === 0) {
        throw new Error('[hide-weekday-tid-time] Unable to locate insertion TID time panels in DepotStabling.jsx');
      }

      return { code, map: null };
    },
  };
}
