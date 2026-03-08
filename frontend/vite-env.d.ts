/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_MOCK?: string;
  readonly VITE_TOWER_BATCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/// <reference types="react" />
/// <reference types="react-dom" />


interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  // you can add more VITE_… variables here if you like
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
