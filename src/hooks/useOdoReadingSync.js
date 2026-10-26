import { useCallback, useEffect, useState } from "react";
import { createOdoSyncController, createOdoTransport } from "../lib/odoReadingSync.js";

export default function useOdoReadingSync() {
  const [controller] = useState(() => {
    let storage;
    try { storage = window.localStorage; } catch { /* Cloud saving still works if the browser blocks local storage. */ }
    return createOdoSyncController({ transport: createOdoTransport(), storage });
  });
  const [view, setView] = useState(controller.getView);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setView);
    const refresh = () => { if (!document.hidden) void controller.refresh(); };
    const retry = async () => { await controller.refresh(); await controller.flush(); };
    setView(controller.getView());
    void controller.refresh();
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", refresh);
      controller.stop();
      // Flush a pending debounce when navigating away; failed edits remain in the browser cache.
      if (controller.getView().phase === "pending") void controller.flush();
    };
  }, [controller]);
  const setField = useCallback((field, value) => controller.update((state) => ({
    ...state, [field]: typeof value === "function" ? value(state[field]) : value,
  })), [controller]);
  return {
    ...view,
    setMileages: useCallback((value) => setField("mileages", value), [setField]),
    setWorkshops: useCallback((value) => setField("workshops", value), [setField]),
    setCmmsReport: useCallback((value) => setField("cmmsReport", value), [setField]),
    update: controller.update,
    clearReadings: controller.clearReadings,
    retry: async () => { await controller.refresh(); await controller.flush(); },
  };
}
