import { useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { defaultSweepEndTime, getInsertionLogTiming, normalizeInsertionLogTime, previewInsertionLogTiming } from "../../lib/insertionLogTiming";
import "./InsertionTimeRow.css";

export default function InsertionTimeRow({ entry, text = "", onTimeUpdate, onSweepUpdate }) {
  const [open, setOpen] = useState(false);
  const [draftTime, setDraftTime] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [endEdited, setEndEdited] = useState(false);
  const inputId = useId();
  const timing = getInsertionLogTiming(entry, text);
  const isSweep = Boolean(entry.isSweeping);
  const time = normalizeInsertionLogTime(draftTime);
  const clearTime = normalizeInsertionLogTime(draftEnd);
  const valid = Boolean(time && (!isSweep || clearTime));
  const context = `${entry.trainKey}${entry.tid ? ` · TID ${entry.tid}` : ""} · ${entry.road || entry.depot}`;
  const timePrefix = text.match(/^\d{1,2}:\d{2}(?=\s+hrs)/i)?.[0];

  const changeOpen = (nextOpen) => {
    if (nextOpen) {
      setDraftTime(timing.time);
      setDraftEnd(timing.clearTime || defaultSweepEndTime(timing.time));
      setEndEdited(false);
    }
    setOpen(nextOpen);
  };

  const changeStart = (value) => {
    setDraftTime(value);
    if (isSweep && !endEdited) {
      const endTime = defaultSweepEndTime(value);
      if (endTime) setDraftEnd(endTime);
    }
  };

  if (!entry.key || !(isSweep ? onSweepUpdate : onTimeUpdate) || !timePrefix) return <div>{text}</div>;

  return (
    <div className="insertion-time-row">
      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Trigger asChild>
          <button type="button" className="insertion-time-trigger" aria-label={`Edit ${isSweep ? "Sweep times" : "time"} for ${context}: ${timePrefix}`}>
            {timePrefix}<span className="insertion-time-pencil" aria-hidden="true"> ✎</span>
          </button>
        </Dialog.Trigger>
        <span>{text.slice(timePrefix.length)}</span>
        <Dialog.Portal>
          <Dialog.Overlay className="insertion-time-overlay" />
          <Dialog.Content className="insertion-time-dialog" onWheel={(event) => event.stopPropagation()}>
            <Dialog.Title className="insertion-time-title">{isSweep ? "Edit Sweep times" : "Edit insertion time"}</Dialog.Title>
            <Dialog.Description className="insertion-time-context">{context}</Dialog.Description>
            <form onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!valid) return;
              if (isSweep) onSweepUpdate(entry.key, { time, clearTime });
              else onTimeUpdate(entry.key, time);
              setOpen(false);
            }}>
              <label htmlFor={inputId}>{isSweep ? "Start time" : "Insertion time"}</label>
              <input
                id={inputId}
                value={draftTime}
                onChange={(event) => changeStart(event.target.value)}
                onBlur={() => { if (time) setDraftTime(time); }}
                placeholder="HH:MM"
                maxLength={5}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint={isSweep ? "next" : "done"}
                aria-invalid={Boolean(draftTime && !time)}
                aria-describedby={`${inputId}-hint${draftTime && !time ? ` ${inputId}-error` : ""}`}
              />
              <p id={`${inputId}-hint`} className="insertion-time-hint">24-hour time, e.g. 05:25 or 0525.</p>
              {draftTime && !time && <p id={`${inputId}-error`} className="insertion-time-error" role="alert">Enter a valid time from 00:00 to 23:59.</p>}
              {isSweep && <>
                <label htmlFor={`${inputId}-end`}>End time</label>
                <input
                  id={`${inputId}-end`}
                  value={draftEnd}
                  onChange={(event) => { setDraftEnd(event.target.value); setEndEdited(true); }}
                  onBlur={() => { if (clearTime) setDraftEnd(clearTime); }}
                  placeholder="HH:MM"
                  maxLength={5}
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint="done"
                  aria-invalid={Boolean(draftEnd && !clearTime)}
                  aria-describedby={`${inputId}-end-hint${draftEnd && !clearTime ? ` ${inputId}-end-error` : ""}`}
                />
                <p id={`${inputId}-end-hint`} className="insertion-time-hint">Changing the start sets the end two minutes later, unless you edit the end here.</p>
                {draftEnd && !clearTime && <p id={`${inputId}-end-error`} className="insertion-time-error" role="alert">Enter a valid time from 00:00 to 23:59.</p>}
              </>}
              <p className="insertion-time-preview">{valid ? previewInsertionLogTiming(text, time, isSweep ? clearTime : "") : text}</p>
              <div className="insertion-time-dialog-actions">
                <Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close>
                <button type="submit" className="insertion-time-save" disabled={!valid}>Save</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
