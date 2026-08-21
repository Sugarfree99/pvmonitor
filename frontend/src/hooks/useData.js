import { useEffect, useRef, useState } from "react";

// Pollar backend-API:et och returnerar senaste ögonblicksbilden.
// Behåller föregående data vid tillfälliga fel så att skärmen inte blinkar tom.
export function useData(intervalMs = 5000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const lastGood = useRef(null);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const res = await fetch("/api/data", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!active) return;
        lastGood.current = json;
        setData(json);
        setError(false);
      } catch {
        if (!active) return;
        setError(true);
        if (lastGood.current) setData(lastGood.current);
      }
    }

    fetchData();
    const timer = setInterval(fetchData, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { data, error };
}
