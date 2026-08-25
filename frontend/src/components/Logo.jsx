import React from "react";

// Anläggningens logotyp (Räddningstjänsten Syd-emblem). Byt filen
// public/rsyd-emblem.png för att uppdatera loggan.
export default function Logo({ size = 120 }) {
  return (
    <img
      src="/rsyd-shield.png"
      alt="Räddningstjänsten Syd"
      style={{ height: size, width: "auto", objectFit: "contain" }}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
