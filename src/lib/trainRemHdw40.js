export const HDW40_PRESET_LABEL = "HDW 40";

// Same location groups as the 7pm list, without timetable/TID dependencies.
export const HDW40_GROUPS = [
  { depot: "west", label: "West Depot", start: 0, count: 17 },
  { depot: "east", label: "East Depot", start: 17, count: 3 },
  { depot: "mainline", label: "Off-peak", start: 20, count: 20 },
];

export function getHdw40RowGroup(index) {
  return HDW40_GROUPS.find((group) => index >= group.start && index < group.start + group.count);
}

export function normalizeHdw40Rows(rows = [], depot = "west") {
  const source = Array.isArray(rows) ? rows : [];
  // The East group lives in the combined West panel, not a second hidden list.
  return Array.from({ length: depot === "west" ? 40 : 0 }, (_, index) => ({
    trainId: source[index]?.trainId || "",
    tid: "",
    timing: source[index]?.timing || "",
    remark: source[index]?.remark || "",
  }));
}

export function getHdw40GroupRows(rows = [], depot = "west") {
  const group = HDW40_GROUPS.find((item) => item.depot === depot);
  return group ? normalizeHdw40Rows(rows).slice(group.start, group.start + group.count) : [];
}
