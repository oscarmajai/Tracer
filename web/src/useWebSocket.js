import { useEffect, useRef } from 'react';
import { getSettings } from './api';

export function useWebSocket({ onMessage, onOpen, onClose, enabled }) {
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  // Keep refs current without re-running the effect
  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let ws = null;
    let reconnectDelay = 1000;
    let reconnectTimer = null;

    function connect() {
      if (stopped) return;
      const { apiUrl, apiToken } = getSettings();
      if (!apiToken) return;

      const wsUrl =
        apiUrl.replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/$/, '') +
        '/ws?token=' + encodeURIComponent(apiToken);

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectDelay = 1000;
        onOpenRef.current?.();
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        onCloseRef.current?.();
        if (stopped) return;
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        reconnectTimer = setTimeout(connect, reconnectDelay);
      };
      ws.onmessage = (e) => {
        try { onMessageRef.current?.(JSON.parse(e.data)); } catch {}
      };
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [enabled]);
}
