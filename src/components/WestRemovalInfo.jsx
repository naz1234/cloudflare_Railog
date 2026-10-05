import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

export default function WestRemovalInfo({ trainLabel, removals = [] }) {
  if (!removals.length) return null;

  const description = removals
    .map(({ tid, timing }) => `TID ${tid}, removal time ${timing || "not set"}`)
    .join("; ");

  return (
    <TooltipPrimitive.Provider delayDuration={150} skipDelayDuration={100} disableHoverableContent>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            className="theme-west-removal-info-trigger"
            aria-label={`West Depot Removal for ${trainLabel}: ${description}`}
          >
            <Info aria-hidden="true" className="h-[15px] w-[15px]" strokeWidth={2.4} />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="right"
            align="center"
            sideOffset={6}
            collisionPadding={10}
            className="theme-west-removal-info-tooltip z-[10000] max-w-[280px] rounded-lg border px-3 py-2 text-left text-[11px] leading-snug shadow-xl"
          >
            <div className="font-bold">West Depot Removal</div>
            {removals.map(({ tid, timing }) => (
              <div key={`${tid}-${timing}`} className="mt-1.5">
                <div className="theme-west-removal-info-tid font-bold">{trainLabel} · TID {tid}</div>
                <div className="mt-0.5">Removal time: {timing || "Not set"}</div>
              </div>
            ))}
            <div className="theme-west-removal-info-source mt-1.5">From Removal Summary</div>
            <TooltipPrimitive.Arrow className="theme-west-removal-info-arrow" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
