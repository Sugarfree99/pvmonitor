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

// Räknar ut synligt status-meddelande utifrån serverns nåbarhet och omformarnas
// online-status. Returnerar null när allt är normalt (ingen banner visas).
function useStatus(data, error, lastUpdated) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ageSec = lastUpdated ? Math.floor((now - lastUpdated) / 1000) : null;
  const lastTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("sv-SE")
    : null;

  // Ingen kontakt med servern på en stund → visa tydlig varning.
  if (error && ageSec !== null && ageSec > 20) {
    return {
      level: "error",
      text: `Ingen kontakt med servern – visar senast kända värden (uppdaterades ${lastTime})`
    };
  }

  // Någon omformare svarar inte på Modbus.
  if (data && data.invertersOnline < data.invertersTotal) {
    const offline = data.invertersTotal - data.invertersOnline;
    return {
      level: "warn",
      text: `${offline} av ${data.invertersTotal} omformare offline – kontrollera nätverk/omformare`
    };
  }

  return null;
}

export default function App() {
  const { data, error, lastUpdated } = useData(5000);
  const [index, setIndex] = useState(0);
  const status = useStatus(data, error, lastUpdated);

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
      {status && (
        <div className={`top-banner top-banner--${status.level}`}>
          <span className="top-banner__dot" />
          {status.text}
        </div>
      )}

      <div className="stage">
        <div key={safeIndex} className="stage__view fade-in">
          {views[safeIndex]}
        </div>
      </div>

      <footer className="app__footer">
        <div className="reseller">
          <span className="reseller__label">Förmedlas av</span>
          <img
            src="/bbk-logo.svg"
            alt="BBK Group"
            className="reseller__logo"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
        <div className="dots">
          {views.map((_, i) => (
            <span
              key={i}
              className={`dot${i === safeIndex ? " dot--active" : ""}`}
            />
          ))}
        </div>
        {lastUpdated && (
          <div className={`updated${error ? " updated--stale" : ""}`}>
            {error ? "Uppdaterar…" : "Uppdaterad"}{" "}
            {new Date(lastUpdated).toLocaleTimeString("sv-SE")}
          </div>
        )}
        <Clock />
      </footer>
    </div>
  );
}
