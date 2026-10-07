/// <reference types="svelte" />
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_DATA_BASE?: string;
  readonly VITE_H3T_BASE?: string;
}
