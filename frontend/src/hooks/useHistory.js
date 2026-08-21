import { useEffect, useState } from "react";

// Hämtar timvis produktionshistorik för stapeldiagrammet (uppdateras sällan).
export function useHistory(intervalMs = 60000) {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let active = true;

    async function fetchHistory() {
      try {
        const res = await fetch("/api/history?hours=24", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (active) setHistory(json);
      } catch {
        /* behåll föregående vid tillfälligt fel */
      }
    }

    fetchHistory();
    const timer = setInterval(fetchHistory, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return history;
}
