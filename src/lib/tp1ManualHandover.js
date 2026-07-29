export function formatTp1HandoverConfirmedBy(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildTp1ManualCmmsHandoverLine({
  time = "",
  cmmsNumber = "",
  srNumber = "",
  l3ReportUpdatedToMaintenance = false,
  confirmedBy = "",
} = {}) {
  const safeTime = String(time || "").trim();
  const safeCmmsNumber = String(cmmsNumber || "").replace(/[^0-9A-Za-z/-]/g, "").trim();
  const safeSrNumber = String(srNumber || "").replace(/[^0-9A-Za-z/-]/g, "").trim();
  if (!safeTime || !safeCmmsNumber) return "";

  const srSuffix = safeSrNumber ? ` with SR #${safeSrNumber}` : "";
  const baseLine = `${safeTime} hrs \u2013 CMMS handover completed. Handover #${safeCmmsNumber}${srSuffix}.`;
  if (!l3ReportUpdatedToMaintenance) return baseLine;

  const safeConfirmedBy = formatTp1HandoverConfirmedBy(confirmedBy);
  const reportUpdate = safeConfirmedBy
    ? `As per ${safeConfirmedBy}, the L3 report has already been updated to maintenance, so no need to update the HO section.`
    : "The L3 report has already been updated to maintenance, so no need to update the HO section.";

  return `${baseLine} ${reportUpdate}`;
}
