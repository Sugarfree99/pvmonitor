import React from "react";
import StatCard from "./StatCard.jsx";
import Logo from "./Logo.jsx";
import CapacityBar from "./CapacityBar.jsx";
import {
  formatPower,
  formatEnergyKwh,
  formatEnergyMwh,
  formatCo2
} from "../lib/format.js";

// Vy 1: Huvudöversikt över hela fastigheten.
export default function OverviewView({ snapshot }) {
  const t = snapshot.totals;
  const power = formatPower(t.powerW);
  const today = formatEnergyKwh(t.energyTodayWh);
  const year = formatEnergyMwh(t.energyYearWh);
  const total = formatEnergyMwh(t.energyTotalWh);
  const co2 = formatCo2(t.co2SavedKg);

  return (
    <section className="view view--overview">
      <header className="view__header">
        <Logo size={110} />
        <h1 className="view__title">Solproduktion – hela fastigheten</h1>
      </header>

      <div className="hero">
        <div className="hero__label">Effekt just nu</div>
        <div className="hero__value">
          {power.value}
          <span className="hero__unit">{power.unit}</span>
        </div>
      </div>

      <div className="hero-capbar">
        <CapacityBar powerW={t.powerW} capacityW={t.capacityW} />
      </div>

      <div className="stat-grid stat-grid--4">
        <StatCard label="Energi idag" value={today.value} unit={today.unit} icon="☀️" />
        <StatCard label="Energi i år" value={year.value} unit={year.unit} icon="📅" />
        <StatCard label="Totalt producerat" value={total.value} unit={total.unit} icon="⚡" />
        <StatCard label="Minskad CO₂" value={co2.value} unit={co2.unit} icon="🌱" accent />
      </div>
    </section>
  );
}
