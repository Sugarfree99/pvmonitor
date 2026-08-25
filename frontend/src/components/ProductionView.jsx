import React from "react";
import ProductionChart from "./ProductionChart.jsx";
import { formatEnergyKwh, formatPower } from "../lib/format.js";

// Vy: produktionsförlopp över dygnet som stapeldiagram.
export default function ProductionView({ history, snapshot }) {
  const today = formatEnergyKwh(snapshot.totals.energyTodayWh);
  const power = formatPower(snapshot.totals.powerW);

  return (
    <section className="view view--production">
      <header className="view__header">
        <h1 className="view__title">Produktion idag</h1>
        <div className="view__summary">
          <span>
            {power.value} <em>{power.unit}</em> nu
          </span>
          <span className="view__summary-sep">·</span>
          <span>
            {today.value} <em>{today.unit}</em> totalt idag
          </span>
        </div>
      </header>
      <ProductionChart history={history} />
    </section>
  );
}
