import React from "react";

// Stapeldiagram: producerad energi (kWh) per timme det senaste dygnet.
// Färg/höjd visar hur produktionen ändras över dagen; nuvarande timme markeras.
export default function ProductionChart({ history }) {
  if (!history || !history.hours || history.hours.length === 0) {
    return <div className="chart chart--empty">Samlar in data…</div>;
  }

  const { hours, maxKwh } = history;
  const max = maxKwh > 0 ? maxKwh : 1;
  const peak = hours.reduce((m, h) => Math.max(m, h.kwh), 0);

  return (
    <div className="chart">
      <div className="chart__yaxis">
        <span>{peak.toFixed(0)}</span>
        <span>{(peak / 2).toFixed(0)}</span>
        <span>0</span>
        <span className="chart__yunit">kWh</span>
      </div>
      <div className="chart__bars">
        {hours.map((h, i) => {
          const heightPct = (h.kwh / max) * 100;
          return (
            <div key={h.bucket} className="chart__col">
              <div className="chart__bar-wrap">
                <div
                  className={`chart__bar${h.isCurrent ? " chart__bar--current" : ""}`}
                  style={{ height: `${Math.max(heightPct, h.kwh > 0 ? 2 : 0)}%` }}
                />
              </div>
              <div className="chart__label">
                {i % 3 === 0 ? String(h.hour).padStart(2, "0") : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
