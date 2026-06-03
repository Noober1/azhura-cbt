/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** HTTP API base URL, e.g. http://localhost:3000/api */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
