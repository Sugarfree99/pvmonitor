import React from "react";
import InverterCard from "./InverterCard.jsx";
import { formatPower, formatEnergyKwh } from "../lib/format.js";

// Vy 2 & 3: En anläggning (SOS eller RSYD) med dess omformare sida vid sida
// plus en sammanställd rad för hela anläggningen.
export default function SiteView({ site, co2Factor, stale = false }) {
  const power = formatPower(site.powerW);
  const today = formatEnergyKwh(site.energyTodayWh);
  const count = site.inverters.length;

  return (
    <section className="view view--site">
      <header className="view__header">
        <h1 className="view__title">{site.name}-anläggningen</h1>
        <div className="view__summary">
          <span>
            {power.value} <em>{power.unit}</em> nu
          </span>
          <span className="view__summary-sep">·</span>
          <span>
            {today.value} <em>{today.unit}</em> idag
          </span>
        </div>
      </header>

      <div className={`inv-row inv-row--${count > 1 ? "multi" : "single"}`}>
        {site.inverters.map((inv) => (
          <InverterCard
            key={inv.id}
            inverter={inv}
            co2Factor={co2Factor}
            stale={stale}
          />
        ))}
      </div>
    </section>
  );
}
