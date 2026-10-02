export function getStablingSyncTooltipCopy({ depotCode, workLabel = "insertion", isDirty = false }) {
  const depotName = depotCode === "WD" ? "West Depot" : "East Depot";
  const sectionSuffix = workLabel === "PST / Train Prep" ? " — PST" : "";
  const title = isDirty
    ? `Sync ${depotName}${sectionSuffix}`
    : `${depotName}${sectionSuffix} is up to date`;
  const description = isDirty
    ? "Use the latest layout from Main Stabling."
    : "Already matches Main Stabling.";
  const warning = !isDirty ? "" : sectionSuffix
    ? `Clears ${depotName} PST and Train Prep entries, logs and TA names.`
    : `Clears ${depotName} insertion entries and TID inputs.`;

  return {
    title,
    description,
    warning,
    accessibleLabel: `${title}. ${description}${warning ? ` ${warning}` : ""}`,
  };
}
