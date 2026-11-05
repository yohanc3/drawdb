import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { liveUrl } from "../api/cloud";

export const CollabContext = createContext({
  emitDelta: () => {}, emitAwareness: () => {}, setRoom: () => {},
  isApplyingRemoteRef: { current: false }, snapshot: null, people: [], connected: false,
});

export default function CollabContextProvider({ children }) {
  const [room, setRoomState] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [people, setPeople] = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const isApplyingRemoteRef = useRef(false);
  const lastCursorRef = useRef(0);
  const setRoom = useCallback((next) => {
    setRoomState((old) => old?.id === next?.id && old?.share === next?.share &&
      old?.identity === next?.identity ? old : next);
  }, []);

  useEffect(() => {
    if (!room?.id) {
      setPeople([]);
      setSnapshot(null);
      setConnected(false);
      return;
    }
    let active = true;
    let reconnect;
    let socket;
    const connect = () => {
      if (!active) return;
      socket = new WebSocket(liveUrl(room.id, room.share));
      socketRef.current = socket;
      socket.onopen = () => { if (active) setConnected(true); };
      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "presence") setPeople(message.people || []);
          if (message.type === "hello" || message.type === "snapshot")
            setSnapshot({ ...message, id: room.id });
        } catch { /* Ignore invalid live messages. */ }
      };
      socket.onclose = () => {
        if (!active) return;
        setConnected(false);
        setPeople([]);
        reconnect = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      active = false;
      clearTimeout(reconnect);
      socket?.close();
      socketRef.current = null;
    };
  }, [room]);

  const emitAwareness = useCallback((value) => {
    if (!value?.cursor || socketRef.current?.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastCursorRef.current < 50) return;
    lastCursorRef.current = now;
    socketRef.current.send(JSON.stringify({ type: "cursor", x: value.cursor.x, y: value.cursor.y }));
  }, []);
  const value = useMemo(() => ({
    emitDelta: () => {}, emitAwareness, setRoom, isApplyingRemoteRef,
    snapshot, people, connected,
  }), [emitAwareness, setRoom, snapshot, people, connected]);
  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
}
