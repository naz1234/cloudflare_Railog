import * as TooltipPrimitive from "@radix-ui/react-tooltip";

export default function ActionTooltip({
  message,
  placement = "top",
  align = "center",
  sideOffset = 7,
  wrapperClassName = "",
  children,
}) {
  if (!message) return children;

  const side = placement === "bottom" ? "bottom" : "top";

  return (
    <TooltipPrimitive.Provider delayDuration={150} skipDelayDuration={100}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <span className={`inline-flex ${wrapperClassName}`.trim()}>
            {children}
          </span>
        </TooltipPrimitive.Trigger>

        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={sideOffset}
            collisionPadding={10}
            role="tooltip"
            className="z-[10000] max-w-[280px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold leading-snug text-slate-900 shadow-xl will-change-[transform,opacity] data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0 data-[state=instant-open]:zoom-in-95"
            style={{ animationDuration: "150ms" }}
          >
            {message}
            <TooltipPrimitive.Arrow
              width={10}
              height={5}
              className="fill-white"
              style={{ filter: "drop-shadow(0 1px 0 rgb(226 232 240))" }}
            />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
