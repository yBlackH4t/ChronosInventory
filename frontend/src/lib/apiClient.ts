import { createApiClient } from "./api";

// O Chronos usa a porta 8000; se outro programa ocupar, o desktop escolhe outra e avisa aqui.
const injectedPort = (window as { __CHRONOS_API_PORT__?: number }).__CHRONOS_API_PORT__;

export const baseUrl =
  import.meta.env.VITE_API_URL || `http://127.0.0.1:${injectedPort || 8000}`;

export const api = createApiClient(baseUrl);
