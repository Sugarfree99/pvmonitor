const nf = (digits) =>
  new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });

// Effekt: W → kW (eller MW för stora anläggningar).
export function formatPower(watt) {
  const kw = watt / 1000;
  if (Math.abs(kw) >= 1000) {
    return { value: nf(2).format(kw / 1000), unit: "MW" };
  }
  return { value: nf(1).format(kw), unit: "kW" };
}

// Energi idag: Wh → kWh.
export function formatEnergyKwh(wh) {
  return { value: nf(1).format(wh / 1000), unit: "kWh" };
}

// Energi i år / totalt: Wh → MWh.
export function formatEnergyMwh(wh) {
  return { value: nf(2).format(wh / 1_000_000), unit: "MWh" };
}

// CO2: kg → ton när det blir stort.
export function formatCo2(kg) {
  if (Math.abs(kg) >= 1000) {
    return { value: nf(2).format(kg / 1000), unit: "ton" };
  }
  return { value: nf(0).format(kg), unit: "kg" };
}
