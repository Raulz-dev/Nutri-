import { useEffect, useRef } from "react";

export function useVisiblePolling(
  refresh: () => Promise<unknown>,
  onError: (reason: unknown) => void,
  immediate = false,
) {
  const errorHandler = useRef(onError);
  errorHandler.current = onError;

  useEffect(() => {
    let active = true;
    let running = false;
    const poll = async () => {
      if (document.visibilityState !== "visible" || running) return;
      running = true;
      try {
        await refresh();
      } catch (reason) {
        if (active) errorHandler.current(reason);
      } finally {
        running = false;
      }
    };
    if (immediate) void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 10_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh, immediate]);
}
