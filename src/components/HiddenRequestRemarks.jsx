import { EyeOff } from "lucide-react";
import ActionTooltip from "./ActionTooltip";
import { getHiddenRequestRemarkLabels } from "../lib/requestGroupVisibility";

export default function HiddenRequestRemarks({ items = [], trainId, className = "" }) {
  const labels = getHiddenRequestRemarkLabels(items);
  if (!labels.length) return null;
  const trainNumber = String(trainId || "").replace(/^T/i, "").padStart(2, "0");

  return (
    <ActionTooltip
      message={
        <div>
          <strong className="mb-1 block">Hidden remarks</strong>
          {labels.map((label) => <span key={label} className="block">{label}</span>)}
        </div>
      }
      placement="bottom"
      sideOffset={6}
      wrapperClassName={`shrink-0 ${className}`.trim()}
    >
      <button
        type="button"
        aria-label={`Hidden remarks for train T${trainNumber}`}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded text-rose-400 transition-colors hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
      >
        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </ActionTooltip>
  );
}
