import React from "react";

// Anläggningens logotyp (Räddningstjänsten Syd-emblem). Byt filen
// public/rsyd-emblem.png för att uppdatera loggan.
export default function Logo({ size = 120 }) {
  return (
    <img
      src="/rsyd-emblem.png"
      alt="Logotyp"
      style={{ height: size, width: "auto", objectFit: "contain" }}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
