/// <reference types="svelte" />
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_DATA_BASE?: string;
  readonly VITE_H3T_BASE?: string;
  /** the shared Ocean Metrics feedback Apps Script /exec URL (src/lib/feedback/endpoint.ts) */
  readonly VITE_FEEDBACK_URL?: string;
}
