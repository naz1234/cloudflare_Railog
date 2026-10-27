import { useEffect, useRef, useState } from 'react';
import { base44 } from '../api/base44Client';
import { collectPstFldcTrainIds, createPstFldcVerification, getActivePstFldcVerification, getPstFldcDate, getPstFldcRecordKey, normalizePstFldcTrainId, normalizePstFldcVerification, savePstFldcVerification, selectPstFldcRecord } from '../lib/pstFldcVerification';

const emptyDrafts = () => ({ west: { by: '' }, east: { by: '' } });

export function usePstFldcVerification(pstEntries = []) {
  const [day, setDay] = useState(getPstFldcDate);
  const [drafts, setDrafts] = useState(emptyDrafts);
  const [verifications, setVerifications] = useState({});
  const [loaded, setLoaded] = useState({});
  const [saving, setSaving] = useState({});
  const [errors, setErrors] = useState({});
  const dirty = useRef({});
  const versions = useRef({ west: 0, east: 0 });
  const busy = useRef({});
  const mounted = useRef(true);
  const pending = useRef({});
  const observedTrainIds = useRef({});
  const withdrawnTrainIds = useRef({ west: new Set(), east: new Set() });
  const refreshRef = useRef(null);
  const entity = base44.entities.PSTTrainPrep;
  const trainIds = { west: collectPstFldcTrainIds('west', pstEntries), east: collectPstFldcTrainIds('east', pstEntries) };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    dirty.current = {};
    pending.current = {};
    observedTrainIds.current = {};
    withdrawnTrainIds.current = { west: new Set(), east: new Set() };
    versions.current.west += 1;
    versions.current.east += 1;
    setLoaded({});
    setVerifications({});
    setErrors({});
    setDrafts(emptyDrafts());
    const load = async (depot) => {
      const version = versions.current[depot];
      if (busy.current[depot] || pending.current[depot]) return;
      try {
        const key = getPstFldcRecordKey(depot, day);
        const record = selectPstFldcRecord(await entity.filter({ recordKey: key }), key);
        if (cancelled || busy.current[depot] || pending.current[depot] || version !== versions.current[depot]) return;
        const value = record ? normalizePstFldcVerification(record.verification) : null;
        setVerifications((current) => ({ ...current, [depot]: value }));
        setLoaded((current) => ({ ...current, [depot]: true }));
        setErrors((current) => ({ ...current, [depot]: '' }));
        if (!dirty.current[depot]) setDrafts((current) => ({ ...current, [depot]: { by: value?.by || '' } }));
      } catch {
        if (!cancelled && version === versions.current[depot]) setErrors((current) => ({ ...current, [depot]: 'Unable to load FLDC verification. Retry.' }));
      }
    };
    const refresh = () => {
      const today = getPstFldcDate();
      if (today !== day) { setDay(today); return; }
      void load('west');
      void load('east');
    };
    refreshRef.current = refresh;
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; refreshRef.current = null; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [day, entity]);

  const persist = async (depot, value, syncDraft = true) => {
    if (busy.current[depot]) return;
    const version = ++versions.current[depot];
    const phase = syncDraft ? 'confirm' : 'clear';
    busy.current[depot] = phase;
    pending.current[depot] = { value, syncDraft };
    setSaving((current) => ({ ...current, [depot]: phase }));
    setErrors((current) => ({ ...current, [depot]: '' }));
    try {
      await savePstFldcVerification(entity, value);
      if (!mounted.current || version !== versions.current[depot]) return;
      setVerifications((current) => ({ ...current, [depot]: value }));
      setLoaded((current) => ({ ...current, [depot]: true }));
      pending.current[depot] = null;
      if (syncDraft) {
        dirty.current[depot] = false;
        setDrafts((current) => ({ ...current, [depot]: { by: value.by } }));
      }
    } catch {
      if (mounted.current && version === versions.current[depot] && value.date === getPstFldcDate()) setErrors((current) => ({ ...current, [depot]: 'Unable to save FLDC verification. Retry save.' }));
    } finally {
      busy.current[depot] = false;
      if (mounted.current) {
        setSaving((current) => ({ ...current, [depot]: false }));
        if (value.date !== getPstFldcDate()) refreshRef.current?.();
      }
    }
  };

  const updateDraft = (depot, patch) => {
    if (!loaded[depot] || busy.current[depot] === 'confirm') return;
    const next = { ...drafts[depot], ...patch };
    dirty.current[depot] = next.by.trim() !== (verifications[depot]?.by || '');
    if (!busy.current[depot]) versions.current[depot] += 1;
    setDrafts((current) => ({ ...current, [depot]: next }));
    const previous = pending.current[depot]?.value || verifications[depot];
    if (previous?.status === 'Yes' && next.by.trim() !== previous.by) {
      // A different verifier must explicitly tick each train again.
      setVerifications((current) => ({ ...current, [depot]: null }));
      void persist(depot, { depot, date: day, by: '', trainIds: [], status: '' }, false);
    }
  };

  const getCurrentVerification = (source, depot) => {
    const active = getActivePstFldcVerification(source, depot, trainIds[depot], day);
    if (!active) return null;
    const selected = active.trainIds.filter((id) => !withdrawnTrainIds.current[depot].has(id));
    return selected.length ? { ...active, trainIds: selected } : null;
  };

  const getSelectedTrainIds = (depot) => {
    if (day !== getPstFldcDate()) return [];
    const source = pending.current[depot]?.value || verifications[depot];
    if (source?.by !== drafts[depot]?.by.trim()) return [];
    return getCurrentVerification(source, depot)?.trainIds || [];
  };

  const toggleTrain = (depot, trainId) => {
    if (getPstFldcDate() !== day) { setDay(getPstFldcDate()); return; }
    const id = normalizePstFldcTrainId(trainId);
    if (!loaded[depot] || busy.current[depot] || errors[depot] || !drafts[depot]?.by.trim() || !trainIds[depot]?.includes(id)) return;
    const selected = new Set(getSelectedTrainIds(depot));
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    withdrawnTrainIds.current[depot].delete(id);
    const value = createPstFldcVerification(depot, [...selected], { by: drafts[depot].by, verified: true }, day)
      || { depot, date: day, by: drafts[depot].by.trim(), trainIds: [], status: '' };
    void persist(depot, value);
  };

  const clear = (depot) => {
    if (getPstFldcDate() !== day) { setDay(getPstFldcDate()); return; }
    if (!loaded[depot] || busy.current[depot]) return;
    void persist(depot, { depot, date: day, by: drafts[depot].by.trim(), trainIds: [], status: '' });
  };

  const retry = (depot) => {
    if (getPstFldcDate() !== day) { setDay(getPstFldcDate()); return; }
    const action = pending.current[depot];
    if (action) {
      const value = getCurrentVerification(action.value, depot)
        || { depot, date: day, by: action.value.by, trainIds: [], status: '' };
      void persist(depot, value, action.syncDraft);
    } else refreshRef.current?.();
  };

  // Persist withdrawals so removing and later re-adding a train cannot restore
  // its old tick. New eligible trains always stay unticked.
  const eligibleKey = trainIds.west.join('|') + '/' + trainIds.east.join('|');
  useEffect(() => {
    for (const depot of ['west', 'east']) {
      const previousIds = observedTrainIds.current[depot] || [];
      observedTrainIds.current[depot] = trainIds[depot];
      for (const id of previousIds) {
        if (!trainIds[depot].includes(id)) withdrawnTrainIds.current[depot].add(id);
      }
      const saved = verifications[depot];
      if (!loaded[depot] || !saved?.trainIds.length || busy.current[depot] || pending.current[depot] || day !== getPstFldcDate()) continue;
      // An initially empty PST list can simply mean stabling is still loading.
      // Only withdraw trains that this mounted checklist actually saw leave.
      if (!saved.trainIds.some((id) => withdrawnTrainIds.current[depot].has(id))) continue;
      const active = getCurrentVerification(saved, depot);
      if ((active?.trainIds.length || 0) !== saved.trainIds.length) {
        void persist(depot, active || { depot, date: day, by: saved.by, trainIds: [], status: '' });
      }
    }
  // Serialized IDs capture list changes without depending on a fresh array.
  }, [day, eligibleKey, verifications, loaded, saving]);

  const exportVerifications = Object.fromEntries(['west', 'east'].map((depot) => [depot,
    loaded[depot] && !dirty.current[depot] && !errors[depot] && !saving[depot] && !pending.current[depot] && day === getPstFldcDate()
      && drafts[depot].by.trim() === verifications[depot]?.by
      ? getCurrentVerification(verifications[depot], depot) : null,
  ]));
  const isConfirmed = (depot) => Boolean(exportVerifications[depot] && exportVerifications[depot].trainIds.length === trainIds[depot].length);

  return { drafts, trainIds, loaded, saving, errors, updateDraft, toggleTrain, clear, retry, isConfirmed, getSelectedTrainIds, exportVerifications };
}
