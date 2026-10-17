import { useEffect, useId, useRef, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

const waitingLabel = (waitingForScd) => waitingForScd ? "Waiting for SCD applied" : "Waiting for handback";

export function HandbackStatusPill({ waiting, waitingForScd = false, id }) {
  if (!waiting) return null;
  return <span id={id} className="pss-handback-pill" data-status={waitingForScd ? "scd" : "handback"}><span className="pss-handback-dot" aria-hidden="true" />{waitingLabel(waitingForScd)}</span>;
}

export default function PossessionEntryPicker({ options = [], value = "", onValueChange, ariaLabel }) {
  const nativeId = useId();
  const hostRef = useRef(null);
  const [portalContainer, setPortalContainer] = useState(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];
  const selectedStatusId = `${nativeId}-handback-status`;

  useEffect(() => {
    // Keep the floating menu within the PSS theme scope, outside card clipping.
    setPortalContainer(hostRef.current?.closest(".app-shell") || null);
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnMobile = () => { if (!desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnMobile);
    return () => desktop.removeEventListener("change", closeOnMobile);
  }, []);

  return (
    <>
      <label className="pss-native-entry-picker" htmlFor={nativeId}>
        <span>Working on</span>
        <select id={nativeId} aria-label={ariaLabel} value={selected?.value || ""} onChange={(event) => onValueChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}{option.waiting ? ` — ${waitingLabel(option.waitingForScd)}` : ""}</option>)}
        </select>
      </label>
      <div ref={hostRef} className="req-mobile-only pss-desktop-entry-picker">
        <span className="pss-entry-picker-label" aria-hidden="true">Working on</span>
        <Select.Root value={selected?.value || ""} open={open} onOpenChange={setOpen} onValueChange={(nextValue) => { onValueChange(nextValue); setOpen(false); }}>
          <Select.Trigger className="pss-entry-picker-trigger" aria-label={ariaLabel} aria-describedby={selected?.waiting ? selectedStatusId : undefined} disabled={!selected} title={selected?.label}>
            <Select.Value className="pss-entry-picker-value">{selected?.label || "New PIC"}</Select.Value>
            <HandbackStatusPill waiting={selected?.waiting} waitingForScd={selected?.waitingForScd} id={selectedStatusId} />
            <Select.Icon asChild><ChevronDown size={14} aria-hidden="true" /></Select.Icon>
          </Select.Trigger>
          <Select.Portal container={portalContainer}>
            <Select.Content className="req-mobile-only pss-entry-popup" position="popper" side="bottom" align="start" sideOffset={5} collisionPadding={12}>
              <Select.Viewport className="pss-entry-options">
                {options.map((option, index) => (
                  <Select.Item key={option.value} value={option.value} textValue={option.label} className="pss-entry-option" aria-describedby={option.waiting ? `${nativeId}-option-${index}-status` : undefined}>
                    <Select.ItemText className="pss-entry-option-text">{option.label}</Select.ItemText>
                    <HandbackStatusPill waiting={option.waiting} waitingForScd={option.waitingForScd} id={`${nativeId}-option-${index}-status`} />
                    <Select.ItemIndicator className="pss-entry-option-check"><Check size={14} aria-hidden="true" /></Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
    </>
  );
}
