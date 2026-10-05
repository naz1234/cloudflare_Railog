import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FileSpreadsheet, Image } from "lucide-react";
import "./MaintenanceUploadTools.css";

export default function MaintenanceUploadTools({ keepOpen = false, children }) {
  const panelsId = useId();
  const toolsRef = useRef(null);
  const closeTimer = useRef(null);
  const firstTrigger = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const expanded = keepOpen || pinned || (!dismissed && (hovered || focused));

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    // Clearing a review removes its focused button without a browser blur event.
    if (!keepOpen) setFocused(Boolean(toolsRef.current?.contains(document.activeElement)));
  }, [keepOpen]);

  const toggle = () => {
    if (keepOpen) return;
    if (pinned) {
      setPinned(false);
      setDismissed(true);
    } else {
      setPinned(true);
      setDismissed(false);
    }
  };

  return (
    <div
      ref={toolsRef}
      className="maintenance-upload-tools"
      data-expanded={expanded}
      data-open-reason={keepOpen ? "upload-review" : pinned ? "pinned" : !dismissed && focused ? "focus" : !dismissed && hovered ? "hover" : "closed"}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        clearTimeout(closeTimer.current);
        setHovered(true);
        setDismissed(false);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setHovered(false), 220);
      }}
      onFocusCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocused(true);
        setDismissed(false);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !expanded || keepOpen) return;
        event.preventDefault();
        firstTrigger.current?.focus();
        setPinned(false);
        setDismissed(true);
      }}
    >
      <div className="maintenance-upload-shortcuts" role="group" aria-label="Maintenance upload tools">
        {[
          { label: "Wash Excel", Icon: FileSpreadsheet, kind: "wash" },
          { label: "Req. Image", Icon: Image, kind: "image" },
        ].map(({ label, Icon, kind }, index) => (
          <button
            key={kind}
            ref={index === 0 ? firstTrigger : undefined}
            type="button"
            className={`maintenance-upload-shortcut maintenance-upload-shortcut--${kind}`}
            aria-expanded={expanded}
            aria-controls={panelsId}
            title={keepOpen ? "Upload review stays open until you clear the selected files." : "Hover to preview; click to keep open or close."}
            onClick={toggle}
          >
            <Icon className="maintenance-upload-shortcut-icon" aria-hidden="true" strokeWidth={1.7} />
            <span>{label}</span>
            <ChevronDown className="maintenance-upload-shortcut-chevron" aria-hidden="true" />
          </button>
        ))}
      </div>
      {/* Keep both readers mounted: hiding must never discard an upload or review. */}
      <div id={panelsId} className="maintenance-upload-panels" hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}
