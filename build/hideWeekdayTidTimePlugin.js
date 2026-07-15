// Keep weekday TID timing hidden while showing timing for the actually selected Friday, Saturday or PH schedule.
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

      if (normalizedId.endsWith('/src/components/TIDReferenceTable.jsx')) {
        const code = replaceRequired(
          source,
          /  const scheduleKey = normalizedControlledScheduleKey \|\| localScheduleKey;\r?\n/,
          `  const scheduleKey = normalizedControlledScheduleKey || localScheduleKey;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.insertionTidSchedule = scheduleKey;
  }, [scheduleKey]);
`,
          'selected insertion schedule marker in TIDReferenceTable.jsx'
        );

        return { code, map: null };
      }

      if (!normalizedId.endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let timePanelMatches = 0;
      const code = source.replace(
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
