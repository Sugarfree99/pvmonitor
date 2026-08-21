import ModbusRTU from "modbus-serial";
import { getProfile } from "./registerProfiles.js";

const WORD_COUNT = {
  float32: 2,
  int32: 2,
  uint32: 2,
  int16: 1,
  uint16: 1
};

function decode(words, type, wordSwap) {
  const buf = Buffer.alloc(words.length * 2);
  const ordered = wordSwap && words.length === 2 ? [words[1], words[0]] : words;
  ordered.forEach((w, i) => buf.writeUInt16BE(w & 0xffff, i * 2));

  switch (type) {
    case "float32":
      return buf.readFloatBE(0);
    case "int32":
      return buf.readInt32BE(0);
    case "uint32":
      return buf.readUInt32BE(0);
    case "int16":
      return buf.readInt16BE(0);
    case "uint16":
      return buf.readUInt16BE(0);
    default:
      throw new Error(`Okänd registertyp: ${type}`);
  }
}

export class KostalClient {
  constructor(inverter) {
    this.inverter = inverter;
    this.profile = getProfile(inverter.profile);
    this.client = new ModbusRTU();
  }

  async connect() {
    this.client.setID(this.inverter.unitId);
    this.client.setTimeout(3000);
    await this.client.connectTCP(this.inverter.host, { port: this.inverter.port });
  }

  async readMetric(metric) {
    const count = WORD_COUNT[metric.type];
    const res = await this.client.readHoldingRegisters(metric.address, count);
    const wordSwap = metric.wordSwap ?? this.profile.wordSwap ?? false;
    const value = decode(res.data.slice(0, count), metric.type, wordSwap);
    return value * (metric.scale ?? 1);
  }

  async readAll() {
    const { metrics } = this.profile;
    const out = {};
    for (const [name, metric] of Object.entries(metrics)) {
      out[name] = await this.readMetric(metric);
    }
    return out;
  }

  async close() {
    try {
      if (this.client.isOpen) {
        await new Promise((resolve) => this.client.close(resolve));
      }
    } catch {
      // Ignorera stängningsfel – anslutningen kastas ändå bort.
    }
  }
}

// Läser en omformare en gång: öppnar anslutning, hämtar alla metriker, stänger.
export async function readInverter(inverter) {
  const client = new KostalClient(inverter);
  try {
    await client.connect();
    const values = await client.readAll();
    return { online: true, ...values };
  } finally {
    await client.close();
  }
}
