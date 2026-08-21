// Syntetisk data för utveckling utan fysiska omformare (MOCK=1).
// Efterliknar en solig dag: effekten följer en klockkurva över dygnet.

const dayStart = new Date();
dayStart.setHours(0, 0, 0, 0);

function solarFactor(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  // Gaussisk kurva centrerad kl 13, bredd ~4h, noll på natten.
  const f = Math.exp(-((hour - 13) ** 2) / (2 * 3.5 ** 2));
  return hour > 5 && hour < 21 ? f : 0;
}

export function mockReading(inverter) {
  const ratedW = inverter.model?.includes("100") ? 100_000 : 30_000;
  const factor = solarFactor();
  const jitter = 0.9 + Math.random() * 0.2;
  const powerW = Math.round(ratedW * factor * jitter);

  // Ungefärliga energisummor baserat på märkeffekt.
  const energyTodayWh = Math.round(ratedW * 4.5 * (0.5 + factor));
  const energyYearWh = Math.round(ratedW * 1100);
  const energyTotalWh = Math.round(ratedW * 3200);

  return { online: true, powerW, energyTodayWh, energyYearWh, energyTotalWh };
}
