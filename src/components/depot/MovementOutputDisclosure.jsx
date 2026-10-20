import { useId, useRef, useState } from "react";
import { ChevronDown, FileText } from "lucide-react";

export default function MovementOutputDisclosure({ westCount = 0, eastCount = 0, children }) {
  const contentId = useId();
  const triggerRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hovered || focused || pinned;

  return (
    <div
      className="movement-output-disclosure"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
      onFocusCapture={(event) => {
        if (event.target.matches(":focus-visible")) setFocused(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          setPinned(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !expanded) return;
        event.preventDefault();
        event.stopPropagation();
        triggerRef.current?.focus({ preventScroll: true });
        setHovered(false);
        setFocused(false);
        setPinned(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="movement-output-toggle"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => {
          setPinned(!pinned);
          setFocused(false);
        }}
      >
        <FileText size={14} aria-hidden="true" />
        <span className="movement-output-toggle-title">Output logs</span>
        <span className="movement-output-counts">
          <span data-depot="west">West <strong>{westCount}</strong></span>
          <span data-depot="east">East <strong>{eastCount}</strong></span>
        </span>
        <ChevronDown size={15} className={`movement-output-chevron${expanded ? " is-open" : ""}`} aria-hidden="true" />
      </button>
      <div id={contentId} className="movement-output-content" hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}
