import { useEffect, useRef, useState } from 'react';
import { getWashDetailsText, WSH2_MAX_DETAILS_LENGTH } from '../lib/wsh2Records.js';

export default function Wsh2WashDetailsInput({ row, pending, onChange }) {
  const value = getWashDetailsText(row);
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  const revision = useRef(row.revision);
  const committing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value, row.id, row.revision]);

  async function save() {
    editing.current = false;
    const next = draft.trim();
    if (next === value || committing.current) return;
    committing.current = true;
    try {
      // Use the revision from focus, not a newer polling result, so typing
      // cannot silently overwrite another computer's edit.
      const saved = await onChange({ washDetails: next }, revision.current);
      setDraft(getWashDetailsText(saved || row));
    } finally { committing.current = false; }
  }

  return <input type="text" className="wsh2-wash-details" value={draft} disabled={pending}
    aria-label={`Wash details for ${row.trainNumber} on ${row.date}`}
    title="Enter wash details, for example Partial / WD. Press Enter or click outside to save."
    maxLength={WSH2_MAX_DETAILS_LENGTH} autoComplete="off" spellCheck={false}
    onFocus={() => { editing.current = true; revision.current = row.revision; }}
    onChange={(event) => setDraft(event.target.value)} onBlur={save}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
