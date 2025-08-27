/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />


interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  // you can add more VITE_… variables here if you like
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
