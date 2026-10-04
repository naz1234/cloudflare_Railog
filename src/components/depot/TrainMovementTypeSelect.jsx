import * as SelectPrimitive from "@radix-ui/react-select";
import { Check } from "lucide-react";

export const MOVEMENT_TYPE_OPTIONS = [
  { value: "swapping", label: "Swapping", icon: "⇄" },
  { value: "insertion", label: "Insertion", icon: "→" },
  { value: "removal", label: "Removal", icon: "←" },
];

export default function TrainMovementTypeSelect({ value = "swapping", onValueChange, onOpenChange }) {
  const selected = MOVEMENT_TYPE_OPTIONS.find((option) => option.value === value) || MOVEMENT_TYPE_OPTIONS[0];

  return (
    <SelectPrimitive.Root value={selected.value} onValueChange={onValueChange} onOpenChange={onOpenChange}>
      <SelectPrimitive.Trigger
        className="theme-movement-type-trigger"
        data-movement-type={selected.value}
        aria-label="Movement type"
      >
        <SelectPrimitive.Value>{selected.label}</SelectPrimitive.Value>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="theme-movement-type-popup"
          position="popper"
          side="bottom"
          align="start"
          sideOffset={3}
          collisionPadding={8}
        >
          <SelectPrimitive.Viewport>
            {MOVEMENT_TYPE_OPTIONS.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="theme-movement-type-option"
                data-movement-type={option.value}
                textValue={option.label}
              >
                <span className="theme-movement-type-option-icon" aria-hidden="true">
                  <span className="theme-movement-type-option-symbol">{option.icon}</span>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="theme-movement-type-option-check">
                  <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
