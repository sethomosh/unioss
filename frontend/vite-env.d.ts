/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  // you can add more VITE_… variables here if you like
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
