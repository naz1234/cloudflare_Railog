import { useEffect, useRef, useState } from 'react';
import { base44 } from '../api/base44Client';
import { collectPstFldcTrainIds, createPstFldcVerification, getPstFldcDate, getPstFldcRecordKey, isPstFldcVerificationCurrent, normalizePstFldcVerification, savePstFldcVerification, selectPstFldcRecord } from '../lib/pstFldcVerification';

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
    versions.current.west += 1;
    versions.current.east += 1;
    setLoaded({});
    setVerifications({});
    setDrafts(emptyDrafts());
    const load = async (depot) => {
      const version = versions.current[depot];
      if (busy.current[depot]) return;
      try {
        const key = getPstFldcRecordKey(depot, day);
        const record = selectPstFldcRecord(await entity.filter({ recordKey: key }), key);
        if (cancelled || busy.current[depot] || version !== versions.current[depot]) return;
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

  const persist = async (depot, value, confirmed = false) => {
    if (busy.current[depot]) return;
    const version = ++versions.current[depot];
    busy.current[depot] = confirmed ? 'confirm' : 'clear';
    pending.current[depot] = { value, confirmed };
    setSaving((current) => ({ ...current, [depot]: confirmed ? 'confirm' : 'clear' }));
    setErrors((current) => ({ ...current, [depot]: '' }));
    try {
      await savePstFldcVerification(entity, value);
      if (!mounted.current || version !== versions.current[depot]) return;
      setVerifications((current) => ({ ...current, [depot]: value }));
      setLoaded((current) => ({ ...current, [depot]: true }));
      pending.current[depot] = null;
      if (confirmed) {
        dirty.current[depot] = false;
        setDrafts((current) => ({ ...current, [depot]: { by: value.by } }));
      }
    } catch {
      if (mounted.current && value.date === getPstFldcDate()) setErrors((current) => ({ ...current, [depot]: 'Unable to save FLDC verification. Retry save.' }));
    } finally {
      busy.current[depot] = false;
      if (mounted.current) setSaving((current) => ({ ...current, [depot]: false }));
    }
  };

  const updateDraft = (depot, patch) => {
    if (busy.current[depot] === 'confirm') return;
    const next = { ...drafts[depot], ...patch };
    dirty.current[depot] = true;
    versions.current[depot] += 1;
    setDrafts((current) => ({ ...current, [depot]: next }));
    const previous = verifications[depot];
    if (previous?.status === 'Yes' && next.by.trim() !== previous.by) {
      // A withdrawn/edited confirmation must not reappear after a refresh.
      setVerifications((current) => ({ ...current, [depot]: null }));
      void persist(depot, { depot, date: day, by: '', trainIds: [], status: '' });
    }
  };

  const isConfirmed = (depot) => Boolean(loaded[depot] && !dirty.current[depot] && !errors[depot] && !saving[depot] && day === getPstFldcDate() &&
    drafts[depot].by.trim() === verifications[depot]?.by &&
    isPstFldcVerificationCurrent(verifications[depot], depot, trainIds[depot], day));

  const confirm = (depot) => {
    const today = getPstFldcDate();
    if (today !== day) { setDay(today); return; }
    // Clicking this button is the explicit FLDC attestation; a separate checkbox is not required.
    const value = createPstFldcVerification(depot, trainIds[depot], { by: drafts[depot].by, verified: true }, day);
    if (loaded[depot] && value) void persist(depot, value, true);
  };

  const retry = (depot) => {
    const action = pending.current[depot];
    if (action?.confirmed) confirm(depot);
    else if (action) void persist(depot, { depot, date: day, by: '', trainIds: [], status: '' });
    else {
      refreshRef.current?.();
    }
  };

  return { drafts, trainIds, loaded, saving, errors, updateDraft, confirm, retry, isConfirmed,
    exportVerifications: Object.fromEntries(['west', 'east'].map((depot) => [depot, isConfirmed(depot) ? verifications[depot] : null])) };
}
