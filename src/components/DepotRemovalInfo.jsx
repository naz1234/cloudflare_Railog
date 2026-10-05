import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

export default function DepotRemovalInfo({ trainLabel, depot = "west", removals = [] }) {
  if (!removals.length) return null;
  const safeDepot = depot === "east" ? "east" : "west";
  const depotLabel = safeDepot === "east" ? "East Depot" : "West Depot";

  const description = removals
    .map(({ tid, timing }) => `TID ${tid}, removal time ${timing || "not set"}`)
    .join("; ");

  return (
    <TooltipPrimitive.Provider delayDuration={150} skipDelayDuration={100} disableHoverableContent>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            className="theme-removal-info-trigger"
            data-depot={safeDepot}
            aria-label={`${depotLabel} Removal for ${trainLabel}: ${description}`}
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
            data-depot={safeDepot}
            className="theme-removal-info-tooltip z-[10000] max-w-[280px] rounded-lg border px-3 py-2 text-left text-[11px] leading-snug shadow-xl"
          >
            <div className="font-bold">{depotLabel} Removal</div>
            {removals.map(({ tid, timing }) => (
              <div key={`${tid}-${timing}`} className="mt-1.5">
                <div className="theme-removal-info-tid font-bold">{trainLabel} · TID {tid}</div>
                <div className="mt-0.5">Removal time: {timing || "Not set"}</div>
              </div>
            ))}
            <div className="theme-removal-info-source mt-1.5">From Removal Summary</div>
            <TooltipPrimitive.Arrow className="theme-removal-info-arrow" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
