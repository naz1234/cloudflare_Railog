function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`[request-group-visibility] Unable to update ${label} in DepotStabling.jsx`);
  }
  return next;
}

export default function requestGroupVisibilityPlugin() {
  return {
    name: 'railog-request-group-visibility',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let code = source;

      code = replaceRequired(
        code,
        /    const payload = inheritedGroupTitle && !cleanRequestLabel\(reqData\?\.groupTitle\)\r?\n      \? \{ \.\.\.reqData, groupTitle: inheritedGroupTitle \}\r?\n      : reqData;\r?\n    const created = await base44\.entities\.MaintenanceRequest\.create\(payload\);/,
        `    const inheritedGroupHidden = requests.some(
      (request) =>
        normalizeRequestIdentity(getTrainRequestDisplayType(request)) === requestTypeKey &&
        request?.groupHidden === true
    );
    const payload = inheritedGroupTitle && !cleanRequestLabel(reqData?.groupTitle)
      ? { ...reqData, groupTitle: inheritedGroupTitle, groupHidden: inheritedGroupHidden }
      : { ...reqData, groupHidden: inheritedGroupHidden };
    const created = await base44.entities.MaintenanceRequest.create(payload);`,
        'new request visibility inheritance'
      );

      code = replaceRequired(
        code,
        /\n  const handleDeleteRequestGroup = async \(groupItems = \[\]\) => \{/,
        `
  const handleToggleRequestGroupHidden = async (groupItems = [], hidden = false) => {
    const editableItems = groupItems.filter((request) => request?.id);
    if (editableItems.length === 0) throw new Error("No saved trains were found in this group.");

    const nextHidden = Boolean(hidden);
    const results = await Promise.allSettled(
      editableItems.map((request) =>
        base44.entities.MaintenanceRequest.update(request.id, { groupHidden: nextHidden })
      )
    );
    const updatedById = new Map();

    results.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const request = editableItems[index];
      updatedById.set(request.id, {
        ...request,
        ...(result.value || {}),
        groupHidden: nextHidden,
      });
    });

    if (updatedById.size > 0) {
      setRequests((previous) =>
        previous.map((request) => updatedById.get(request.id) || request)
      );
    }

    const failedCount = results.length - updatedById.size;
    if (failedCount > 0) {
      throw new Error(
        failedCount === results.length
          ? "Unable to " + (nextHidden ? "hide" : "unhide") + " this request group."
          : (nextHidden ? "Hidden" : "Unhidden") + " for " + updatedById.size + " train(s); " + failedCount + " could not be updated."
      );
    }
  };

  const handleDeleteRequestGroup = async (groupItems = []) => {`,
        'shared request group visibility handler'
      );

      code = replaceRequired(
        code,
        /          onRenameGroup=\{handleRenameRequestGroup\}\r?\n          onDeleteGroup=\{handleDeleteRequestGroup\}/,
        `          onRenameGroup={handleRenameRequestGroup}
          onToggleGroupHidden={handleToggleRequestGroupHidden}
          onDeleteGroup={handleDeleteRequestGroup}`,
        'MaintenancePanel visibility callback'
      );

      code = replaceRequired(
        code,
        /      remark: "",\r?\n      badgeText: displayType,/,
        `      remark: "",
      hiddenAtStabling: req?.groupHidden === true,
      badgeText: displayType,`,
        'stabling remark visibility metadata'
      );

      code = replaceRequired(
        code,
        /  const maintenanceMap = buildMaintenanceMap\(requests, westStablingKeys\);/,
        `  const maintenanceMap = buildMaintenanceMap(requests, westStablingKeys);
  const stablingMaintenanceMap = Object.fromEntries(
    Object.entries(maintenanceMap).map(([trainKey, items]) => [
      trainKey,
      (Array.isArray(items) ? items : []).filter((item) => !item.hiddenAtStabling),
    ])
  );`,
        'stabling-only visible maintenance map'
      );

      code = replaceRequired(
        code,
        /(title="WEST DEPOT STABLING"[\s\S]*?maintenanceMap=)\{maintenanceMap\}/,
        '$1{stablingMaintenanceMap}',
        'West stabling visible remarks'
      );

      code = replaceRequired(
        code,
        /(title="EAST DEPOT STABLING"[\s\S]*?maintenanceMap=)\{maintenanceMap\}/,
        '$1{stablingMaintenanceMap}',
        'East stabling visible remarks'
      );

      return { code, map: null };
    },
  };
}
