// Keep the original storage key so existing saved HDW entries remain available.
export const HDW40_PRESET_LABEL = "HDW 40";
export const HDW_DISPLAY_LABEL = "HDW";
export const HDW_TOOLTIP = "Headway operation: no TIDs; enter times manually";

// Same location groups as the 7pm list, without timetable/TID dependencies.
export const HDW40_GROUPS = [
  { depot: "west", label: "West Depot", start: 0, count: 17 },
  { depot: "east", label: "East Depot", start: 17, count: 3 },
  { depot: "mainline", label: "Off-peak", start: 20, count: 20 },
];

export function normalizeHdw40Rows(rows = [], depot = "west") {
  if (depot !== "west") return [];
  const source = Array.isArray(rows) ? rows : [];
  const hasGroupTags = source.some((row) => HDW40_GROUPS.some((group) => group.depot === row?.hdwDepot));
  // Untagged legacy rows use the old layout once. Tagged rows retain their exact
  // group and count, even when a group has zero rows or a preceding group grows.
  const normalized = Array.from({ length: hasGroupTags ? source.length : Math.max(40, source.length) }, (_, index) => ({
    trainId: source[index]?.trainId || "",
    tid: "",
    timing: source[index]?.timing || "",
    remark: source[index]?.remark || "",
    hdwDepot: HDW40_GROUPS.some((group) => group.depot === source[index]?.hdwDepot)
      ? source[index].hdwDepot
      : (HDW40_GROUPS.find((group) => index >= group.start && index < group.start + group.count)?.depot || "mainline"),
  }));
  return HDW40_GROUPS.flatMap((group) => normalized.filter((row) => row.hdwDepot === group.depot));
}

export function getHdw40Groups(rows = []) {
  const normalized = normalizeHdw40Rows(rows);
  let start = 0;
  return HDW40_GROUPS.map((group) => {
    const count = normalized.filter((row) => row.hdwDepot === group.depot).length;
    const result = { ...group, start, count };
    start += count;
    return result;
  });
}

export function getHdw40RowGroup(index, rows = []) {
  return getHdw40Groups(rows).find((group) => index >= group.start && index < group.start + group.count);
}

export function getHdw40GroupRows(rows = [], depot = "west") {
  return normalizeHdw40Rows(rows).filter((row) => row.hdwDepot === depot);
}

export function resizeHdwDepotRows(rows = [], depot, delta) {
  const normalized = normalizeHdw40Rows(rows);
  if (!["west", "east"].includes(depot) || ![1, -1].includes(delta)) return normalized;
  const group = getHdw40Groups(normalized).find((item) => item.depot === depot);
  if (delta === 1) {
    normalized.splice(group.start + group.count, 0, { trainId: "", tid: "", timing: "", remark: "", hdwDepot: depot });
  } else if (group.count > 0) {
    normalized.splice(group.start + group.count - 1, 1);
  }
  return normalized;
}

export function clearHdwRows(rows = []) {
  return normalizeHdw40Rows(rows).map((row) => ({ trainId: "", tid: "", timing: "", remark: "", hdwDepot: row.hdwDepot }));
}
