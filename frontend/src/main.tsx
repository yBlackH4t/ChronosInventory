import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers";
import { ApiGate } from "./app/ApiGate";
import App from "./app/App";

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <ApiGate>{(health) => <App health={health} />}</ApiGate>
    </AppProviders>
  </StrictMode>,
);
