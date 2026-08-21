import React from "react";
import CapacityBar from "./CapacityBar.jsx";
import {
  formatPower,
  formatEnergyKwh,
  formatEnergyMwh,
  formatCo2
} from "../lib/format.js";

function Metric({ label, formatted }) {
  return (
    <div className="inv-metric">
      <span className="inv-metric__label">{label}</span>
      <span className="inv-metric__value">
        {formatted.value}
        <span className="inv-metric__unit">{formatted.unit}</span>
      </span>
    </div>
  );
}

// Ett kort per omformare med dess individuella mätvärden.
export default function InverterCard({ inverter, co2Factor = 0.4 }) {
  const power = formatPower(inverter.powerW);

  return (
    <div className={`inv-card${inverter.online ? "" : " inv-card--offline"}`}>
      <div className="inv-card__head">
        <div>
          <div className="inv-card__name">{inverter.name}</div>
          <div className="inv-card__model">{inverter.model}</div>
        </div>
        <span
          className={`status-dot${inverter.online ? " status-dot--on" : " status-dot--off"}`}
          title={inverter.online ? "Online" : "Offline"}
        />
      </div>

      <div className="inv-card__power">
        <div className="inv-card__power-label">Aktuell effekt</div>
        <div className="inv-card__power-value">
          {power.value}
          <span className="inv-card__power-unit">{power.unit}</span>
        </div>
      </div>

      <CapacityBar powerW={inverter.powerW} capacityW={inverter.capacityW} />

      <div className="inv-card__metrics">
        <Metric label="Idag" formatted={formatEnergyKwh(inverter.energyTodayWh)} />
        <Metric label="I år" formatted={formatEnergyMwh(inverter.energyYearWh)} />
        <Metric label="Totalt" formatted={formatEnergyMwh(inverter.energyTotalWh)} />
        <Metric
          label="Minskad CO₂"
          formatted={formatCo2((inverter.energyTotalWh / 1000) * co2Factor)}
        />
      </div>
    </div>
  );
}
