// Import SDK lazy: modul ini tidak mengimpor `@peridotvault/pid-sdk-js`
// di top-level agar halaman tetap render walau SDK gagal dimuat.
// `Buffer` disediakan lewat `define` di `vite.config.ts` + shim `index.html`.

type PeridotClient = {
  auth: {
    loginPopup: (opts?: {
      clientId?: string;
      returnTo?: string;
    }) => Promise<{ pidCode?: string }>;
    logout: () => Promise<unknown>;
  };
};

type PeridotFactory = (config: { clientId: string }) => PeridotClient;

let cached: PeridotClient | null = null;
let loading: Promise<PeridotClient> | null = null;

async function loadClient(): Promise<PeridotClient> {
  if (cached) return cached;
  loading ??= (async () => {
    const clientId = import.meta.env.VITE_PERIDOT_CLIENT_ID?.trim();
    if (!clientId) {
      throw new Error(
        "VITE_PERIDOT_CLIENT_ID belum diisi. Salin .env.example menjadi .env lalu isi client ID.",
      );
    }
    const { Peridot } = (await import("@peridotvault/pid-sdk-js")) as {
      Peridot: PeridotFactory;
    };
    cached = Peridot({ clientId });
    return cached;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export async function getPeridotClient(): Promise<PeridotClient> {
  return loadClient();
}
