import { createApiClient } from "./api";

const baseUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const api = createApiClient(baseUrl);
