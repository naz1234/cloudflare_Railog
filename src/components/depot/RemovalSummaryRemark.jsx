import * as Popover from "@radix-ui/react-popover";
import { X } from "lucide-react";
import ActionTooltip from "../ActionTooltip";

export default function RemovalSummaryRemark({ value, trainLabel, accent, hasHiddenRemarks = false }) {
  return (
    <Popover.Root>
      <ActionTooltip message={value} placement="top" wrapperClassName="slate-removal-remark-wrap">
        <Popover.Trigger asChild>
          <button
            type="button"
            className={`slate-removal-remark${hasHiddenRemarks ? " has-hidden-remarks" : ""}`}
            style={{ "--slate-remark-accent": accent || "#94a3b8" }}
            aria-label={`View remarks for ${trainLabel}: ${value}`}
          >
            <span className="slate-removal-remark-text">{value}</span>
          </button>
        </Popover.Trigger>
      </ActionTooltip>
      <Popover.Portal>
        <Popover.Content
          className="slate-removal-remark-popover"
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={`${trainLabel} remarks`}
        >
          <div className="slate-removal-remark-heading">
            <span>{trainLabel} <span>Remarks</span></span>
            <Popover.Close aria-label="Close remarks"><X size={13} /></Popover.Close>
          </div>
          <p>{value}</p>
          <Popover.Arrow className="slate-removal-remark-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
