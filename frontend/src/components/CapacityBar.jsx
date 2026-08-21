import React from "react";
import { formatPower } from "../lib/format.js";

// Horisontell stapel: aktuell effekt som andel av installerad kapacitet.
// Visar direkt "hur den ligger till" relativt maxeffekt just nu.
export default function CapacityBar({ powerW, capacityW, showLabels = true }) {
  const pct = capacityW > 0 ? Math.min(100, (powerW / capacityW) * 100) : 0;
  const cap = formatPower(capacityW);

  return (
    <div className="capbar">
      {showLabels && (
        <div className="capbar__top">
          <span className="capbar__pct">{Math.round(pct)}%</span>
          <span className="capbar__cap">
            av {cap.value} {cap.unit} installerat
          </span>
        </div>
      )}
      <div className="capbar__track">
        <div className="capbar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
