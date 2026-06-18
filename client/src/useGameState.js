import { useState, useEffect } from 'react';

// Subscribe to the server's live game state over Server-Sent Events.
// The server pushes the full state object on every change; this screen is a
// pure renderer of it (the host control panel drives every transition).
export function useGameState() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource('/events');
    es.onmessage = (e) => {
      try { setState(JSON.parse(e.data)); setConnected(true); } catch (_) { /* ignore */ }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  return { state, connected };
}
