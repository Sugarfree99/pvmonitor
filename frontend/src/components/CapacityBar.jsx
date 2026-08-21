import React from "react";
import { formatPower } from "../lib/format.js";

// Horisontell mätare: hur stor andel av installerad maxeffekt som produceras nu.
// Tydliga etiketter (titel, procent och 0–max-skala) så innebörden framgår direkt.
export default function CapacityBar({ powerW, capacityW, variant = "full" }) {
  const pct = capacityW > 0 ? Math.min(100, (powerW / capacityW) * 100) : 0;
  const cap = formatPower(capacityW);

  if (variant === "compact") {
    return (
      <div className="capbar capbar--compact">
        <div className="capbar__caplabel">
          <span>{Math.round(pct)}% av maxeffekt</span>
          <span className="capbar__capmax">
            {cap.value} {cap.unit}
          </span>
        </div>
        <div className="capbar__track">
          <div className="capbar__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="capbar">
      <div className="capbar__head">
        <span className="capbar__title">Andel av maxeffekt just nu</span>
        <span className="capbar__pct">{Math.round(pct)}%</span>
      </div>
      <div className="capbar__track">
        <div className="capbar__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="capbar__scale">
        <span>0 kW</span>
        <span>
          {cap.value} {cap.unit} (max)
        </span>
      </div>
    </div>
  );
}
