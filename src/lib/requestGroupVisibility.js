export function splitRequestMaintenanceMap(maintenanceMap = {}) {
  const visible = {};
  const hidden = {};

  Object.entries(maintenanceMap).forEach(([trainKey, items]) => {
    visible[trainKey] = [];
    hidden[trainKey] = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item) return;
      (item.hiddenByRequestGroup === true ? hidden : visible)[trainKey].push(item);
    });
  });

  return { visible, hidden };
}

export function getHiddenRequestRemarkLabels(items = []) {
  const labels = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const label = String(item?.badgeText || item?.displayType || item?.remark || item?.typeKey || "").trim();
    const key = label.replace(/\s+/g, " ").toUpperCase();
    if (key && !labels.has(key)) labels.set(key, label);
  });
  return [...labels.values()];
}
