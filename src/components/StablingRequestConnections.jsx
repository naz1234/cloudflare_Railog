import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { buildStablingConnectionPath, findStablingRequestTargets, getVisibleConnectionRect, normalizeConnectionTrainId } from "../lib/stablingRequestConnections";
import "../stablingRequestConnections.css";

export default function StablingRequestConnections({ source, trainIds, onDismiss }) {
  const trainKey = [...new Set(trainIds.map(normalizeConnectionTrainId).filter(Boolean))].sort().join(",");
  const [geometry, setGeometry] = useState({ connections: [] });

  useLayoutEffect(() => {
    const workspace = source?.closest("[data-stabling-workspace]");
    if (!workspace) {
      setGeometry({ connections: [] });
      return undefined;
    }
    let frame = null;
    const observed = new WeakSet();
    const resizeObserver = new ResizeObserver(() => scheduleMeasure());
    const measure = () => {
      frame = null;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const origin = source.isConnected ? getVisibleConnectionRect(source, viewport) : null;
      const connections = origin ? findStablingRequestTargets(workspace, trainKey.split(",")).flatMap((card) => {
        if (!observed.has(card)) {
          resizeObserver.observe(card);
          observed.add(card);
        }
        const bounds = getVisibleConnectionRect(card, viewport);
        if (!bounds) return [];
        const isRemovalTarget = card.dataset.removalTrain !== undefined;
        return [{
          id: isRemovalTarget
            ? ["removal", card.dataset.removalDepot, card.dataset.removalRow].join("-")
            : ["stabling", card.dataset.stablingDepot, card.dataset.stablingRoad, card.dataset.stablingBlock].join("-"),
          train: normalizeConnectionTrainId(isRemovalTarget ? card.dataset.removalTrain : card.dataset.stablingTrain),
          targetType: isRemovalTarget ? "removal" : "stabling",
          bounds,
          ...buildStablingConnectionPath(origin, bounds),
        }];
      }) : [];
      const accent = getComputedStyle(source).getPropertyValue("--request-category-accent").trim() || "#c084fc";
      const next = { ...viewport, accent, connections };
      setGeometry((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const scheduleMeasure = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };
    const dismiss = () => onDismiss(null);
    const onKeyDown = (event) => { if (event.key === "Escape") dismiss(); };
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(workspace, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-stabling-train", "data-removal-train", "data-removal-depot", "data-removal-row", "class", "style"] });
    resizeObserver.observe(source);
    resizeObserver.observe(workspace);
    document.addEventListener("scroll", scheduleMeasure, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("blur", dismiss);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("scroll", scheduleMeasure);
    measure();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      document.removeEventListener("scroll", scheduleMeasure, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("blur", dismiss);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, [source, trainKey, onDismiss]);

  if (!geometry.connections.length) return null;
  // Keep SVG units in CSS pixels, like getBoundingClientRect(). A viewBox based
  // on innerWidth would scale/offset the overlay when a scrollbar narrows it.
  return createPortal(
    <svg className="stabling-request-connections" aria-hidden="true" focusable="false"
      style={{ "--connection-accent": geometry.accent }}
    >
      {geometry.connections.map(({ id, train, targetType, bounds, start, end, path }) => (
        <g key={id} data-stabling-connection-train={train} data-request-connection-target={targetType}>
          <path className="stabling-connection-halo" d={path} />
          <path className="stabling-connection-line" d={path} />
          <rect className="stabling-connection-highlight" x={bounds.left} y={bounds.top} width={bounds.width} height={bounds.height} rx={targetType === "removal" ? 6 : 10} />
          <circle className="stabling-connection-dot" cx={start.x} cy={start.y} r={3} />
          <circle className="stabling-connection-dot" cx={end.x} cy={end.y} r={2.5} />
        </g>
      ))}
    </svg>,
    document.body
  );
}
