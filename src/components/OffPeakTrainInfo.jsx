import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

export default function OffPeakTrainInfo({ trainLabel, references = [] }) {
  if (!references.length) return null;
  const tids = references.map(({ tid }) => tid).filter(Boolean);
  const description = tids.length ? `: ${tids.map((tid) => `TID ${tid}`).join("; ")}` : "";

  return (
    <TooltipPrimitive.Provider delayDuration={150} skipDelayDuration={100} disableHoverableContent>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            className="theme-removal-info-trigger"
            data-service="off-peak"
            aria-label={`Off-peak train ${trainLabel}${description}`}
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
            data-service="off-peak"
            className="theme-removal-info-tooltip z-[10000] max-w-[280px] rounded-lg border px-3 py-2 text-left text-[11px] leading-snug shadow-xl"
          >
            <div className="font-bold">Off-peak train</div>
            <div className="theme-removal-info-tid mt-1.5 font-bold">
              {trainLabel}{tids.length > 0 ? ` · ${tids.map((tid) => `TID ${tid}`).join(" / ")}` : ""}
            </div>
            <TooltipPrimitive.Arrow className="theme-removal-info-arrow" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
