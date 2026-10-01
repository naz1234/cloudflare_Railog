export const WEST_DEPOT_WEEKEND_WASH_NOTICE = "Early Shift Friday and Saturday:\nKindly park all pending-wash trains at West Depot and ensure none are running on the Mainline.\n\nObjective: Late Shift can send the trains directly for wash after Possession and expedite washing.";

function isWithinEarlyShiftNoticeWindow(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  const startMinute = 9 * 60;
  const endMinute = 16 * 60;
  return minuteOfDay >= startMinute && minuteOfDay <= endMinute;
}

export function shouldShowWestDepotWeekendWashNotice({
  depot = "west",
  timetableType = "weekday",
  date = new Date(),
} = {}) {
  if (String(depot || "").trim().toLowerCase() !== "west") return false;
  const normalizedTimetable = String(timetableType || "").trim().toLowerCase();
  if (normalizedTimetable !== "friday" && normalizedTimetable !== "saturday") return false;
  return isWithinEarlyShiftNoticeWindow(date);
}
