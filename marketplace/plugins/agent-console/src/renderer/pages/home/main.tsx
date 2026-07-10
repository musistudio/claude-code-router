import React from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/lib/i18n";
import App from "./App";
import { initializeToolHubSandboxHost } from "./toolhub-sandbox-host";
import "@/styles/globals.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

initializeToolHubSandboxHost();

createRoot(container).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>
);
