interface ImportMetaEnv {
  /** Base URL API Lahlah, mis. `http://localhost:8787`. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
