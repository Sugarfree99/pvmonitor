import React from "react";

// Platshållarlogotyp. Ersätt filen public/logo.svg med kundens riktiga logga,
// eller byt ut den här komponenten mot en <img src="/logo.svg" />.
export default function Logo({ size = 120 }) {
  return (
    <img
      src="/logo.svg"
      alt="Logotyp"
      style={{ height: size, width: "auto", objectFit: "contain" }}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
