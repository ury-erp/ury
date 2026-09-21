/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FRAPPE_BASE_URL?: string
  readonly VITE_QZ_SIGN_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
