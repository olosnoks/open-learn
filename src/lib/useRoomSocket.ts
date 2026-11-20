import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientEvent, ServerEvent } from '../shared/types';

type Status = 'idle' | 'connecting' | 'open' | 'closed';

const MAX_RETRIES = 5;

export function useRoomSocket(
  roomCode: string | null,
  onEvent: (event: ServerEvent) => void,
  onFailed?: (reason: string) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const onFailedRef = useRef(onFailed);
  onEventRef.current = onEvent;
  onFailedRef.current = onFailed;

  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!roomCode) { setStatus('idle'); return; }

    // Per-effect state, so StrictMode's mount/unmount/mount and room-code changes
    // can't leave a stale socket reconnecting in the background.
    let disposed = false;
    let attempts = 0;
    let everOpened = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws/room/${encodeURIComponent(roomCode)}`);
      wsRef.current = ws;
      setStatus('connecting');

      ws.onopen = () => {
        everOpened = true;
        attempts = 0;
        setStatus('open');
      };
      ws.onmessage = (e) => {
        let event: ServerEvent;
        try { event = JSON.parse(e.data); } catch { return; }
        onEventRef.current(event);
      };
      ws.onclose = (e) => {
        if (disposed) return;
        if (wsRef.current === ws) wsRef.current = null;
        setStatus('closed');
        if (e.code === 4001) { onFailedRef.current?.('You were removed by the host'); return; }
        if (!everOpened && attempts >= 2) { onFailedRef.current?.('Room not found'); return; }
        if (attempts >= MAX_RETRIES) { onFailedRef.current?.('Connection lost'); return; }
        const delay = Math.min(8000, 500 * 2 ** attempts);
        attempts++;
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [roomCode]);

  const send = useCallback((event: ClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }, []);

  return { send, status };
}
