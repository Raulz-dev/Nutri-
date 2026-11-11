import { useEffect, useRef, useState } from "react";
import { env } from "../../lib/env";
import { ApiError, apiRequest } from "../../lib/http-client";

export function useWhatsAppRealtime(
  token: string,
  refresh: () => Promise<unknown>,
  onError: (reason: unknown) => void,
) {
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const callbacks = useRef({ refresh, onError });
  callbacks.current = { refresh, onError };
  useEffect(() => {
    setConnected(false);
    if (typeof WebSocket === "undefined") return;
    let active = true;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof window.setTimeout> | undefined;
    let handshake: ReturnType<typeof window.setTimeout> | undefined;
    let batch: ReturnType<typeof window.setTimeout> | undefined;
    let attempts = 0;
    let generation = 0;
    let connecting = false;
    let lastFrame = 0;
    let refreshing = false;
    let dirty = false;
    const visible = () =>
      document.visibilityState === "visible" && navigator.onLine !== false;
    const sync = async () => {
      if (!active || !visible()) return;
      dirty = true;
      if (refreshing) return;
      refreshing = true;
      try {
        while (dirty && active && visible()) {
          dirty = false;
          setRevision((value) => value + 1);
          await callbacks.current.refresh();
        }
      } catch (reason) {
        if (active) {
          callbacks.current.onError(reason);
          // A missed HTTP refresh must be retried by the fallback/reconnect path.
          socket?.close();
        }
      } finally {
        refreshing = false;
      }
    };
    const schedule = () => {
      if (!active || !visible() || retry !== undefined) return;
      const delay =
        Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)) +
        Math.floor(Math.random() * 250);
      retry = window.setTimeout(() => {
        retry = undefined;
        void connect();
      }, delay);
    };
    const disconnect = () => {
      generation += 1;
      connecting = false;
      window.clearTimeout(retry);
      retry = undefined;
      window.clearTimeout(handshake);
      handshake = undefined;
      window.clearTimeout(batch);
      batch = undefined;
      if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
      }
      if (active) setConnected(false);
    };
    const connect = async () => {
      if (!active || !visible() || connecting || socket) return;
      connecting = true;
      const current = ++generation;
      try {
        const grant = await apiRequest<{ ticket: string }>(
          "/whatsapp/realtime-ticket",
          { token, method: "POST" },
        );
        if (!active || current !== generation || !visible()) return;
        const url = new URL(
          env.apiUrl.replace(/\/$/, "") + "/whatsapp/realtime",
          window.location.href,
        );
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(url.toString());
        socket = ws;
        lastFrame = Date.now();
        handshake = window.setTimeout(() => ws.close(), 10_000);
        ws.onopen = () => {
          if (active && current === generation) ws.send(grant.ticket);
        };
        ws.onmessage = (event) => {
          if (!active || current !== generation) return;
          let message: { type?: string };
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }
          if (!message || typeof message !== "object") return;
          lastFrame = Date.now();
          if (message.type === "ready") {
            window.clearTimeout(handshake);
            handshake = undefined;
            attempts = 0;
            setConnected(true);
            void sync();
          } else if (
            message.type === "whatsapp.conversation_changed" &&
            batch === undefined
          ) {
            batch = window.setTimeout(() => {
              batch = undefined;
              void sync();
            }, 50);
          }
        };
        ws.onclose = () => {
          if (!active || current !== generation) return;
          socket = null;
          window.clearTimeout(handshake);
          handshake = undefined;
          setConnected(false);
          schedule();
        };
        ws.onerror = () => {
          if (active && current === generation) ws.close();
        };
      } catch (reason) {
        if (active && current === generation) {
          setConnected(false);
          if (
            !(
              reason instanceof ApiError &&
              (reason.status === 401 || reason.status === 403)
            )
          )
            schedule();
        }
      } finally {
        if (current === generation) connecting = false;
      }
    };
    const visibility = () => {
      if (!visible()) disconnect();
      else {
        attempts = 0;
        void connect();
      }
    };
    const watchdog = window.setInterval(() => {
      if (
        socket?.readyState === WebSocket.OPEN &&
        lastFrame &&
        Date.now() - lastFrame > 45_000
      )
        socket.close();
    }, 10_000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    void connect();
    return () => {
      active = false;
      disconnect();
      window.clearInterval(watchdog);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", visibility);
      window.removeEventListener("offline", visibility);
    };
  }, [token]);
  return { connected, revision };
}
