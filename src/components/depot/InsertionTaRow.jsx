import { useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { normalizeInsertionTaName, withoutInsertionTaSuffix } from "../../lib/insertionTaName";
import "./InsertionTaRow.css";

export default function InsertionTaRow({ entry, text, onTaNameUpdate }) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const inputId = useId();
  const savedName = String(entry.taName || "").trim();
  const cleanName = normalizeInsertionTaName(draftName);
  const sentence = withoutInsertionTaSuffix(text, savedName);
  const context = `${entry.trainKey}${entry.tid ? ` · TID ${entry.tid}` : ""} · ${entry.road || entry.depot}`;

  const changeOpen = (nextOpen) => {
    if (nextOpen) setDraftName(savedName);
    setOpen(nextOpen);
  };

  const saveName = (name) => {
    onTaNameUpdate(entry.key, name);
    setOpen(false);
  };

  if (!entry.key || !onTaNameUpdate) return <div>{text}</div>;

  return (
    <div className="insertion-ta-row">
      <span>{sentence}</span>{" "}
      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className={`insertion-ta-trigger${savedName ? " has-name" : ""}`}
            aria-label={`${savedName ? `Edit TA ${savedName}` : "Add TA name"} for ${context}`}
          >
            {savedName ? `TA ${savedName}` : "＋ TA"}
            {savedName && <span aria-hidden="true"> ✎</span>}
          </button>
        </Dialog.Trigger>
        {savedName && <span> onboard.</span>}
        <Dialog.Portal>
          <Dialog.Overlay className="insertion-ta-overlay" />
          <Dialog.Content className="insertion-ta-dialog" onWheel={(event) => event.stopPropagation()}>
            <Dialog.Title className="insertion-ta-title">{savedName ? "Edit TA name" : "Add TA name"}</Dialog.Title>
            <Dialog.Description className="insertion-ta-context">{context}</Dialog.Description>
            <form onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (cleanName) saveName(cleanName);
            }}>
              <label htmlFor={inputId}>TA name</label>
              <input
                id={inputId}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="e.g. Ali"
                maxLength={40}
                autoComplete="off"
                enterKeyHint="done"
              />
              <p className="insertion-ta-preview">{sentence}{cleanName ? ` TA ${cleanName} onboard.` : ""}</p>
              <div className="insertion-ta-dialog-actions">
                {savedName && <button type="button" className="insertion-ta-remove" onClick={() => saveName("")}>Remove TA</button>}
                <Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close>
                <button type="submit" className="insertion-ta-save" disabled={!cleanName}>Save</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
