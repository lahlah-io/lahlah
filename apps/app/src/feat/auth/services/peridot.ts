import { Peridot } from "@peridotvault/pid-sdk-js";

let cached: ReturnType<typeof Peridot> | null = null;

/**
 * Singleton klien PeridotID browser. `clientId` dari `VITE_PERIDOT_CLIENT_ID`;
 * env otomatis sandbox di dev, production di build production.
 */
export function getPeridotClient() {
  if (!cached) {
    const clientId = import.meta.env.VITE_PERIDOT_CLIENT_ID?.trim();
    if (!clientId) {
      throw new Error(
        "VITE_PERIDOT_CLIENT_ID belum diisi. Salin .env.example menjadi .env lalu isi client ID.",
      );
    }
    cached = Peridot({ clientId });
  }
  return cached;
}
