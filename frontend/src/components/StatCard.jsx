import React from "react";

// Ett stort mätvärde med etikett, enhet och valfri ikon.
export default function StatCard({ label, value, unit, icon, accent }) {
  return (
    <div className={`stat-card${accent ? " stat-card--accent" : ""}`}>
      {icon && <div className="stat-card__icon">{icon}</div>}
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">
        {value}
        <span className="stat-card__unit">{unit}</span>
      </div>
    </div>
  );
}
