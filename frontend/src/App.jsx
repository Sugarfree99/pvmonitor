import React, { useEffect, useState } from "react";
import { useData } from "./hooks/useData.js";
import OverviewView from "./components/OverviewView.jsx";
import SiteView from "./components/SiteView.jsx";

const ROTATE_MS = 15_000;

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="clock">
      {now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}

export default function App() {
  const { data, error } = useData(5000);
  const [index, setIndex] = useState(0);

  // Bygg listan med vyer: översikt + en vy per anläggning.
  const views = [];
  if (data) {
    views.push(<OverviewView key="overview" snapshot={data} />);
    for (const site of data.sites) {
      views.push(
        <SiteView key={site.id} site={site} co2Factor={data.co2FactorKgPerKwh} />
      );
    }
  }

  useEffect(() => {
    if (views.length <= 1) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % views.length),
      ROTATE_MS
    );
    return () => clearInterval(timer);
  }, [views.length]);

  if (!data) {
    return (
      <div className="app app--loading">
        <div className="spinner" />
        <p>Ansluter till solcellsanläggningen…</p>
      </div>
    );
  }

  const safeIndex = index % views.length;

  return (
    <div className="app">
      <div className="stage">
        <div key={safeIndex} className="stage__view fade-in">
          {views[safeIndex]}
        </div>
      </div>

      <footer className="app__footer">
        <div className="dots">
          {views.map((_, i) => (
            <span
              key={i}
              className={`dot${i === safeIndex ? " dot--active" : ""}`}
            />
          ))}
        </div>
        {error && <div className="stale-badge">Uppdaterar…</div>}
        <Clock />
      </footer>
    </div>
  );
}
