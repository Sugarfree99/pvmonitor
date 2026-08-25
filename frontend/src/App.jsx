import React, { useEffect, useState } from "react";
import { useData } from "./hooks/useData.js";
import { useHistory } from "./hooks/useHistory.js";
import OverviewView from "./components/OverviewView.jsx";
import ProductionView from "./components/ProductionView.jsx";
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
      <span className="clock__date">
        {now.toLocaleDateString("sv-SE", {
          weekday: "short",
          day: "numeric",
          month: "short"
        })}
      </span>
      <span className="clock__time">
        {now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
      </span>
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
  const history = useHistory(60000);
  // Valfri ?view=N låser en specifik vy och pausar rotationen (demo/skärmdump).
  const forcedView = new URLSearchParams(window.location.search).get("view");
  const [index, setIndex] = useState(forcedView !== null ? Number(forcedView) : 0);
  const status = useStatus(data, error, lastUpdated);
  // Ingen aktuell kontakt med servern → data är inaktuell (visa som offline).
  const stale = status?.level === "error";

  // Bygg listan med vyer: översikt, produktion idag, en vy per anläggning.
  const views = [];
  if (data) {
    views.push(<OverviewView key="overview" snapshot={data} />);
    views.push(
      <ProductionView key="production" history={history} snapshot={data} />
    );
    for (const site of data.sites) {
      // Dölj anläggningar utan aktiva omformare från karusellen.
      if (site.invertersTotal === 0) continue;
      views.push(
        <SiteView
          key={site.id}
          site={site}
          co2Factor={data.co2FactorKgPerKwh}
          stale={stale}
        />
      );
    }
  }

  useEffect(() => {
    if (forcedView !== null) return; // pausad på en vald vy
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
        <div className="supplier">
          <img className="supplier__rsyd" src="/rsyd-emblem.png" alt="Räddningstjänsten Syd" />
          <img className="supplier__logo" src="/bbk-logo.png" alt="Bredbandskompetens" />
        </div>
        <Clock />
      </footer>
    </div>
  );
}
