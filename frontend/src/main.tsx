import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers";
import { ApiGate } from "./app/ApiGate";
import App from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <ApiGate>{(health) => <App health={health} />}</ApiGate>
    </AppProviders>
  </StrictMode>
);
