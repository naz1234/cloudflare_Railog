import { useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { normalizeInsertionTaName, withoutInsertionTaSuffix } from "../../lib/insertionTaName";
import "./InsertionTaControl.css";

export default function InsertionTaControl({ entry, text, onTaNameUpdate }) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const inputId = useId();
  const savedName = String(entry.taName || "").trim();
  const cleanName = normalizeInsertionTaName(draftName);
  const sentence = withoutInsertionTaSuffix(text, savedName);
  const context = `${entry.trainKey}${entry.tid ? ` · TID ${entry.tid}` : ""} · ${entry.road || entry.depot}`;

  const save = (name) => {
    onTaNameUpdate(entry.key, name);
    setOpen(false);
  };

  if (!entry.key || !onTaNameUpdate) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) setDraftName(savedName);
      setOpen(nextOpen);
    }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`insertion-time-trigger insertion-ta-trigger${savedName ? " has-name" : ""}`}
          aria-label={`${savedName ? `Edit TA ${savedName}` : "Add TA name"} for ${context}`}
        >
          {savedName ? `TA ${savedName}` : "＋ TA"}
          {savedName && <span className="insertion-time-pencil" aria-hidden="true"> ✎</span>}
        </button>
      </Dialog.Trigger>
      {savedName && <span> onboard.</span>}
      <Dialog.Portal>
        <Dialog.Overlay className="insertion-time-overlay" />
        <Dialog.Content className="insertion-time-dialog" onWheel={(event) => event.stopPropagation()}>
          <Dialog.Title className="insertion-time-title">{savedName ? "Edit TA name" : "Add TA name"}</Dialog.Title>
          <Dialog.Description className="insertion-time-context">{context}</Dialog.Description>
          <form onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (cleanName) save(cleanName);
          }}>
            <label htmlFor={inputId}>TA name</label>
            <input id={inputId} value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. Ali" maxLength={40} autoComplete="off" enterKeyHint="done" />
            <p className="insertion-time-preview">{sentence}{cleanName ? ` TA ${cleanName} onboard.` : ""}</p>
            <div className="insertion-time-dialog-actions">
              {savedName && <button type="button" className="insertion-ta-remove" onClick={() => save("")}>Remove TA</button>}
              <Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close>
              <button type="submit" className="insertion-time-save" disabled={!cleanName}>Save</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
