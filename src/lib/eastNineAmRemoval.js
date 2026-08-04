import { createRemovalPdfDraft } from "./removalPdfDraft.js";

function normalizeTid(value = "") {
  return String(value || "").replace(/[^0-9]/g, "");
}

export function selectEastNineAmOffPeakRows(
  referenceRows = [],
  westRemovalTids = [],
  eastRemovalTids = [],
) {
  const scheduledTids = new Set(
    [...westRemovalTids, ...eastRemovalTids]
      .map((tid) => normalizeTid(tid))
      .filter(Boolean),
  );
  const seenTids = new Set();

  return (Array.isArray(referenceRows) ? referenceRows : [])
    .map((row) => ({
      ...row,
      tid: normalizeTid(row?.tid),
    }))
    .filter((row) => (
      row.tid
      && row.trainId
      && !scheduledTids.has(row.tid)
      && !seenTids.has(row.tid)
      && seenTids.add(row.tid)
    ));
}

export function createEastNineAmRemovalPdfDraft({ eastLog = {}, offPeakRows = [] } = {}) {
  const offPeakLog = {
    depot: "offPeak",
    depotLabel: "Off-Peak Trains",
    title: "OFF-PEAK TRAINS",
    noEntryText: "No populated off-peak trains",
    entries: (Array.isArray(offPeakRows) ? offPeakRows : []).map((row) => ({
      ...row,
      time: String(row?.time || ""),
      remark: String(row?.remark || ""),
      remarkPills: Array.isArray(row?.remarkPills)
        ? row.remarkPills.map((pill) => ({ ...pill }))
        : [],
    })),
  };

  return {
    ...createRemovalPdfDraft({ westLog: offPeakLog, eastLog, actionOverviewRows: [] }),
    draftType: "eastNineAmOffPeak",
  };
}
