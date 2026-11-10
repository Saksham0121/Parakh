/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "false" on single-port hosts (e.g. Render free): no Socket.IO, prices and alerts are polled. */
  readonly VITE_REALTIME?: string;
}
