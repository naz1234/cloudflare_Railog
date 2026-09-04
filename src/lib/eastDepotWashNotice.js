export const EAST_DEPOT_WEEKDAY_WASH_NOTICE = "Early Shift Weekdays – Kindly arrange for the pending-wash trains parked at East Depot to be sent back to the Mainline as off-peak trains, to reduce swapping and expedite the pending washing.";

export function shouldShowEastDepotWashNotice({
  depot = "west",
  timetableType = "weekday",
  date = new Date(),
} = {}) {
  if (String(depot || "").trim().toLowerCase() !== "east") return false;
  if (String(timetableType || "").trim().toLowerCase() !== "weekday") return false;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  const startMinute = 9 * 60;
  const endMinute = 16 * 60;
  return minuteOfDay >= startMinute && minuteOfDay <= endMinute;
}
