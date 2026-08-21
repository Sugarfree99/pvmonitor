// Modbus-registerprofiler per omformartyp.
//
// VIKTIGT: Standardvärdena nedan följer KOSTAL:s float32-registerkarta
// (PIKO IQ / PLENTICORE / PIKO CI, "Modbus TCP interface"). Verifiera dem mot
// KOSTAL:s officiella Modbus-dokument för just CI 30 / CI 100 och justera vid
// behov. Alla adresser är 0-baserade holding-register (funktionskod 03).
//
// Metriktyper som stöds av läsaren (se ./kostal.js):
//   float32 | int32 | uint32 | int16 | uint16
// Fält per metrik:
//   address   – 0-baserad registeradress
//   type      – datatyp enligt ovan
//   scale     – multiplikator som appliceras på råvärdet (default 1)
//   wordSwap  – true om de två 16-bitsorden ska bytas (little-endian ordföljd)

export const registerProfiles = {
  "kostal-ci": {
    registerType: "holding",
    wordSwap: false,
    metrics: {
      // Aktuell total AC-effekt [W]
      powerW: { address: 172, type: "float32" },
      // Total producerad energi sedan installation [Wh]
      energyTotalWh: { address: 320, type: "float32" },
      // Producerad energi i år [Wh]
      energyYearWh: { address: 322, type: "float32" },
      // Producerad energi idag [Wh]
      energyTodayWh: { address: 326, type: "float32" }
    }
  }
};

export function getProfile(name) {
  const profile = registerProfiles[name];
  if (!profile) {
    throw new Error(`Okänd registerprofil: ${name}`);
  }
  return profile;
}
