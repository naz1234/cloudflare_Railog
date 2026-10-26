// Keep the original storage key so existing saved HDW entries remain available.
export const HDW40_PRESET_LABEL = "HDW 40";
export const HDW_DISPLAY_LABEL = "HDW";
export const HDW_TOOLTIP = "Headway operation: enter removal time and choose West or East Depot for each train";
export const HDW40_ROW_COUNT = 40;
const DEPOTS = [{ depot: "west", label: "West Depot" }, { depot: "east", label: "East Depot" }];
const hasContent = (row) => [row.trainId, row.timing, row.remark].some((value) => String(value || "").trim());

export function normalizeHdw40Rows(rows = [], depot = "west") {
  if (depot !== "west") return [];
  const source = Array.isArray(rows) ? rows : [];
  const normalized = Array.from({ length: Math.max(HDW40_ROW_COUNT, source.length) }, (_, index) => ({
    trainId: source[index]?.trainId || "",
    tid: "",
    timing: source[index]?.timing || "",
    remark: source[index]?.remark || "",
    // Former Off-Peak rows need an explicit depot choice, not an inferred removal.
    hdwDepot: DEPOTS.some((item) => item.depot === source[index]?.hdwDepot) ? source[index].hdwDepot : "",
  }));
  const result = normalized.slice(0, HDW40_ROW_COUNT);
  // Retire old +/- blank slots without discarding saved train entries. In the
  // exceptional case of >40 populated legacy rows, retain extras for review.
  for (const row of normalized.slice(HDW40_ROW_COUNT).filter(hasContent)) {
    const emptyIndex = result.findIndex((item) => !hasContent(item));
    if (emptyIndex >= 0) result[emptyIndex] = row;
    else result.push(row);
  }
  return result;
}

export function getHdw40RowGroup(index, rows = []) {
  const row = normalizeHdw40Rows(rows)[index];
  return row ? DEPOTS.find((item) => item.depot === row.hdwDepot) || { depot: "", label: "Choose depot" } : undefined;
}

export function getHdw40GroupRows(rows = [], depot = "west") {
  return DEPOTS.some((item) => item.depot === depot) ? normalizeHdw40Rows(rows).filter((row) => row.hdwDepot === depot) : [];
}

export function clearHdwRows(rows = []) {
  return normalizeHdw40Rows(normalizeHdw40Rows(rows).map((row) => ({ trainId: "", tid: "", timing: "", remark: "", hdwDepot: row.hdwDepot })));
}

export function getHdwCurrentTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
