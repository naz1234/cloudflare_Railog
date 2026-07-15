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

      // The top timetable selector is the operational source of truth. Publish that
      // page state directly so Friday/Saturday overrides do not depend on child tables.
      let code = replaceRequired(
        source,
        /(  const \[activeTimetableType,\s*setActiveTimetableType\]\s*=\s*useState\([\s\S]*?\);\r?\n)/,
        `$1
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.insertionTidSchedule = normalizeTimetableType(activeTimetableType);
  }, [activeTimetableType]);
`,
        'active timetable schedule marker in DepotStabling.jsx'
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
